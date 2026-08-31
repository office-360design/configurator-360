import logging

from odoo import models
from odoo.exceptions import UserError


_logger = logging.getLogger(__name__)


class ShopfloorLiveOtherService(models.AbstractModel):
    _name = "shopfloor.live.other.service"
    _description = "Shopfloor Live Other Activities Service"

    def _common(self):
        return self.env["shopfloor.live.common.service"]

    def _field_exists(self, model_or_rec, field_name):
        return self._common().field_exists(model_or_rec, field_name)

    def _has(self, rec, field_name):
        return self._common().has_field(rec, field_name)

    def _model_exists(self, model_name):
        try:
            self.env[model_name]
            return True
        except Exception:
            return False

    def _open_session_action(self, sess):
        return self._common().open_record_action(
            name="Shopfloor Session",
            res_model="x_shopfloor_session",
            res_id=sess.id,
            view_mode="form",
            target="current",
        )

    def _other_name(self, op):
        if not op:
            return ""

        for fname in ["x_name", "name", "display_name"]:
            try:
                if self._field_exists(op, fname) and op[fname]:
                    return op[fname]
            except Exception:
                pass

        try:
            return op.display_name or ""
        except Exception:
            return ""

    def _other_description(self, op):
        if not op:
            return ""

        for fname in ["x_description", "description"]:
            try:
                if self._field_exists(op, fname) and op[fname]:
                    return op[fname]
            except Exception:
                pass

        return ""

    def _other_expected_duration(self, op):
        return self._common().float_field(
            op,
            "x_expected_duration_min",
            0.0,
        )

    # ------------------------------------------------------------
    # Port of Studio action 1413
    # ------------------------------------------------------------
    def open_other_picker(self, sessions):
        common = self._common()

        if not self._model_exists("x_shopfloor_other_operation"):
            raise UserError("Modelul x_shopfloor_other_operation nu există.")

        sess = sessions[:1] if sessions else False

        if not sess:
            raise UserError("Nu există sesiune activă.")

        sess.ensure_one()

        if not self._has(sess, "x_employee_id") or not sess.x_employee_id:
            raise UserError(
                "Selectează/scanează un angajat înainte de Alte activități."
            )

        OtherOp = self.env["x_shopfloor_other_operation"]

        domain = []

        if self._field_exists(OtherOp, "x_active"):
            domain.append(("x_active", "=", True))

        order = "id asc"
        if self._field_exists(OtherOp, "x_name"):
            order = "x_name asc, id asc"
        elif self._field_exists(OtherOp, "name"):
            order = "name asc, id asc"

        operations = OtherOp.search(domain, order=order)

        Picker = self.env["shopfloor.live.other.pick"]
        Line = self.env["shopfloor.live.other.pick.line"]

        picker = Picker.create({
            "x_session_id": sess.id,
            "x_employee_id": sess.x_employee_id.id,
        })

        sort_index = 1

        for op in operations:
            Line.create({
                "x_picker_id": picker.id,
                "x_other_operation_id": op.id,
                "x_name": self._other_name(op),
                "x_description": self._other_description(op),
                "x_expected_duration_min": self._other_expected_duration(op),
                "x_sort_index": sort_index,
            })

            sort_index += 1

        view = self.env.ref(
            "shopfloor_live_dispatch.view_shopfloor_live_other_pick_form",
            raise_if_not_found=False,
        )

        views = [(False, "form")]
        if view:
            views = [(view.id, "form")]

        action = common.open_record_action(
            name="Alte activități",
            res_model="shopfloor.live.other.pick",
            res_id=picker.id,
            view_mode="form",
            target="current",
        )

        action["views"] = views
        action["context"] = {
            "from_other_pick": True,
            "active_shopfloor_session_id": sess.id,
            "active_shopfloor_employee_id": sess.x_employee_id.id,
        }

        return action

    # ------------------------------------------------------------
    # Port of Studio action 1414
    # ------------------------------------------------------------
    def select_other_operation(self, other_operations):
        op = other_operations[:1] if other_operations else False

        if not op:
            raise UserError("Nu a fost selectată nicio activitate.")

        op.ensure_one()

        sess_id = self.env.context.get("active_shopfloor_session_id")

        if not sess_id:
            raise UserError("Nu am găsit sesiunea activă în context.")

        if not self._model_exists("x_shopfloor_session"):
            raise UserError("Modelul x_shopfloor_session nu există.")

        try:
            sess = self.env["x_shopfloor_session"].browse(int(sess_id)).exists()
        except Exception:
            sess = self.env["x_shopfloor_session"].browse([])

        if not sess:
            raise UserError("Sesiunea activă nu mai există.")

        sess.ensure_one()

        vals = {}

        # Other activity selection
        if self._has(sess, "x_other_operation_id"):
            vals["x_other_operation_id"] = op.id

        if self._has(sess, "x_activity_type"):
            vals["x_activity_type"] = "other"

        # Selected, but not started yet
        if self._has(sess, "x_ui_state"):
            vals["x_ui_state"] = "not_started"

        if self._has(sess, "x_state"):
            vals["x_state"] = "active"

        # Clear production state
        for fname in [
            "x_workorder_id",
            "x_operation_id",
            "x_operation_template_id",
            "x_current_slot_id",
        ]:
            if self._has(sess, fname):
                vals[fname] = False

        # Clear helper state
        if self._has(sess, "x_is_helper_mode"):
            vals["x_is_helper_mode"] = False

        if self._has(sess, "x_helped_employee_id"):
            vals["x_helped_employee_id"] = False

        # Clear production display text
        for fname in [
            "x_operation_template_text",
            "x_wc_text",
            "x_product_mo_text",
        ]:
            if self._has(sess, fname):
                vals[fname] = False

        # Reset production quantities/durations
        for fname in [
            "x_qty_planned",
            "x_mo_total_qty",
            "x_actual_duration_min",
        ]:
            if self._has(sess, fname):
                vals[fname] = 0.0

        if self._has(sess, "x_expected_duration_min"):
            vals["x_expected_duration_min"] = self._other_expected_duration(op)

        sess.write(vals)

        _logger.warning(
            "[SHOPFLOOR_OTHER_SERVICE] selected other activity | session=%s op=%s",
            sess.id,
            op.id,
        )

        return self._open_session_action(sess)
