import logging

from odoo import SUPERUSER_ID, _, fields, models
from odoo.exceptions import AccessError, UserError


_logger = logging.getLogger(__name__)

_EPS = 0.01
_COLOR_ORANGE = 2
_COLOR_YELLOW_GREEN = 5


class ShopfloorReportingCorrectionService(models.AbstractModel):
    _name = "shopfloor.reporting.correction.service"
    _description = "Corectare sigură raportări cantitative Shopfloor"

    def _check_access(self):
        if self.env.su:
            return
        if not self.env.user.has_group("mrp.group_mrp_manager"):
            raise AccessError(
                _(
                    "Doar utilizatorii cu drepturi de administrator Producție pot "
                    "corecta raportările istorice."
                )
            )

    def _model(self, model_name):
        if model_name not in self.env.registry.models:
            return False
        return self.env[model_name].with_user(SUPERUSER_ID).sudo()

    def _has(self, rec, field_name):
        return bool(rec) and field_name in rec._fields

    def _float(self, rec, field_name, default=0.0):
        try:
            if self._has(rec, field_name):
                return float(rec[field_name] or 0.0)
        except Exception:
            pass
        return float(default or 0.0)

    def _slot_is_main_production(self, slot):
        if not slot:
            return False
        if self._has(slot, "x_plan_type") and slot.x_plan_type not in (False, "dynamic"):
            return False
        if self._has(slot, "x_activity_type") and slot.x_activity_type not in (False, "production"):
            return False
        if self._has(slot, "x_is_helper") and slot.x_is_helper:
            return False
        if self._has(slot, "x_is_helper_interval") and slot.x_is_helper_interval:
            return False
        if self._has(slot, "x_is_other_operation_interval") and slot.x_is_other_operation_interval:
            return False
        return True

    def _production_slots(self, workorder):
        Slot = self._model("x_wo_emp_slot")
        if not Slot or not workorder:
            return Slot.browse([]) if Slot else False

        domain = [("x_workorder_id", "=", workorder.id)]
        if "x_state" in Slot._fields:
            domain.append(("x_state", "=", "done"))
        slots = Slot.search(domain, order="x_date_start asc, id asc")
        return slots.filtered(self._slot_is_main_production)

    def _running_refs(self, workorder):
        result = []

        Log = self._model("x_wo_time_log")
        if Log:
            domain = [("x_workorder_id", "=", workorder.id)]
            if "x_state" in Log._fields:
                domain.append(("x_state", "in", ["running", "pause"]))
            logs = Log.search(domain)
            if logs:
                result.append("loguri %s" % ", ".join(map(str, logs.ids)))

        Session = self._model("x_shopfloor_session")
        if Session:
            sessions = Session.search([
                ("x_workorder_id", "=", workorder.id),
                ("x_state", "=", "active"),
            ])
            running_sessions = sessions.filtered(
                lambda s: not self._has(s, "x_ui_state") or s.x_ui_state == "running"
            )
            if running_sessions:
                result.append("sesiuni %s" % ", ".join(map(str, running_sessions.ids)))

        Prod = self.env["mrp.workcenter.productivity"].with_user(SUPERUSER_ID).sudo()
        open_prod = Prod.search([
            ("workorder_id", "=", workorder.id),
            ("date_end", "=", False),
        ])
        if open_prod:
            result.append("productivity %s" % ", ".join(map(str, open_prod.ids)))

        return result

    def _successors(self, workorder, dispatch_service=None):
        if not workorder or not workorder.production_id:
            return self.env["mrp.workorder"].browse([])
        dispatch_service = dispatch_service or self.env[
            "shopfloor.live.dispatch.service"
        ].with_user(SUPERUSER_ID).sudo()
        result = self.env["mrp.workorder"].browse([])
        for candidate in workorder.production_id.workorder_ids:
            if candidate == workorder:
                continue
            try:
                if workorder in dispatch_service._wo_predecessors(candidate):
                    result |= candidate
            except Exception:
                continue
        return result

    def _corrected_state_for_workorder(self, workorder, corrected_total, target, dispatch_service):
        if corrected_total + _EPS >= target:
            return "done"

        predecessors = dispatch_service._wo_predecessors(workorder)
        if not predecessors:
            return "ready"

        released = min(
            [dispatch_service._done_qty(pred) for pred in predecessors] or [0.0]
        )
        return "ready" if released - corrected_total > _EPS else "pending"

    def _gantt_values(self, slot, workorder, corrected_interval_qty, dispatch_service):
        target = max(dispatch_service._target_qty(workorder), 0.0)
        planned = self._float(slot, "x_duration_expected", 0.0)
        actual = self._float(slot, "x_minutes", 0.0)

        if actual <= 0.0 and self._has(slot, "x_date_start") and self._has(slot, "x_date_end"):
            if slot.x_date_start and slot.x_date_end and slot.x_date_end > slot.x_date_start:
                actual = (slot.x_date_end - slot.x_date_start).total_seconds() / 60.0

        proportional = planned
        if target > 0.0 and planned > 0.0:
            ratio = max(0.0, min(float(corrected_interval_qty or 0.0) / target, 1.0))
            proportional = planned * ratio

        if proportional > 0.0 and actual > proportional + 0.01:
            return {
                "x_gantt_status": "incomplete_slow",
                "x_gantt_color": _COLOR_ORANGE,
            }
        return {
            "x_gantt_status": "incomplete_fast",
            "x_gantt_color": _COLOR_YELLOW_GREEN,
        }

    def _bonus_preview(self, slot):
        Line = self._model("employee.bonus.operation.line")
        if not Line:
            return {
                "line_count": 0,
                "dates": [],
                "text": _(
                    "Bonusarea nu este instalată sau nu este disponibilă; "
                    "viitoarele importuri vor folosi cantitatea corectată din slot."
                ),
            }

        lines = Line.search([
            ("source_model", "=", "x_wo_emp_slot"),
            ("source_record_id", "=", str(slot.id)),
        ])
        dates = sorted({fields.Date.to_date(line.date) for line in lines if line.date})
        if lines:
            return {
                "line_count": len(lines),
                "dates": dates,
                "text": _(
                    "Există %(count)s linie/linii deja importate în bonusare. "
                    "Cantitatea și ciclurile vor fi corectate automat, iar "
                    "statisticile zilnice pentru %(dates)s vor fi reconstruite."
                ) % {
                    "count": len(lines),
                    "dates": ", ".join(fields.Date.to_string(day) for day in dates) or "-",
                },
            }
        return {
            "line_count": 0,
            "dates": [],
            "text": _(
                "Nu există încă linii importate în bonusare pentru acest interval. "
                "Orice import viitor va citi direct cantitatea corectată."
            ),
        }

    def _prepare(self, slot_id, corrected_interval_qty=None, strict=False):
        self._check_access()
        Slot = self._model("x_wo_emp_slot")
        if not Slot:
            raise UserError(_("Modelul de planificare dinamică nu este disponibil."))

        slot = Slot.browse(int(slot_id or 0)).exists()
        if not slot:
            raise UserError(_("Intervalul selectat nu mai există."))
        if not self._has(slot, "x_workorder_id") or not slot.x_workorder_id:
            raise UserError(_("Intervalul nu este legat de o operațiune de producție."))
        if self._has(slot, "x_state") and slot.x_state != "done":
            raise UserError(_("Poate fi corectat doar un interval deja finalizat."))
        if not self._slot_is_main_production(slot):
            raise UserError(_("Intervalele de ajutor/alte activități nu se corectează prin acest flux."))
        if not self._has(slot, "x_interval_qty_done"):
            raise UserError(_("Intervalul nu are câmpul «Bucăți realizate interval»."))

        workorder = slot.x_workorder_id.with_user(SUPERUSER_ID).sudo()
        production = workorder.production_id.with_user(SUPERUSER_ID).sudo()
        if not production or production.state in ("done", "cancel"):
            raise UserError(
                _(
                    "Comanda de producție este deja finalizată/anulată. Corecția "
                    "automată nu modifică stocuri sau evaluări deja închise."
                )
            )

        running = self._running_refs(workorder)
        if running:
            raise UserError(
                _(
                    "Operațiunea are încă activitate deschisă (%(details)s). "
                    "Opriți mai întâi operațiunea și apoi reluați corecția."
                ) % {"details": "; ".join(running)}
            )

        dispatch = self.env["shopfloor.live.dispatch.service"].with_user(
            SUPERUSER_ID
        ).sudo()
        target = max(dispatch._target_qty(workorder), 0.0)
        old_interval = self._float(slot, "x_interval_qty_done", 0.0)
        slots = self._production_slots(workorder)
        slot_sum = sum(self._float(item, "x_interval_qty_done", 0.0) for item in slots)
        current_done = max(dispatch._done_qty(workorder), 0.0)

        if abs(slot_sum - current_done) > _EPS:
            raise UserError(
                _(
                    "Istoricul intervalelor (%(slots).2f buc.) nu corespunde cu "
                    "progresul operațiunii (%(wo).2f buc.). Corecția automată a "
                    "fost oprită pentru a nu crea o inconsistență."
                ) % {"slots": slot_sum, "wo": current_done}
            )

        if corrected_interval_qty is None:
            corrected_interval_qty = old_interval
        try:
            corrected_interval_qty = float(corrected_interval_qty or 0.0)
        except Exception as exc:
            raise UserError(_("Cantitatea corectată nu este validă.")) from exc

        if corrected_interval_qty < -_EPS:
            raise UserError(_("Cantitatea corectată nu poate fi negativă."))
        if corrected_interval_qty > old_interval + _EPS:
            raise UserError(
                _(
                    "Acest flux este destinat corectării supra-raportărilor și "
                    "poate doar reduce cantitatea intervalului. Pentru bucăți "
                    "suplimentare folosiți fluxul normal de producție."
                )
            )

        corrected_interval_qty = max(corrected_interval_qty, 0.0)
        corrected_total = current_done - old_interval + corrected_interval_qty
        corrected_total = max(corrected_total, 0.0)

        successors = self._successors(workorder, dispatch)
        successor_rows = []
        for successor in successors:
            successor_done = max(dispatch._done_qty(successor), 0.0)
            if corrected_total + _EPS < successor_done:
                raise UserError(
                    _(
                        "Corecția ar lăsa operațiunea următoare «%(name)s» cu "
                        "%(next).2f buc. deja realizate, dar numai %(current).2f "
                        "buc. disponibile din operațiunea corectată. Cantitatea "
                        "corectată trebuie să păstreze cel puțin progresul deja "
                        "consumat în aval."
                    ) % {
                        "name": successor.name,
                        "next": successor_done,
                        "current": corrected_total,
                    }
                )
            successor_rows.append((successor, successor_done))

        if corrected_total + _EPS < target and not successors:
            raise UserError(
                _(
                    "Aceasta este ultima operațiune a comenzii. Reducerea ei poate "
                    "necesita anularea/reversarea mișcărilor de stoc și nu este "
                    "permisă de corecția automată."
                )
            )

        if strict and abs(corrected_interval_qty - old_interval) <= _EPS:
            raise UserError(_("Introduceți o cantitate diferită de cea raportată inițial."))

        bonus = self._bonus_preview(slot)

        downstream_lines = []
        for successor, successor_done in successor_rows:
            future_available = max(corrected_total - successor_done, 0.0)
            downstream_lines.append(
                _("%(name)s: realizat %(done).2f, disponibil după corecție %(available).2f")
                % {
                    "name": successor.name,
                    "done": successor_done,
                    "available": future_available,
                }
            )

        return {
            "slot": slot,
            "workorder": workorder,
            "production": production,
            "dispatch": dispatch,
            "target": target,
            "old_interval": old_interval,
            "current_done": current_done,
            "corrected_interval": corrected_interval_qty,
            "corrected_total": corrected_total,
            "successors": successors,
            "downstream_text": "\n".join(downstream_lines) or _("Nu există operațiuni următoare afectate."),
            "bonus": bonus,
        }

    def preview(self, slot_id, corrected_interval_qty=None):
        info = self._prepare(slot_id, corrected_interval_qty, strict=False)
        slot = info["slot"]
        workorder = info["workorder"]
        production = info["production"]
        return {
            "slot_name": slot.display_name,
            "employee_name": (
                slot.x_employee_id.display_name
                if self._has(slot, "x_employee_id") and slot.x_employee_id
                else False
            ),
            "workorder_name": workorder.display_name,
            "production_name": production.name,
            "operation_name": workorder.name,
            "old_interval_qty": info["old_interval"],
            "corrected_interval_qty": info["corrected_interval"],
            "current_workorder_done": info["current_done"],
            "corrected_workorder_done": info["corrected_total"],
            "target_qty": info["target"],
            "downstream_summary": info["downstream_text"],
            "bonus_summary": info["bonus"]["text"],
        }

    def _update_bonus(self, slot, corrected_interval_qty):
        Line = self._model("employee.bonus.operation.line")
        if not Line:
            return {"lines": [], "dates": []}

        lines = Line.search([
            ("source_model", "=", "x_wo_emp_slot"),
            ("source_record_id", "=", str(slot.id)),
        ])
        if not lines:
            return {"lines": [], "dates": []}

        adapter = self._model("employee.bonus.source.adapter")
        dates = set()
        for line in lines:
            cycle_count = corrected_interval_qty
            if adapter and hasattr(adapter, "_slot_actual_cycle_count"):
                try:
                    cycle_count = adapter._slot_actual_cycle_count(
                        slot,
                        corrected_interval_qty,
                    )
                except Exception:
                    cycle_count = corrected_interval_qty

            line.with_context(
                bonus_real_data_import=True,
                bonus_skip_manual_marker=True,
            ).write({
                "completed_quantity": corrected_interval_qty,
                "actual_cycle_count": max(float(cycle_count or 0.0), 0.0),
            })
            if line.date:
                dates.add(fields.Date.to_date(line.date))

        Stat = self._model("employee.bonus.operation.daily.stat")
        if Stat:
            for work_date in sorted(dates):
                try:
                    if hasattr(Stat, "refresh_rolling_window_for_day"):
                        Stat.refresh_rolling_window_for_day(work_date)
                    elif hasattr(Stat, "refresh_single_day_from_bonus_lines"):
                        Stat.refresh_single_day_from_bonus_lines(work_date)
                except Exception:
                    _logger.exception(
                        "SHOPFLOOR_REPORTING_CORRECTION: failed to refresh bonus stats for %s",
                        work_date,
                    )
                    raise

        return {"lines": lines.ids, "dates": sorted(dates)}

    def apply(self, slot_id, corrected_interval_qty, reason):
        self._check_access()
        reason = (reason or "").strip()
        if not reason:
            raise UserError(_("Motivul corecției este obligatoriu."))

        info = self._prepare(slot_id, corrected_interval_qty, strict=True)
        slot = info["slot"]
        workorder = info["workorder"]
        production = info["production"]
        dispatch = info["dispatch"]
        target = info["target"]
        corrected_total = info["corrected_total"]

        old_interval = info["old_interval"]
        old_total = info["current_done"]
        old_state = workorder.state

        gantt_vals = self._gantt_values(
            slot,
            workorder,
            info["corrected_interval"],
            dispatch,
        )
        slot_vals = {"x_interval_qty_done": info["corrected_interval"]}
        if self._has(slot, "x_gantt_status"):
            slot_vals["x_gantt_status"] = gantt_vals["x_gantt_status"]
        if self._has(slot, "x_gantt_color"):
            slot_vals["x_gantt_color"] = gantt_vals["x_gantt_color"]

        slot.with_context(
            no_overlap_check=True,
            skip_overlap_guard=True,
            slot_sync_running=True,
            wo_done_reconcile_running=True,
        ).write(slot_vals)

        wo_vals = {}
        if self._has(workorder, "x_dispatch_qty_done"):
            wo_vals["x_dispatch_qty_done"] = corrected_total
        else:
            raise UserError(_("Operațiunea nu are câmpul de progres Worker Hub."))

        new_state = self._corrected_state_for_workorder(
            workorder,
            corrected_total,
            target,
            dispatch,
        )

        if corrected_total + _EPS < target:
            # Reproduce the normal partial-dispatch shape: x_dispatch_qty_done is
            # authoritative, while native qty_produced is kept at zero until the
            # operation is genuinely complete.
            if self._has(workorder, "qty_produced"):
                wo_vals["qty_produced"] = 0.0
            if self._has(workorder, "state"):
                wo_vals["state"] = new_state

        workorder.write(wo_vals)
        workorder.invalidate_recordset()

        successor_changes = []
        for successor in info["successors"]:
            successor.invalidate_recordset()
            if successor.state in ("done", "cancel", "progress"):
                continue
            available = dispatch._available_qty_for_workorder(successor)
            wanted_state = "ready" if available > _EPS else "pending"
            if successor.state != wanted_state:
                previous_state = successor.state
                successor.write({"state": wanted_state})
                successor_changes.append(
                    (successor.id, previous_state, wanted_state, available)
                )

        # Force stored Studio progress fields to observe the corrected WO values
        # when they are backed by a compute method.
        try:
            progress_field = production._fields.get("x_progress_pct")
            if progress_field and getattr(progress_field, "compute", False):
                production._recompute_recordset(["x_progress_pct"])
        except Exception:
            _logger.exception(
                "SHOPFLOOR_REPORTING_CORRECTION: x_progress_pct recompute failed for mo=%s",
                production.id,
            )
            raise

        bonus_result = self._update_bonus(slot, info["corrected_interval"])

        production.invalidate_recordset()
        workorder.invalidate_recordset()
        slot.invalidate_recordset()

        # Final consistency guard after all writes.
        slot_sum_after = sum(
            self._float(item, "x_interval_qty_done", 0.0)
            for item in self._production_slots(workorder)
        )
        wo_done_after = dispatch._done_qty(workorder)
        if abs(slot_sum_after - corrected_total) > _EPS or abs(wo_done_after - corrected_total) > _EPS:
            raise UserError(
                _(
                    "Verificarea finală a corecției a eșuat. Modificările vor fi "
                    "anulate automat."
                )
            )

        # Re-check every immediate downstream quantity constraint after the write.
        for successor in info["successors"]:
            successor_done = dispatch._done_qty(successor)
            if successor_done > corrected_total + _EPS:
                raise UserError(
                    _(
                        "După corecție, operațiunea %(name)s are mai multe bucăți "
                        "realizate decât au fost eliberate în amonte. Modificările "
                        "vor fi anulate automat."
                    ) % {"name": successor.name}
                )

        _logger.warning(
            "SHOPFLOOR_REPORTING_CORRECTION: user=%s slot=%s wo=%s mo=%s "
            "interval=%s->%s wo_total=%s->%s state=%s->%s bonus_lines=%s "
            "reason=%s",
            self.env.user.id,
            slot.id,
            workorder.id,
            production.id,
            old_interval,
            info["corrected_interval"],
            old_total,
            corrected_total,
            old_state,
            workorder.state,
            bonus_result.get("lines"),
            reason,
        )

        return {
            "slot_id": slot.id,
            "workorder_id": workorder.id,
            "production_id": production.id,
            "old_interval_qty": old_interval,
            "new_interval_qty": info["corrected_interval"],
            "old_workorder_done": old_total,
            "new_workorder_done": corrected_total,
            "old_workorder_state": old_state,
            "new_workorder_state": workorder.state,
            "slot_gantt_status": (
                slot.x_gantt_status if self._has(slot, "x_gantt_status") else False
            ),
            "successor_changes": successor_changes,
            "bonus_line_ids": bonus_result.get("lines", []),
            "bonus_dates": bonus_result.get("dates", []),
            "mo_progress": (
                production.x_progress_pct
                if self._has(production, "x_progress_pct")
                else False
            ),
        }
