import datetime
import logging

from odoo import models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ShopfloorLiveHelpService(models.AbstractModel):
    _name = "shopfloor.live.help.service"
    _description = "Shopfloor Live Help Service"

    def _common(self):
        return self.env["shopfloor.live.common.service"]

    def _has(self, rec, field_name):
        return self._common().has_field(rec, field_name)

    def _field_exists(self, model_or_rec, field_name):
        return self._common().field_exists(model_or_rec, field_name)

    def _find_hub_for_session(self, sess):
        return self._common().find_hub_for_session(sess)

    def _open_session_action(self, sess):
        return self._common().open_record_action(
            name="Shopfloor session",
            res_model="x_shopfloor_session",
            res_id=sess.id,
            view_mode="form",
            target="current",
        )

    def _open_no_colleagues_popup(self, sess):
        hub = self._find_hub_for_session(sess)

        Popup = self.env["x_popup_session"]

        popup_vals = {
            "x_message": """
                <div style="text-align:center; padding: 24px 12px;">
                    <div style="font-size: 34px; font-weight: 700; margin-bottom: 12px;">
                        Nu există colegi disponibili
                    </div>
                    <div style="font-size: 22px; color: #4b5563;">
                        Nu există sesiuni active pe care le poți ajuta acum.
                    </div>
                </div>
            """,
            "x_hub_id": hub.id if hub else False,
        }

        if self._field_exists(Popup, "x_ok_behavior"):
            popup_vals["x_ok_behavior"] = "close"

        popup = Popup.create(popup_vals)

        _logger.warning(
            "[SHOPFLOOR_HELP_SERVICE] no colleagues available | session=%s popup=%s hub=%s",
            sess.id if sess else False,
            popup.id,
            hub.id if hub else False,
        )

        return self._common().open_record_action(
            name="Mesaj",
            res_model="x_popup_session",
            res_id=popup.id,
            view_mode="form",
            target="new",
        )

    def open_help_picker(self, sessions):
        """
        Port of Studio action 1261:
        - current kiosk session presses Ajută Coleg
        - opens running sessions from today that can be helped
        - no zone restriction
        - excludes helper sessions
        """
        Session = self.env["x_shopfloor_session"]

        sess0 = sessions[:1] if sessions else False

        if not sess0:
            raise UserError("No session context.")

        sess0.ensure_one()

        if not self._has(sess0, "x_employee_id") or not sess0.x_employee_id:
            raise UserError("Select an employee first.")

        helper_emp = sess0.x_employee_id

        now = False

        try:
            now = self._common().now()
        except Exception:
            now = sess0.write_date or sess0.create_date

        if not now:
            raise UserError("Could not determine current time.")

        today_start = now.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

        tomorrow_start = today_start + datetime.timedelta(days=1)

        # Base domain: sessions that are running today.
        # Zone restriction intentionally removed: workers can help active
        # colleagues from any zone/device.
        dom = [
            ("id", "!=", sess0.id),
            ("create_date", ">=", today_start),
            ("create_date", "<", tomorrow_start),
            ("x_ui_state", "=", "running"),
            ("x_state", "=", "active"),
            ("x_employee_id", "!=", False),
            ("x_workorder_id", "!=", False),
        ]

        # Optional: exclude helper sessions.
        try:
            if "x_is_helper_mode" in Session._fields:
                dom.append(("x_is_helper_mode", "=", False))
        except Exception:
            pass

        _logger.warning(
            "[SHOPFLOOR_HELP_SERVICE] open_help_picker | session=%s helper_emp=%s domain=%s",
            sess0.id,
            helper_emp.id,
            dom,
        )

        candidate = Session.search(dom, limit=1)

        if not candidate:
            return self._open_no_colleagues_popup(sess0)

        helper_zone_id = False

        try:
            if self._has(sess0, "x_zone_id") and sess0.x_zone_id:
                helper_zone_id = sess0.x_zone_id.id
        except Exception:
            helper_zone_id = False

        Picker = self.env["shopfloor.live.help.pick"]

        picker = Picker.create({
            "x_session_id": sess0.id,
        })

        candidates = Session.search(
            dom,
            order="write_date desc, id desc",
        )

        line_commands = []

        for target_sess in candidates:
            line_commands.append((
                0,
                0,
                {
                    "x_target_session_id": target_sess.id,
                    "x_employee_id": target_sess.x_employee_id.id if target_sess.x_employee_id else False,
                    "x_operation_template_text": (
                        target_sess.x_operation_template_text
                        if self._has(target_sess, "x_operation_template_text")
                        else False
                    ),
                    "x_workorder_id": (
                        target_sess.x_workorder_id.id
                        if self._has(target_sess, "x_workorder_id") and target_sess.x_workorder_id
                        else False
                    ),
                    "x_mo_number": (
                        target_sess.x_mo_number
                        if self._has(target_sess, "x_mo_number")
                        else False
                    ),
                    "x_product_mo_text": (
                        target_sess.x_product_mo_text
                        if self._has(target_sess, "x_product_mo_text")
                        else False
                    ),
                    "x_wc_text": (
                        target_sess.x_wc_text
                        if self._has(target_sess, "x_wc_text")
                        else False
                    ),
                },
            ))

        if line_commands:
            picker.write({
                "x_line_ids": line_commands,
            })

        return self._common().open_record_action(
            name="Alege un coleg",
            res_model="shopfloor.live.help.pick",
            res_id=picker.id,
            view_mode="form",
            target="current",
        )

    def _worked_minutes_for_employee_wo(self, emp, wo, now):
        total = 0.0

        if not emp or not wo:
            return total

        Log = self.env["x_wo_time_log"]

        logs = Log.search(
            [
                ("x_employee_id", "=", emp.id),
                ("x_workorder_id", "=", wo.id),
            ]
        )

        for lg in logs:
            # Closed segment.
            if self._has(lg, "x_duration_min") and lg.x_duration_min:
                try:
                    total += float(lg.x_duration_min or 0.0)
                    continue
                except Exception:
                    pass

            # Running segment fallback.
            try:
                if (
                    self._has(lg, "x_state")
                    and lg.x_state == "running"
                    and self._has(lg, "x_start_dt")
                    and lg.x_start_dt
                    and now
                ):
                    total += self._common().minutes_between(
                        lg.x_start_dt,
                        now,
                    )
            except Exception:
                pass

        return total

    def choose_worker_to_help(self, target_sessions):
        """
        Port of Studio action 1262:
        - triggered on the selected running colleague session
        - resolves the helper session from context["helper_session_id"]
        - copies target WO/display data onto helper session
        - enables helper mode
        - returns to the helper session form
        """
        Session = self.env["x_shopfloor_session"]
        ctx = self.env.context or {}

        target_sess = target_sessions[:1] if target_sessions else False

        if not target_sess:
            raise UserError("No session selected.")

        target_sess.ensure_one()

        if not self._has(target_sess, "x_employee_id") or not target_sess.x_employee_id:
            raise UserError("Target session has no employee.")

        if not self._has(target_sess, "x_workorder_id") or not target_sess.x_workorder_id:
            raise UserError("Target session has no work order.")

        helper_session_id = ctx.get("helper_session_id")

        if not helper_session_id:
            raise UserError("Helper session not found in context.")

        try:
            helper_sess = Session.browse(int(helper_session_id))
        except Exception:
            helper_sess = Session.browse([])

        if not helper_sess or not helper_sess.exists():
            raise UserError("Helper session could not be resolved.")

        helper_sess.ensure_one()

        # Safety: prevent helping yourself.
        if (
            self._has(helper_sess, "x_employee_id")
            and helper_sess.x_employee_id
            and helper_sess.x_employee_id.id == target_sess.x_employee_id.id
        ):
            raise UserError("You cannot help yourself.")

        wo = target_sess.x_workorder_id

        try:
            now = self._common().now()
        except Exception:
            now = target_sess.write_date or target_sess.create_date

        # ----------------------------------------------------------
        # Collect display data for the helper session
        # ----------------------------------------------------------
        op_tmpl = False
        prod = False
        mo = False
        mo_name = ""
        mo_number = ""
        qty_planned = 0.0
        expected_min = 0.0
        actual_min = 0.0
        wc = False

        try:
            if self._has(wo, "workcenter_id") and wo.workcenter_id:
                wc = wo.workcenter_id
        except Exception:
            wc = False

        # Operation template.
        try:
            if (
                self._has(target_sess, "x_operation_template_id")
                and target_sess.x_operation_template_id
            ):
                op_tmpl = target_sess.x_operation_template_id

            elif self._has(wo, "operation_id") and wo.operation_id:
                op = wo.operation_id

                if self._has(op, "x_operation_template_id") and op.x_operation_template_id:
                    op_tmpl = op.x_operation_template_id
        except Exception:
            op_tmpl = False

        # MO / product / qty.
        try:
            if self._has(wo, "production_id") and wo.production_id:
                mo = wo.production_id
                mo_name = mo.name or ""

                if self._has(mo, "product_id") and mo.product_id:
                    prod = mo.product_id

                if self._has(mo, "product_qty") and mo.product_qty:
                    qty_planned = float(mo.product_qty or 0.0)
        except Exception:
            pass

        # MO number short.
        try:
            if mo_name:
                # parts = mo_name.split("/")
                # mo_number = parts[-1] if parts else mo_name
                mo_number = mo_name or ""
        except Exception:
            mo_number = mo_name or ""

        # Expected + actual duration for helped employee on this WO.
        try:
            if hasattr(wo, "_shopfloor_expected_total_minutes"):
                expected_total = float(wo._shopfloor_expected_total_minutes() or 0.0)
            elif self._has(wo, "duration_expected") and wo.duration_expected:
                expected_total = float(wo.duration_expected or 0.0)
            else:
                expected_total = 0.0

            actual_min = self._worked_minutes_for_employee_wo(
                target_sess.x_employee_id,
                wo,
                now,
            )

            expected_min = expected_total - actual_min

            if expected_min < 0.0:
                expected_min = 0.0

        except Exception:
            expected_min = 0.0
            actual_min = 0.0

        # ----------------------------------------------------------
        # Apply helper mode + fill display fields
        # ----------------------------------------------------------
        vals = {}

        if self._has(helper_sess, "x_is_helper_mode"):
            vals["x_is_helper_mode"] = True

        if self._has(helper_sess, "x_helped_employee_id"):
            vals["x_helped_employee_id"] = target_sess.x_employee_id.id

        if self._has(helper_sess, "x_workorder_id"):
            vals["x_workorder_id"] = wo.id

        if op_tmpl and self._has(helper_sess, "x_operation_template_id"):
            vals["x_operation_template_id"] = op_tmpl.id

        if prod and self._has(helper_sess, "x_product_id"):
            vals["x_product_id"] = prod.id

        if mo and self._has(helper_sess, "x_mo_id"):
            vals["x_mo_id"] = mo.id

        if self._has(helper_sess, "x_mo_number"):
            vals["x_mo_number"] = mo_number or False

        if self._has(helper_sess, "x_qty_planned"):
            vals["x_qty_planned"] = qty_planned

        if self._has(helper_sess, "x_expected_duration_min"):
            vals["x_expected_duration_min"] = expected_min

        if self._has(helper_sess, "x_actual_duration_min"):
            vals["x_actual_duration_min"] = actual_min

        if wc and self._has(helper_sess, "x_workcenter_id"):
            vals["x_workcenter_id"] = wc.id

        if vals:
            helper_sess.write(vals)

        _logger.warning(
            "[SHOPFLOOR_HELP_SERVICE] choose_worker_to_help | helper_session=%s helper_emp=%s target_session=%s helped_emp=%s wo=%s qty=%s expected_min=%s actual_min=%s",
            helper_sess.id,
            helper_sess.x_employee_id.id if self._has(helper_sess, "x_employee_id") and helper_sess.x_employee_id else False,
            target_sess.id,
            target_sess.x_employee_id.id,
            wo.id,
            qty_planned,
            expected_min,
            actual_min,
        )

        return self._open_session_action(helper_sess)

    def back_to_helper_session(self, target_sessions):
        ctx = self.env.context or {}

        helper_session_id = ctx.get("helper_session_id")

        if not helper_session_id:
            raise UserError("Original helper session is missing from context.")

        try:
            helper_sess = self.env["x_shopfloor_session"].browse(
                int(helper_session_id)
            ).exists()
        except Exception:
            helper_sess = self.env["x_shopfloor_session"].browse([])

        if not helper_sess:
            raise UserError("Original helper session no longer exists.")

        helper_sess.ensure_one()

        return self._open_session_action(helper_sess)
    