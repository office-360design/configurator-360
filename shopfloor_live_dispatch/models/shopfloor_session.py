import logging

from odoo import models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)
_logger.warning("MAX SHOPFLOOR MODULE FILE LOADED")


class ShopfloorSession(models.Model):
    _inherit = "x_shopfloor_session"

    def action_shopfloor_test_loaded(self):
        raise UserError("SHOPFLOOR MODULE METHOD IS LOADED")

    # ------------------------------------------------------------
    # Generic safe helpers
    # ------------------------------------------------------------

    def _sf_has(self, rec, field_name):
        try:
            return bool(rec) and field_name in rec._fields
        except Exception:
            return False

    def _sf_float_field(self, rec, field_name):
        try:
            if rec and self._sf_has(rec, field_name):
                return float(rec[field_name] or 0.0)
        except Exception:
            pass
        return 0.0

    # ------------------------------------------------------------
    # Quantity helpers
    # Keep this centralized so 1175, 1173, 1287, 1292, 1293 later
    # all use the same remaining quantity logic.
    # ------------------------------------------------------------

    def _sf_wo_target_qty(self, wo):
        for fname in ["qty_production", "product_uom_qty", "x_qty_target"]:
            val = self._sf_float_field(wo, fname)
            if val > 0.0:
                return val

        mo = wo.production_id if self._sf_has(wo, "production_id") else False
        if mo:
            for fname in ["product_qty", "qty_production", "product_uom_qty"]:
                val = self._sf_float_field(mo, fname)
                if val > 0.0:
                    return val

        return 0.0

    def _sf_wo_done_qty(self, wo):
        done = 0.0

        # Avoid qty_producing here for now because in some Odoo flows it may
        # be prefilled with the target quantity.
        for fname in ["qty_done", "qty_produced", "x_qty_done"]:
            val = self._sf_float_field(wo, fname)
            if val > done:
                done = val

        return done

    def _sf_wo_remaining_qty(self, wo):
        target = self._sf_wo_target_qty(wo)
        done = self._sf_wo_done_qty(wo)
        remaining = target - done

        if remaining < 0.0:
            remaining = 0.0

        if done <= 0.0 and self._sf_has(wo, "qty_remaining"):
            native_remaining = self._sf_float_field(wo, "qty_remaining")
            if native_remaining > 0.0:
                remaining = native_remaining

        return remaining

    # ------------------------------------------------------------
    # Dispatch helpers ported from 1175
    # ------------------------------------------------------------

    def _sf_get_operation_template(self, wo):
        try:
            if (
                wo
                and self._sf_has(wo, "operation_id")
                and wo.operation_id
                and self._sf_has(wo.operation_id, "x_operation_template_id")
                and wo.operation_id.x_operation_template_id
            ):
                return wo.operation_id.x_operation_template_id
        except Exception:
            pass

        return False

    def _sf_dependency_ready(self, wo):
        blockers = self.env["mrp.workorder"]

        try:
            if self._sf_has(wo, "blocked_by_workorder_ids"):
                blockers |= wo.blocked_by_workorder_ids
        except Exception:
            pass

        try:
            if self._sf_has(wo, "previous_workorder_id") and wo.previous_workorder_id:
                blockers |= wo.previous_workorder_id
        except Exception:
            pass

        for dep in blockers:
            try:
                dep_state = dep.state if self._sf_has(dep, "state") else False
                if dep_state not in ("done", "cancel"):
                    return False
            except Exception:
                return False

        return True

    def _sf_workorder_is_taken(self, wo):
        try:
            running_log = self.env["x_wo_time_log"].search(
                [
                    ("x_workorder_id", "=", wo.id),
                    ("x_state", "in", ["running", "pause"]),
                ],
                limit=1,
            )
            if running_log:
                return True
        except Exception:
            pass

        try:
            running_sess = self.env["x_shopfloor_session"].search(
                [
                    ("x_workorder_id", "=", wo.id),
                    ("x_state", "=", "active"),
                    ("x_ui_state", "=", "running"),
                ],
                limit=1,
            )
            if running_sess:
                return True
        except Exception:
            pass

        return False

    def _sf_employee_operation_ids(self, emp):
        allowed_ids = []
        best_ids = []

        try:
            if self._sf_has(emp, "x_allowed_operations_id") and emp.x_allowed_operations_id:
                allowed_ids = emp.x_allowed_operations_id.ids
        except Exception:
            allowed_ids = []

        try:
            if self._sf_has(emp, "x_best_operations_id") and emp.x_best_operations_id:
                best_ids = emp.x_best_operations_id.ids
        except Exception:
            best_ids = []

        return allowed_ids, best_ids

    def _sf_get_dispatch_candidates(self, emp, limit=200):
        allowed_ids, best_ids = self._sf_employee_operation_ids(emp)

        _logger.info(
            "[SHOPFLOOR_DISPATCH] employee=%s allowed=%s best=%s",
            emp.id,
            allowed_ids,
            best_ids,
        )

        workorders = self.env["mrp.workorder"].search(
            [
                ("state", "=", "ready"),
                ("production_id.state", "in", ["confirmed", "planned", "progress", "to_close"]),
            ],
            order="id asc",
            limit=limit,
        )

        candidates = []

        for wo in workorders:
            try:
                mo = wo.production_id if self._sf_has(wo, "production_id") else False
                if not mo:
                    continue

                if self._sf_has(mo, "x_include_in_planner") and not mo.x_include_in_planner:
                    continue

                if not self._sf_dependency_ready(wo):
                    continue

                if self._sf_workorder_is_taken(wo):
                    continue

                op_template = self._sf_get_operation_template(wo)
                op_template_id = op_template.id if op_template else False

                if allowed_ids and op_template_id and op_template_id not in allowed_ids:
                    continue

                score = 0
                if op_template_id and op_template_id in best_ids:
                    score += 1000
                if op_template_id and op_template_id in allowed_ids:
                    score += 100

                seq = 0
                try:
                    if self._sf_has(wo, "sequence"):
                        seq = int(wo.sequence or 0)
                except Exception:
                    seq = 0

                deadline_str = "9999-12-31 23:59:59"
                try:
                    if self._sf_has(mo, "date_deadline") and mo.date_deadline:
                        deadline_str = str(mo.date_deadline)
                    elif self._sf_has(mo, "date_start") and mo.date_start:
                        deadline_str = str(mo.date_start)
                except Exception:
                    pass

                sort_key = (-score, deadline_str, seq, wo.id)

                candidates.append(
                    {
                        "sort_key": sort_key,
                        "workorder": wo,
                        "operation_template": op_template,
                        "score": score,
                    }
                )

            except Exception as exc:
                _logger.warning(
                    "[SHOPFLOOR_DISPATCH] candidate skipped wo=%s error=%s",
                    wo.id if wo else False,
                    exc,
                )

        candidates.sort(key=lambda row: row["sort_key"])
        return candidates

    # ------------------------------------------------------------
    # Session assignment
    # ------------------------------------------------------------

    def _sf_assign_workorder_to_session(self, wo, op_template=False):
        self.ensure_one()

        emp = self.x_employee_id if self._sf_has(self, "x_employee_id") else False
        mo = wo.production_id if self._sf_has(wo, "production_id") else False

        vals = {}

        if self._sf_has(self, "x_workorder_id"):
            vals["x_workorder_id"] = wo.id

        if self._sf_has(self, "x_operation_template_id"):
            vals["x_operation_template_id"] = op_template.id if op_template else False

        if self._sf_has(self, "x_ui_state"):
            vals["x_ui_state"] = "not_started"

        if self._sf_has(self, "x_current_slot_id"):
            vals["x_current_slot_id"] = False

        if self._sf_has(self, "x_actual_duration_min"):
            vals["x_actual_duration_min"] = 0.0

        if self._sf_has(self, "x_employee_text") and emp:
            vals["x_employee_text"] = emp.display_name or emp.name or ""

        if self._sf_has(self, "x_operation_template_text"):
            vals["x_operation_template_text"] = (
                op_template.display_name if op_template else (wo.name or "")
            )

        if self._sf_has(self, "x_wc_text"):
            vals["x_wc_text"] = (
                wo.workcenter_id.display_name
                if self._sf_has(wo, "workcenter_id") and wo.workcenter_id
                else ""
            )

        if self._sf_has(self, "x_product_mo_text"):
            mo_name = ""
            prod_name = ""

            if mo:
                mo_name = mo.display_name or mo.name or ""
                if self._sf_has(mo, "product_id") and mo.product_id:
                    prod_name = mo.product_id.display_name or ""

            vals["x_product_mo_text"] = (
                "%s - %s" % (mo_name, prod_name)
                if mo_name and prod_name
                else mo_name or prod_name or ""
            )

        if self._sf_has(self, "x_qty_planned"):
            vals["x_qty_planned"] = self._sf_wo_remaining_qty(wo)

        if self._sf_has(self, "x_expected_duration_min"):
            expected = 0.0
            try:
                if hasattr(wo, "_shopfloor_expected_total_minutes"):
                    expected = float(wo._shopfloor_expected_total_minutes() or 0.0)
                elif self._sf_has(wo, "duration_expected"):
                    expected = float(wo.duration_expected or 0.0)
                elif self._sf_has(wo, "duration"):
                    expected = float(wo.duration or 0.0)
            except Exception:
                expected = 0.0

            target_qty = self._sf_wo_target_qty(wo)
            remaining_qty = self._sf_wo_remaining_qty(wo)
            vals["x_expected_duration_min"] = (
                expected * remaining_qty / target_qty
                if target_qty > 0.0
                else expected
            )

        self.write(vals)

        _logger.warning(
            "[SHOPFLOOR_DISPATCH] session=%s assigned wo=%s vals=%s",
            self.id,
            wo.id,
            vals,
        )

    def _sf_open_session_action(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Production session",
            "res_model": "x_shopfloor_session",
            "view_mode": "form",
            "res_id": self.id,
            "target": "current",
        }

    # ------------------------------------------------------------
    # Public method called by server action 1175
    # ------------------------------------------------------------

    def action_shopfloor_choose_operation(self):
        if not self:
            raise UserError("No session found.")

        sess = self[:1]
        sess.ensure_one()

        _logger.warning(
            "[SHOPFLOOR_DISPATCH] 1175 module path hit session=%s",
            sess.id,
        )

        if not sess._sf_has(sess, "x_employee_id") or not sess.x_employee_id:
            raise UserError("Select an employee first.")

        emp = sess.x_employee_id

        vals_reset = {}
        if sess._sf_has(sess, "x_is_helper_mode"):
            vals_reset["x_is_helper_mode"] = False
        if sess._sf_has(sess, "x_helped_employee_id"):
            vals_reset["x_helped_employee_id"] = False
        if vals_reset:
            sess.write(vals_reset)

        candidates = sess._sf_get_dispatch_candidates(emp)

        if not candidates:
            raise UserError(
                "No eligible live operations found.\n\n"
                "Check that at least one work order is READY, the MO is active, "
                "dependencies are done, and the employee is allowed for that operation."
            )

        chosen = candidates[0]
        wo = chosen["workorder"]
        op_template = chosen["operation_template"]

        _logger.warning(
            "[SHOPFLOOR_DISPATCH] chosen wo=%s op_template=%s score=%s",
            wo.id,
            op_template.id if op_template else False,
            chosen["score"],
        )

        sess._sf_assign_workorder_to_session(wo, op_template)

        return sess._sf_open_session_action()
