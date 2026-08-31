import logging

from odoo import models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ShopfloorLiveStopService(models.AbstractModel):
    _name = "shopfloor.live.stop.service"
    _description = "Shopfloor Live Stop Service"

    def _common(self):
        return self.env["shopfloor.live.common.service"]

    def _has(self, rec, field_name):
        return self._common().has_field(rec, field_name)
    
    def _field_exists(self, model_or_rec, field_name):
        return self._common().field_exists(model_or_rec, field_name)

    def _float_field(self, rec, field_name):
        return self._common().float_field(
            rec,
            field_name,
            0.0,
        )

    # ------------------------------------------------------------
    # MAX ADDED - remaining quantity helpers for partial WOs
    # ------------------------------------------------------------
    def _wo_target_qty(self, wo):
        # Prefer WO-level target, then MO-level target.
        for fname in [
            "qty_production",
            "product_uom_qty",
            "qty_to_produce",
            "x_qty_target",
        ]:
            val = self._float_field(wo, fname)

            if val > 0.0:
                return val

        try:
            mo = wo.production_id if self._has(wo, "production_id") else False

            if mo:
                for fname in [
                    "product_qty",
                    "qty_production",
                    "product_uom_qty",
                ]:
                    val = self._float_field(mo, fname)

                    if val > 0.0:
                        return val

        except Exception:
            pass

        return 0.0

    def _wo_done_qty(self, wo):
        target = self._wo_target_qty(wo)

        dispatch_done = self._float_field(
            wo,
            "x_dispatch_qty_done",
        )

        # Once live dispatch has recorded progress, it is the source of truth.
        if dispatch_done > 0.0:
            if target > 0.0:
                dispatch_done = min(dispatch_done, target)

            return max(dispatch_done, 0.0)

        # Legacy fallback for old WOs created before the custom field existed.
        done = 0.0

        for fname in [
            "qty_done",
            "qty_produced",
            "x_qty_done",
        ]:
            val = self._float_field(wo, fname)

            if val > done:
                done = val

        if target > 0.0:
            done = min(done, target)

        return max(done, 0.0)

    def _wo_remaining_qty(self, wo):
        target = self._wo_target_qty(wo)
        done = self._wo_done_qty(wo)

        remaining = target - done

        if remaining < 0.0:
            remaining = 0.0

        # Native fallback, useful before any custom accumulated quantity exists.
        if done <= 0.0 and self._has(wo, "qty_remaining"):
            native_remaining = self._float_field(wo, "qty_remaining")

            if native_remaining > 0.0:
                remaining = native_remaining

        return remaining

    # ------------------------------------------------------------
    # MAX ADDED - duration calculation
    # ------------------------------------------------------------
    def _refresh_session_actual_duration(self, sess, emp, wo, now):
        actual_minutes = 0.0
        running_log = False

        try:
            # MAX ADDED
            # Only calculate the interval created by the latest START.
            # Previous completed/paused logs must not be included.
            running_log = self.env["x_wo_time_log"].search(
                [
                    ("x_session_id", "=", sess.id),
                    ("x_employee_id", "=", emp.id),
                    ("x_workorder_id", "=", wo.id),
                    ("x_state", "=", "running"),
                    ("x_end_dt", "=", False),
                ],
                order="x_start_dt desc, id desc",
                limit=1,
            )

            if running_log:
                start_dt = (
                    running_log.x_start_dt
                    if self._has(running_log, "x_start_dt")
                    else False
                )

                if start_dt and now and now > start_dt:
                    actual_minutes += self._common().minutes_between(
                        start_dt,
                        now,
                    )

            vals = {}

            if self._has(sess, "x_actual_duration_min"):
                vals["x_actual_duration_min"] = actual_minutes

            if self._has(sess, "x_last_seen_at"):
                vals["x_last_seen_at"] = now

            if vals:
                sess.write(vals)

            _logger.info(
                "[SHOPFLOOR_STOP_SERVICE] current interval duration | "
                "session=%s employee=%s wo=%s log=%s minutes=%s",
                sess.id,
                emp.id,
                wo.id,
                running_log.id if running_log else False,
                actual_minutes,
            )
            # MAX ADDITION ENDED

        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_STOP_SERVICE] duration calculation failed | "
                "session=%s error=%s",
                sess.id,
                exc,
            )

        return actual_minutes

    # ------------------------------------------------------------
    # MAX ADDED - find Worker Hub for session
    # ------------------------------------------------------------
    def _find_hub_for_session(self, sess):
        return self._common().find_hub_for_session(sess)

    # ------------------------------------------------------------
    # MAX ADDED - create and open stop popup
    # ------------------------------------------------------------
    def _create_stop_popup(self, sess, hub):
        Popup = self.env["x_session_stop_popup"]

        wo = sess.x_workorder_id if self._has(sess, "x_workorder_id") else False

        # MAX ADDED - helper mode should not ask/report produced quantity
        is_helper_mode = False

        try:
            if (
                sess
                and self._has(sess, "x_is_helper_mode")
                and sess.x_is_helper_mode
            ):
                is_helper_mode = True
        except Exception:
            is_helper_mode = False
        # MAX ADDITION ENDED

        wo_remaining_qty = 0.0
        session_planned_qty = 0.0

        try:
            if wo:
                wo_remaining_qty = self._wo_remaining_qty(wo)
        except Exception:
            wo_remaining_qty = 0.0

        try:
            if self._has(sess, "x_qty_planned"):
                session_planned_qty = float(
                    sess.x_qty_planned or 0.0
                )
        except Exception:
            session_planned_qty = 0.0

        if session_planned_qty > 0.0:
            remaining_qty = session_planned_qty

            if wo_remaining_qty > 0.0:
                remaining_qty = min(
                    remaining_qty,
                    wo_remaining_qty,
                )
        else:
            remaining_qty = wo_remaining_qty

        dispatch_service = self.env[
            "shopfloor.live.dispatch.service"
        ]

        realized_qty = (
            dispatch_service._done_qty(wo)
            if wo
            else 0.0
        )

        total_qty = (
            dispatch_service._target_qty(wo)
            if wo
            else 0.0
        )

        realized_qty = max(
            0.0,
            min(
                realized_qty,
                total_qty,
            )
            if total_qty > 0.0
            else realized_qty,
        )


        def _display_qty(value):
            try:
                value = float(value or 0.0)

                if abs(value - round(value)) < 0.0001:
                    return str(int(round(value)))

                return (
                    "%.2f" % value
                ).rstrip("0").rstrip(".")

            except Exception:
                return "0"

        # MAX ADDED - helper sessions never report produced quantity
        if is_helper_mode:
            popup_qty_planned = 0.0
            popup_qty_done = 0.0

            popup_message = """
                <div style="text-align:center; padding:24px 12px;">
                    <div style="
                        font-size:34px;
                        font-weight:700;
                    ">
                        Finalizezi ajutorul?
                    </div>
                </div>
            """

        else:
            popup_qty_planned = remaining_qty
            popup_qty_done = remaining_qty

            popup_message = """
                <div style="text-align:center; padding:24px 12px;">
                    <div style="
                        font-size:34px;
                        font-weight:700;
                        margin-bottom:24px;
                    ">
                        Ai realizat toate bucățile?
                    </div>

                    <div style="
                        display:flex;
                        justify-content:center;
                        gap:18px;
                        flex-wrap:wrap;
                    ">

                        <div style="
                            min-width:240px;
                            padding:16px 22px;
                            background:#f9fafb;
                            border:1px solid #e5e7eb;
                            border-radius:16px;
                            box-sizing:border-box;
                        ">
                            <div style="
                                font-size:18px;
                                color:#6b7280;
                                margin-bottom:6px;
                            ">
                                Disponibil acum
                            </div>

                            <div style="
                                font-size:34px;
                                font-weight:800;
                                color:#111827;
                            ">
                                %s / %s
                            </div>
                        </div>

                        <div style="
                            min-width:240px;
                            padding:16px 22px;
                            background:#f9fafb;
                            border:1px solid #e5e7eb;
                            border-radius:16px;
                            box-sizing:border-box;
                        ">
                            <div style="
                                font-size:18px;
                                color:#6b7280;
                                margin-bottom:6px;
                            ">
                                Realizat
                            </div>

                            <div style="
                                font-size:34px;
                                font-weight:800;
                                color:#111827;
                            ">
                                %s / %s
                            </div>
                        </div>

                    </div>
                </div>
            """ % (
                _display_qty(popup_qty_planned),
                _display_qty(total_qty),
                _display_qty(realized_qty),
                _display_qty(total_qty),
            )
        # MAX ADDITION ENDED

        popup_vals = {
            "x_session_id": sess.id,
            "x_hub_id": hub.id,
            "x_employee_id": sess.x_employee_id.id if sess.x_employee_id else False,
            "x_workorder_id": wo.id if wo else False,
            "x_operation_template_id": (
                sess.x_operation_template_id.id
                if self._has(sess, "x_operation_template_id") and sess.x_operation_template_id
                else False
            ),
            "x_qty_planned": popup_qty_planned,
            "x_step": "finish_done_question",
            "x_action_type": "finish",
            "x_qty_done": popup_qty_done,
            "x_message": popup_message,
        }

        if self._field_exists(Popup, "x_is_helper_mode"):
            popup_vals["x_is_helper_mode"] = is_helper_mode

        popup = Popup.create(popup_vals)

        _logger.warning(
            "[SHOPFLOOR_STOP_SERVICE] opened stop popup | session=%s popup=%s wo=%s helper=%s remaining_qty=%s popup_qty_done=%s",
            sess.id,
            popup.id,
            wo.id if wo else False,
            is_helper_mode,
            remaining_qty,
            popup_qty_done,
        )

        return {
            "type": "ir.actions.act_window",
            "name": " ",
            "res_model": "x_session_stop_popup",
            "view_mode": "form",
            "res_id": popup.id,
            "target": "new",
        }

    # ------------------------------------------------------------
    # MAX ADDED - stop "Alte Activitati" without workorder/popup
    # ------------------------------------------------------------
    def _get_session_other_operation(self, sess):
        try:
            if (
                sess
                and self._has(sess, "x_other_operation_id")
                and sess.x_other_operation_id
            ):
                return sess.x_other_operation_id
        except Exception:
            pass

        return False

    def _is_other_activity_session(self, sess, wo=False, other_op=False):
        if not sess:
            return False

        try:
            if (
                self._has(sess, "x_activity_type")
                and sess.x_activity_type == "other"
                and other_op
            ):
                return True
        except Exception:
            pass

        if other_op and not wo:
            return True

        return False

    def _other_operation_display_name(self, other_op):
        if not other_op:
            return "Altă activitate"

        for fname in [
            "x_name",
            "name",
            "display_name",
        ]:
            try:
                if self._has(other_op, fname) and other_op[fname]:
                    return str(other_op[fname])
            except Exception:
                pass

        try:
            return other_op.display_name or "Altă activitate"
        except Exception:
            return "Altă activitate"

    def _minutes_between(self, start_dt, end_dt):
        return self._common().minutes_between(start_dt, end_dt)

    def _create_other_activity_stop_popup(self, sess, hub):
        Popup = self.env["x_session_stop_popup"]

        popup = Popup.create({
            "x_session_id": sess.id,
            "x_hub_id": hub.id,
            "x_employee_id": (
                sess.x_employee_id.id
                if sess.x_employee_id
                else False
            ),
            "x_workorder_id": False,
            "x_operation_template_id": False,

            # No quantity for Alte activități
            "x_qty_planned": 0.0,
            "x_qty_done": 0.0,

            "x_step": "finish_done_question",
            "x_action_type": "finish",
            "x_message": """
                <div style="text-align:center; padding:24px 12px;">
                    <div style="
                        font-size:34px;
                        font-weight:700;
                    ">
                        Finalizezi activitatea?
                    </div>
                </div>
            """,
        })

        return self._open_popup_action(popup)

    def _popup_is_other_activity_confirmation(self, popup):
        """Other-activity stop popups are the only stop popups without a WO."""
        if not popup:
            return False

        try:
            if self._has(popup, "x_workorder_id") and popup.x_workorder_id:
                return False

            return bool(
                self._has(popup, "x_session_id")
                and popup.x_session_id
            )
        except Exception:
            return False

    def _find_other_running_log(self, sess, emp, other_op):
        Log = self.env["x_wo_time_log"]

        domains = []

        base = [
            ("x_employee_id", "=", emp.id),
            ("x_state", "in", ["running", "pause"]),
        ]

        # IMPORTANT:
        # Log is a model/empty recordset. Do NOT call self._has(Log, ...)
        # here, because bool(env["x_wo_time_log"]) is False and the domains
        # are never added. Check Log._fields directly.
        if "x_session_id" in Log._fields and sess:
            domains.append(
                base + [
                    ("x_session_id", "=", sess.id),
                ]
            )

        if other_op and "x_other_operation_id" in Log._fields:
            domains.append(
                base + [
                    ("x_other_operation_id", "=", other_op.id),
                ]
            )

        if "x_activity_type" in Log._fields:
            domains.append(
                base + [
                    ("x_activity_type", "=", "other"),
                ]
            )

        # Last fallback: latest running log for this employee without a WO.
        if "x_workorder_id" in Log._fields:
            domains.append(
                base + [
                    ("x_workorder_id", "=", False),
                ]
            )

        for domain in domains:
            try:
                log_rec = Log.search(
                    domain,
                    order="write_date desc, id desc",
                    limit=1,
                )

                _logger.warning(
                    "[SHOPFLOOR_STOP_SERVICE] other log search | session=%s emp=%s other_op=%s domain=%s found=%s",
                    sess.id if sess else False,
                    emp.id if emp else False,
                    other_op.id if other_op else False,
                    domain,
                    log_rec.id if log_rec else False,
                )

                if log_rec:
                    return log_rec

            except Exception as exc:
                _logger.warning(
                    "[SHOPFLOOR_STOP_SERVICE] other log search failed | domain=%s error=%s",
                    domain,
                    exc,
                )

        return Log.browse([])

    def _find_other_slot(self, sess, emp, other_op):
        if "x_wo_emp_slot" not in self.env:
            return False

        Slot = self.env["x_wo_emp_slot"]

        try:
            if (
                self._has(sess, "x_current_slot_id")
                and sess.x_current_slot_id
            ):
                candidate = sess.x_current_slot_id

                if (
                    candidate
                    and candidate._name == "x_wo_emp_slot"
                    and self._has(candidate, "x_employee_id")
                    and candidate.x_employee_id
                    and candidate.x_employee_id.id == emp.id
                    and (
                        not self._has(candidate, "x_state")
                        or candidate.x_state != "cancelled"
                    )
                ):
                    is_other = False

                    try:
                        if (
                            self._has(candidate, "x_activity_type")
                            and candidate.x_activity_type == "other"
                        ):
                            is_other = True
                    except Exception:
                        pass

                    try:
                        if (
                            not is_other
                            and other_op
                            and self._has(candidate, "x_other_operation_id")
                            and candidate.x_other_operation_id
                            and candidate.x_other_operation_id.id == other_op.id
                        ):
                            is_other = True
                    except Exception:
                        pass

                    try:
                        if (
                            not is_other
                            and self._has(candidate, "x_is_other_operation_interval")
                            and candidate.x_is_other_operation_interval
                        ):
                            is_other = True
                    except Exception:
                        pass

                    if is_other:
                        return candidate

        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_STOP_SERVICE] other current slot lookup failed: %s",
                exc,
            )

        domains = []

        base = [
            ("x_employee_id", "=", emp.id),
            ("x_state", "in", ["planned", "in_progress"]),
        ]

        if "x_plan_type" in Slot._fields:
            base.append(("x_plan_type", "=", "dynamic"))

        if "x_activity_type" in Slot._fields:
            domains.append(
                base + [
                    ("x_activity_type", "=", "other"),
                ]
            )

        if other_op and "x_other_operation_id" in Slot._fields:
            domains.append(
                base + [
                    ("x_other_operation_id", "=", other_op.id),
                ]
            )

        if "x_is_other_operation_interval" in Slot._fields:
            domains.append(
                base + [
                    ("x_is_other_operation_interval", "=", True),
                ]
            )

        for domain in domains:
            try:
                slot = Slot.search(
                    domain,
                    order="x_date_start desc, id desc",
                    limit=1,
                )

                if slot:
                    return slot
            except Exception:
                pass

        return False

    def _stop_other_activity(self, sess, hub, now):
        if not sess:
            raise UserError("Missing session.")

        if not self._has(sess, "x_employee_id") or not sess.x_employee_id:
            raise UserError("Select an employee before stopping.")

        emp = sess.x_employee_id
        other_op = self._get_session_other_operation(sess)
        other_name = self._other_operation_display_name(other_op)

        log_rec = self._find_other_running_log(
            sess=sess,
            emp=emp,
            other_op=other_op,
        )

        if not log_rec:
            raise UserError("No running other activity log found to stop.")

        start_dt = (
            log_rec.x_start_dt
            if self._has(log_rec, "x_start_dt")
            else False
        )

        end_dt = now

        if start_dt and end_dt and end_dt <= start_dt:
            end_dt = start_dt

        minutes = self._minutes_between(start_dt, end_dt)

        vals_log = {}

        if self._has(log_rec, "x_end_dt"):
            vals_log["x_end_dt"] = end_dt

        if self._has(log_rec, "x_duration_min"):
            vals_log["x_duration_min"] = minutes

        if self._has(log_rec, "x_state"):
            vals_log["x_state"] = "done"

        if self._has(log_rec, "x_qty_done"):
            vals_log["x_qty_done"] = 0.0

        if self._has(log_rec, "x_activity_type"):
            vals_log["x_activity_type"] = "other"

        if other_op and self._has(log_rec, "x_other_operation_id"):
            vals_log["x_other_operation_id"] = other_op.id

        if vals_log:
            log_rec.write(vals_log)

        slot = self._find_other_slot(
            sess=sess,
            emp=emp,
            other_op=other_op,
        )

        if slot:
            slot_vals = {}

            if self._has(slot, "x_state"):
                slot_vals["x_state"] = "done"

            if self._has(slot, "x_date_start") and start_dt:
                slot_vals["x_date_start"] = start_dt

            if self._has(slot, "x_date_end"):
                slot_vals["x_date_end"] = end_dt

            if self._has(slot, "x_minutes"):
                slot_vals["x_minutes"] = minutes

            if self._has(slot, "x_actual_duration_min"):
                slot_vals["x_actual_duration_min"] = minutes

            if self._has(slot, "x_qty_done"):
                slot_vals["x_qty_done"] = 0.0

            if self._has(slot, "x_interval_qty_done"):
                slot_vals["x_interval_qty_done"] = 0.0

            if self._has(slot, "x_activity_type"):
                slot_vals["x_activity_type"] = "other"

            if self._has(slot, "x_is_helper"):
                slot_vals["x_is_helper"] = False

            if self._has(slot, "x_is_other_operation_interval"):
                slot_vals["x_is_other_operation_interval"] = True

            if other_op and self._has(slot, "x_other_operation_id"):
                slot_vals["x_other_operation_id"] = other_op.id

            if self._has(slot, "x_gantt_status"):
                slot_vals["x_gantt_status"] = "other_activities"

            if self._has(slot, "x_gantt_color"):
                slot_vals["x_gantt_color"] = 3

            if slot_vals:
                slot.with_context(
                    no_overlap_check=True,
                    skip_overlap_guard=True,
                    slot_sync_running=True,
                ).write(slot_vals)

        session_vals = {}

        if self._has(sess, "x_other_operation_id"):
            session_vals["x_other_operation_id"] = False

        if self._has(sess, "x_activity_type"):
            session_vals["x_activity_type"] = False

        if self._has(sess, "x_workorder_id"):
            session_vals["x_workorder_id"] = False

        if self._has(sess, "x_operation_template_id"):
            session_vals["x_operation_template_id"] = False

        if self._has(sess, "x_ui_state"):
            session_vals["x_ui_state"] = "not_started"

        if self._has(sess, "x_state"):
            session_vals["x_state"] = "active"

        if self._has(sess, "x_current_slot_id"):
            session_vals["x_current_slot_id"] = False

        for fname in [
            "x_employee_text",
            "x_operation_template_text",
            "x_wc_text",
            "x_product_mo_text",
        ]:
            if self._has(sess, fname):
                session_vals[fname] = False

        for fname in [
            "x_qty_planned",
            "x_expected_duration_min",
            "x_actual_duration_min",
        ]:
            if self._has(sess, fname):
                session_vals[fname] = 0.0

        if self._has(sess, "x_last_seen_at"):
            session_vals["x_last_seen_at"] = now

        if session_vals:
            sess.write(session_vals)

        _logger.warning(
            "[SHOPFLOOR_STOP_SERVICE] stopped other activity | session=%s emp=%s other_op=%s log=%s slot=%s minutes=%s",
            sess.id,
            emp.id,
            other_op.id if other_op else False,
            log_rec.id if log_rec else False,
            slot.id if slot else False,
            minutes,
        )

        return self._common().open_hub_action(hub)

    def confirm_other_activity(self, popups):
        if not popups:
            raise UserError("No popup record found.")

        popup = popups[:1]
        popup.ensure_one()

        sess = (
            popup.x_session_id
            if self._has(popup, "x_session_id")
            else False
        )

        if not sess:
            raise UserError("Missing session.")

        hub = (
            popup.x_hub_id
            if self._has(popup, "x_hub_id") and popup.x_hub_id
            else self._find_hub_for_session(sess)
        )

        if not hub:
            raise UserError("Hub not found for this device/session.")

        return self._stop_other_activity(
            sess=sess,
            hub=hub,
            now=self._common().now(),
        )

    def open_stop_popup(self, sessions):
        if not sessions:
            raise UserError("No session found.")

        now = self._common().now()

        primary = False

        for sess in sessions:
            primary = sess

            if not self._has(sess, "x_employee_id") or not sess.x_employee_id:
                raise UserError("Select an employee before stopping.")

            emp = sess.x_employee_id

            wo = (
                sess.x_workorder_id
                if self._has(sess, "x_workorder_id") and sess.x_workorder_id
                else False
            )

            other_op = self._get_session_other_operation(sess)
            is_other_activity = self._is_other_activity_session(
                sess,
                wo=wo,
                other_op=other_op,
            )

            if not wo and not is_other_activity:
                raise UserError("Select an operation or other activity before stopping.")

            if is_other_activity:
                hub = self._find_hub_for_session(sess)

                if not hub:
                    raise UserError("Hub not found for this device/session.")

                return self._create_other_activity_stop_popup(
                    sess=sess,
                    hub=hub,
                )

            self._refresh_session_actual_duration(
                sess=sess,
                emp=emp,
                wo=wo,
                now=now,
            )

        if not primary:
            raise UserError("No session record processed.")

        hub = self._find_hub_for_session(primary)

        if not hub:
            raise UserError("Hub not found for this device/session.")

        return self._create_stop_popup(primary, hub)

    # ------------------------------------------------------------
    # MAX ADDED - popup quantity / display helpers
    # ------------------------------------------------------------
    def _popup_remaining_qty(self, popup):
        try:
            if (
                self._has(popup, "x_is_helper_mode")
                and popup.x_is_helper_mode
            ):
                return 0.0
        except Exception:
            pass

        planned_qty = 0.0
        wo_remaining_qty = 0.0

        try:
            planned_qty = float(
                popup.x_qty_planned or 0.0
            )
        except Exception:
            planned_qty = 0.0

        try:
            if (
                self._has(popup, "x_workorder_id")
                and popup.x_workorder_id
            ):
                wo_remaining_qty = self._wo_remaining_qty(
                    popup.x_workorder_id
                )
        except Exception:
            wo_remaining_qty = 0.0

        if planned_qty > 0.0:
            if wo_remaining_qty > 0.0:
                return min(
                    planned_qty,
                    wo_remaining_qty,
                )

            return planned_qty

        return wo_remaining_qty

    def _html_escape(self, value):
        return self._common().html_escape(value)

    def _fmt_qty_display(self, qty):
        return self._common().fmt_qty_display(qty)

    def _operation_display_name_from_popup(self, popup):
        operation_name = ""

        try:
            if (
                popup
                and self._has(popup, "x_operation_template_id")
                and popup.x_operation_template_id
            ):
                operation_name = popup.x_operation_template_id.display_name or ""
        except Exception:
            operation_name = ""

        try:
            if (
                not operation_name
                and popup
                and self._has(popup, "x_workorder_id")
                and popup.x_workorder_id
            ):
                wo = popup.x_workorder_id

                if self._has(wo, "operation_id") and wo.operation_id:
                    operation_name = (
                        wo.operation_id.display_name
                        or wo.operation_id.name
                        or ""
                    )

                if not operation_name:
                    operation_name = wo.display_name or wo.name or ""

        except Exception:
            pass

        try:
            if (
                not operation_name
                and popup
                and self._has(popup, "x_session_id")
                and popup.x_session_id
            ):
                sess = popup.x_session_id

                if (
                    self._has(sess, "x_operation_template_text")
                    and sess.x_operation_template_text
                ):
                    operation_name = sess.x_operation_template_text

        except Exception:
            pass

        if not operation_name:
            operation_name = "Operație curentă"

        return operation_name

    def _open_popup_action(self, popup):
        return self._common().open_record_action(
            name=" ",
            res_model="x_session_stop_popup",
            res_id=popup.id,
            view_mode="form",
            target="new",
        )

    # ------------------------------------------------------------
    # MAX ADDED - action 1292: whole quantity completed YES
    # ------------------------------------------------------------
    def whole_quantity_yes(self, popups):
        if not popups:
            raise UserError("No popup record found.")

        popup = popups[:1]
        popup.ensure_one()

        # Alte activități: Confirmă stops directly, without quantity flow
        if (
            not popup.x_workorder_id
            and popup.x_session_id
        ):
            sess = popup.x_session_id

            hub = (
                popup.x_hub_id
                if popup.x_hub_id
                else self._find_hub_for_session(sess)
            )

            if not hub:
                raise UserError("Hub not found for this device/session.")

            return self._stop_other_activity(
                sess=sess,
                hub=hub,
                now=self._common().now(),
            )

        # Other activities use the same YES button, but have no quantity flow.
        # The real stop happens only now, after the employee confirms.
        if self._popup_is_other_activity_confirmation(popup):
            sess = popup.x_session_id
            hub = (
                popup.x_hub_id
                if self._has(popup, "x_hub_id") and popup.x_hub_id
                else self._find_hub_for_session(sess)
            )

            if not hub:
                raise UserError("Hub not found for this device/session.")

            return self._stop_other_activity(
                sess=sess,
                hub=hub,
                now=self._common().now(),
            )

        qty_planned = self._popup_remaining_qty(popup)
        overrun = popup.x_overrun_min or 0.0

        if overrun > 1.0:
            next_step = "finish_reason"
            next_subtitle = "Alege motivul întârzierii."
        else:
            next_step = "finish_confirm"
            next_subtitle = "Confirmă cantitatea realizată."

        operation_name_safe = self._html_escape(
            self._operation_display_name_from_popup(popup)
        )
        next_subtitle_safe = self._html_escape(next_subtitle)
        qty_display = self._fmt_qty_display(qty_planned)

        popup.write({
            "x_qty_done": qty_planned,
            "x_qty_planned": qty_planned,
            "x_step": next_step,
            "x_message": """
                <div style="text-align:center; padding:24px 12px;">
                    <div style="
                        font-size:22px;
                        color:#6b7280;
                        margin-bottom:8px;
                    ">
                    </div>
                    <div style="
                        font-size:38px;
                        font-weight:800;
                        margin-bottom:10px;
                        color:#111827;
                    ">
                        %s
                    </div>
                    <div style="
                        font-size:22px;
                        color:#4b5563;
                        margin-bottom:6px;
                    ">
                        Cantitate planificată: <strong>%s</strong>
                    </div>
                    <div style="
                        font-size:22px;
                        color:#4b5563;
                    ">
                        %s
                    </div>
                </div>
            """ % (
                operation_name_safe,
                qty_display,
                next_subtitle_safe,
            ),
        })

        _logger.warning(
            "[SHOPFLOOR_STOP_SERVICE] whole quantity YES | popup=%s qty=%s next_step=%s overrun=%s",
            popup.id,
            qty_planned,
            next_step,
            overrun,
        )

        return self._open_popup_action(popup)

    # ------------------------------------------------------------
    # MAX ADDED - action 1293: whole quantity completed NO
    # ------------------------------------------------------------
    def whole_quantity_no(self, popups):
        if not popups:
            raise UserError("No popup record found.")

        popup = popups[:1]
        popup.ensure_one()

        # Helper mode should not go to manual quantity adjustment.
        try:
            if self._has(popup, "x_is_helper_mode") and popup.x_is_helper_mode:
                return self.whole_quantity_yes(popup)
        except Exception:
            pass

        qty_planned = self._popup_remaining_qty(popup)

        operation_name_safe = self._html_escape(
            self._operation_display_name_from_popup(popup)
        )
        qty_display = self._fmt_qty_display(qty_planned)

        popup.write({
            "x_qty_done": qty_planned,
            "x_qty_planned": qty_planned,
            "x_step": "finish_qty",
            "x_message": """
                <div style="text-align:center; padding:24px 12px;">
                    <div style="
                        font-size:22px;
                        color:#6b7280;
                        margin-bottom:8px;
                    ">
                    </div>
                    <div style="
                        font-size:38px;
                        font-weight:800;
                        margin-bottom:10px;
                        color:#111827;
                    ">
                        %s
                    </div>
                    <div style="
                        font-size:22px;
                        color:#4b5563;
                        margin-bottom:6px;
                    ">
                        Ajustează cantitatea realizată.
                    </div>
                    <div style="
                        font-size:22px;
                        color:#4b5563;
                    ">
                        Cantitate Necesară: <strong>%s</strong>
                    </div>
                </div>
            """ % (
                operation_name_safe,
                qty_display,
            ),
        })

        _logger.warning(
            "[SHOPFLOOR_STOP_SERVICE] whole quantity NO | popup=%s qty=%s next_step=finish_qty",
            popup.id,
            qty_planned,
        )

        return self._open_popup_action(popup)

    # ------------------------------------------------------------
    # MAX ADDED - quantity adjustment buttons
    # ------------------------------------------------------------
    def adjust_popup_quantity(self, popups, direction=1.0, step_field="x_qty_step_small", default_step=1.0):
        if not popups:
            return False

        popup = popups[:1]
        popup.ensure_one()

        step = default_step

        try:
            if self._has(popup, step_field):
                step = float(popup[step_field] or default_step)
        except Exception:
            step = default_step

        qty = 0.0

        try:
            qty = float(popup.x_qty_done or 0.0)
        except Exception:
            qty = 0.0

        new_qty = qty + (float(direction or 1.0) * step)

        # Safety: do not allow negative pieces.
        # No upper cap, because prod 1297 also allows increasing freely.
        if new_qty < 0.0:
            new_qty = 0.0

        max_qty = 0.0

        try:
            max_qty = float(
                popup.x_qty_planned or 0.0
            )
        except Exception:
            max_qty = 0.0

        if max_qty > 0.0 and new_qty > max_qty:
            new_qty = max_qty

        popup.write({
            "x_qty_done": new_qty,
        })

        _logger.warning(
            "[SHOPFLOOR_STOP_SERVICE] adjust quantity | popup=%s old=%s step=%s direction=%s new=%s",
            popup.id,
            qty,
            step,
            direction,
            new_qty,
        )

        return self._open_popup_action(popup)

    def continue_after_quantity(self, popups):
        SHOW_DELAY_REASONS_THRESHOLD = 1.0

        if not popups:
            return False

        popup = popups[:1]
        popup.ensure_one()

        operation_name_safe = self._html_escape(
            self._operation_display_name_from_popup(popup)
        )

        qty = 0.0
        planned_qty = 0.0
        overrun = 0.0

        try:
            qty = float(popup.x_qty_done or 0.0)
        except Exception:
            qty = 0.0

        try:
            planned_qty = float(popup.x_qty_planned or 0.0)
        except Exception:
            planned_qty = 0.0

        if (
            planned_qty > 0.0
            and qty > planned_qty + 0.0001
        ):
            raise UserError(
                "Cantitatea realizată nu poate depăși cantitatea "
                "disponibilă pentru această etapă."
            )

        try:
            overrun = float(popup.x_overrun_min or 0.0)
        except Exception:
            overrun = 0.0

        remaining_after_qty = planned_qty - qty

        if remaining_after_qty < 0.0:
            remaining_after_qty = 0.0

        remaining_after_display = self._fmt_qty_display(remaining_after_qty)

        if qty < 0.0:
            popup.write({
                "x_step": "finish_qty",
                "x_message": """
                    <div style="text-align:center; padding:24px 12px;">
                        <div style="
                            font-size:22px;
                            color:#6b7280;
                            margin-bottom:8px;
                        ">
                            Operație
                        </div>
                        <div style="
                            font-size:38px;
                            font-weight:800;
                            margin-bottom:10px;
                            color:#111827;
                        ">
                            %s
                        </div>
                        <div style="
                            font-size:34px;
                            font-weight:700;
                            margin-bottom:8px;
                            color:#b91c1c;
                        ">
                            Cantitatea este necesară
                        </div>
                        <div style="
                            font-size:22px;
                            color:#4b5563;
                        ">
                            Alege cantitatea înainte de confirmare.
                        </div>
                    </div>
                """ % operation_name_safe,
            })

            _logger.warning(
                "[SHOPFLOOR_STOP_SERVICE] continue after quantity blocked zero qty | popup=%s qty=%s",
                popup.id,
                qty,
            )

            return self._open_popup_action(popup)

        if overrun > SHOW_DELAY_REASONS_THRESHOLD:
            next_step = "finish_reason"
            next_subtitle = "Alege motivul întârzierii."
        else:
            next_step = "finish_confirm"
            next_subtitle = "Confirmă cantitatea realizată."

        popup.write({
            "x_step": next_step,
            "x_message": """
                <div style="text-align:center; padding:24px 12px;">
                    <div style="
                        font-size:22px;
                        color:#6b7280;
                        margin-bottom:8px;
                    ">
                    </div>
                    <div style="
                        font-size:38px;
                        font-weight:800;
                        margin-bottom:10px;
                        color:#111827;
                    ">
                        %s
                    </div>
                    <div style="
                        font-size:22px;
                        color:#4b5563;
                        margin-bottom:6px;
                    ">
                        Cantitate rămasă: <strong>%s</strong>
                    </div>
                    <div style="
                        font-size:22px;
                        color:#4b5563;
                    ">
                        %s
                    </div>
                </div>
            """ % (
                operation_name_safe,
                remaining_after_display,
                self._html_escape(next_subtitle),
            ),
        })

        _logger.warning(
            "[SHOPFLOOR_STOP_SERVICE] continue after quantity | popup=%s qty_done=%s planned_qty=%s remaining_after=%s next_step=%s overrun=%s",
            popup.id,
            qty,
            planned_qty,
            remaining_after_qty,
            next_step,
            overrun,
        )

        return self._open_popup_action(popup)
