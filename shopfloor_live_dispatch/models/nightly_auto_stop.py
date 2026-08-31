import datetime
import logging

import pytz

from odoo import api, fields, models


_logger = logging.getLogger(__name__)

LOCAL_TIMEZONE = "Europe/Bucharest"
AUTO_STOP_HOUR = 23
AUTO_STOP_MINUTE = 15
LAST_CUTOFF_PARAM = "shopfloor_live_dispatch.last_nightly_auto_stop_cutoff"


class HrEmployee(models.Model):
    _inherit = "hr.employee"

    # ------------------------------------------------------------------
    # Generic helpers
    # ------------------------------------------------------------------
    @api.model
    def _shopfloor_has_field(self, model_or_record, field_name):
        try:
            return field_name in model_or_record._fields
        except Exception:
            return False

    @api.model
    def _shopfloor_minutes_between(self, start_dt, end_dt):
        if not start_dt or not end_dt or end_dt <= start_dt:
            return 0.0

        delta = end_dt - start_dt
        return max(
            0.0,
            (
                delta.days * 86400
                + delta.seconds
                + delta.microseconds / 1000000.0
            )
            / 60.0,
        )

    @api.model
    def _shopfloor_selection_value(self, model_or_record, field_name, candidates):
        """Return the first candidate supported by a selection field."""
        try:
            field = model_or_record._fields.get(field_name)
            if not field:
                return False

            choices = field._description_selection(self.env)
            values = {value for value, _label in choices}

            for candidate in candidates:
                if candidate in values:
                    return candidate
        except Exception:
            pass

        return False

    @api.model
    def _shopfloor_latest_cutoff_utc(self):
        """Return the most recent local 23:15 as a naive UTC datetime."""
        timezone = pytz.timezone(LOCAL_TIMEZONE)

        now_utc = fields.Datetime.now().replace(tzinfo=pytz.UTC)
        now_local = now_utc.astimezone(timezone)

        cutoff_date = now_local.date()
        candidate_local = timezone.localize(
            datetime.datetime.combine(
                cutoff_date,
                datetime.time(AUTO_STOP_HOUR, AUTO_STOP_MINUTE),
            )
        )

        if now_local < candidate_local:
            cutoff_date -= datetime.timedelta(days=1)
            candidate_local = timezone.localize(
                datetime.datetime.combine(
                    cutoff_date,
                    datetime.time(AUTO_STOP_HOUR, AUTO_STOP_MINUTE),
                )
            )

        cutoff_utc = candidate_local.astimezone(pytz.UTC).replace(tzinfo=None)
        return cutoff_utc, cutoff_date

    # ------------------------------------------------------------------
    # Activity/context detection
    # ------------------------------------------------------------------
    @api.model
    def _shopfloor_log_activity_type(self, log_rec, session=False):
        try:
            if (
                self._shopfloor_has_field(log_rec, "x_activity_type")
                and log_rec.x_activity_type in ("production", "helper", "other")
            ):
                return log_rec.x_activity_type
        except Exception:
            pass

        try:
            if self._shopfloor_has_field(log_rec, "x_is_helper") and log_rec.x_is_helper:
                return "helper"
        except Exception:
            pass

        try:
            if (
                session
                and self._shopfloor_has_field(session, "x_is_helper_mode")
                and session.x_is_helper_mode
            ):
                return "helper"
        except Exception:
            pass

        try:
            has_other_operation = (
                self._shopfloor_has_field(log_rec, "x_other_operation_id")
                and bool(log_rec.x_other_operation_id)
            )
            has_workorder = (
                self._shopfloor_has_field(log_rec, "x_workorder_id")
                and bool(log_rec.x_workorder_id)
            )
            if has_other_operation and not has_workorder:
                return "other"
        except Exception:
            pass

        return "production"

    @api.model
    def _shopfloor_session_matches_log(self, session, log_rec, cutoff_utc):
        """
        Avoid resetting a kiosk session that has already moved to newer work.
        Only return True when its current context still matches this old log.
        """
        if not session or not session.exists():
            return False

        try:
            log_emp = log_rec.x_employee_id
            sess_emp = session.x_employee_id
            if not log_emp or not sess_emp or log_emp.id != sess_emp.id:
                return False
        except Exception:
            return False

        # A newer open log on this same session means the session was reused.
        try:
            Log = self.env["x_wo_time_log"]
            newer_domain = [
                ("x_session_id", "=", session.id),
                ("x_state", "in", ["running", "pause"]),
                ("x_end_dt", "=", False),
                ("x_start_dt", ">", cutoff_utc),
            ]
            if Log.search(newer_domain, limit=1):
                return False
        except Exception:
            pass

        activity_type = self._shopfloor_log_activity_type(log_rec, session=session)

        if activity_type in ("production", "helper"):
            try:
                log_wo = log_rec.x_workorder_id
                sess_wo = session.x_workorder_id
                if not log_wo or not sess_wo or log_wo.id != sess_wo.id:
                    return False
            except Exception:
                return False

            if activity_type == "helper":
                try:
                    if (
                        self._shopfloor_has_field(session, "x_is_helper_mode")
                        and not session.x_is_helper_mode
                    ):
                        return False
                except Exception:
                    pass

            return True

        # Other activity.
        try:
            log_other = (
                log_rec.x_other_operation_id
                if self._shopfloor_has_field(log_rec, "x_other_operation_id")
                else False
            )
            sess_other = (
                session.x_other_operation_id
                if self._shopfloor_has_field(session, "x_other_operation_id")
                else False
            )

            if log_other and sess_other:
                return log_other.id == sess_other.id

            return bool(
                self._shopfloor_has_field(session, "x_activity_type")
                and session.x_activity_type == "other"
                and not (
                    self._shopfloor_has_field(session, "x_workorder_id")
                    and session.x_workorder_id
                )
            )
        except Exception:
            return False

    @api.model
    def _shopfloor_find_matching_session(self, log_rec, cutoff_utc):
        Session = self.env["x_shopfloor_session"]

        try:
            if (
                self._shopfloor_has_field(log_rec, "x_session_id")
                and log_rec.x_session_id
                and self._shopfloor_session_matches_log(
                    log_rec.x_session_id,
                    log_rec,
                    cutoff_utc,
                )
            ):
                return log_rec.x_session_id
        except Exception:
            pass

        if not log_rec.x_employee_id:
            return Session.browse([])

        domain = [("x_employee_id", "=", log_rec.x_employee_id.id)]
        activity_type = self._shopfloor_log_activity_type(log_rec)

        if activity_type in ("production", "helper"):
            try:
                if log_rec.x_workorder_id:
                    domain.append(("x_workorder_id", "=", log_rec.x_workorder_id.id))
            except Exception:
                return Session.browse([])
        else:
            try:
                if (
                    self._shopfloor_has_field(Session, "x_other_operation_id")
                    and log_rec.x_other_operation_id
                ):
                    domain.append(
                        ("x_other_operation_id", "=", log_rec.x_other_operation_id.id)
                    )
            except Exception:
                pass

        candidates = Session.search(domain, order="write_date desc, id desc", limit=10)
        for session in candidates:
            if self._shopfloor_session_matches_log(session, log_rec, cutoff_utc):
                return session

        return Session.browse([])

    @api.model
    def _shopfloor_slot_matches_log(self, slot, log_rec, cutoff_utc, activity_type):
        if not slot or not slot.exists():
            return False

        try:
            if slot.x_employee_id.id != log_rec.x_employee_id.id:
                return False
        except Exception:
            return False

        try:
            if (
                self._shopfloor_has_field(slot, "x_date_start")
                and slot.x_date_start
                and slot.x_date_start > cutoff_utc
            ):
                return False
        except Exception:
            return False

        try:
            if (
                self._shopfloor_has_field(slot, "x_state")
                and slot.x_state not in ("in_progress", "planned")
            ):
                return False
        except Exception:
            pass

        if activity_type in ("production", "helper"):
            try:
                return bool(
                    slot.x_workorder_id
                    and log_rec.x_workorder_id
                    and slot.x_workorder_id.id == log_rec.x_workorder_id.id
                )
            except Exception:
                return False

        try:
            if (
                self._shopfloor_has_field(slot, "x_other_operation_id")
                and slot.x_other_operation_id
                and self._shopfloor_has_field(log_rec, "x_other_operation_id")
                and log_rec.x_other_operation_id
            ):
                return slot.x_other_operation_id.id == log_rec.x_other_operation_id.id

            return bool(
                (
                    self._shopfloor_has_field(slot, "x_activity_type")
                    and slot.x_activity_type == "other"
                )
                or (
                    self._shopfloor_has_field(slot, "x_is_other_operation_interval")
                    and slot.x_is_other_operation_interval
                )
            )
        except Exception:
            return False

    @api.model
    def _shopfloor_find_matching_slot(self, log_rec, session, cutoff_utc, activity_type):
        Slot = self.env["x_wo_emp_slot"]

        try:
            if (
                session
                and self._shopfloor_has_field(session, "x_current_slot_id")
                and session.x_current_slot_id
                and self._shopfloor_slot_matches_log(
                    session.x_current_slot_id,
                    log_rec,
                    cutoff_utc,
                    activity_type,
                )
            ):
                return session.x_current_slot_id
        except Exception:
            pass

        domain = [
            ("x_employee_id", "=", log_rec.x_employee_id.id),
            ("x_state", "in", ["in_progress", "planned"]),
            ("x_date_start", "<=", cutoff_utc),
        ]

        if self._shopfloor_has_field(Slot, "x_plan_type"):
            domain.append(("x_plan_type", "=", "dynamic"))

        if activity_type in ("production", "helper"):
            if not log_rec.x_workorder_id:
                return Slot.browse([])
            domain.append(("x_workorder_id", "=", log_rec.x_workorder_id.id))
        else:
            if (
                self._shopfloor_has_field(Slot, "x_other_operation_id")
                and self._shopfloor_has_field(log_rec, "x_other_operation_id")
                and log_rec.x_other_operation_id
            ):
                domain.append(
                    ("x_other_operation_id", "=", log_rec.x_other_operation_id.id)
                )
            elif self._shopfloor_has_field(Slot, "x_activity_type"):
                domain.append(("x_activity_type", "=", "other"))
            elif self._shopfloor_has_field(Slot, "x_is_other_operation_interval"):
                domain.append(("x_is_other_operation_interval", "=", True))

        candidates = Slot.search(domain, order="x_date_start desc, id desc", limit=10)
        for slot in candidates:
            if self._shopfloor_slot_matches_log(
                slot,
                log_rec,
                cutoff_utc,
                activity_type,
            ):
                return slot

        return Slot.browse([])

    @api.model
    def _shopfloor_slot_activity_type(self, slot):
        try:
            if (
                self._shopfloor_has_field(slot, "x_activity_type")
                and slot.x_activity_type in ("production", "helper", "other")
            ):
                return slot.x_activity_type
        except Exception:
            pass

        try:
            if self._shopfloor_has_field(slot, "x_is_helper") and slot.x_is_helper:
                return "helper"
        except Exception:
            pass

        try:
            if (
                self._shopfloor_has_field(slot, "x_is_other_operation_interval")
                and slot.x_is_other_operation_interval
            ):
                return "other"
        except Exception:
            pass

        try:
            if (
                self._shopfloor_has_field(slot, "x_other_operation_id")
                and slot.x_other_operation_id
                and not (
                    self._shopfloor_has_field(slot, "x_workorder_id")
                    and slot.x_workorder_id
                )
            ):
                return "other"
        except Exception:
            pass

        return "production"

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------
    @api.model
    def _shopfloor_close_log(self, log_rec, cutoff_utc):
        start_dt = log_rec.x_start_dt if log_rec.x_start_dt else False
        end_dt = cutoff_utc

        if start_dt and end_dt < start_dt:
            end_dt = start_dt

        minutes = self._shopfloor_minutes_between(start_dt, end_dt)
        vals = {}

        if self._shopfloor_has_field(log_rec, "x_end_dt"):
            vals["x_end_dt"] = end_dt
        if self._shopfloor_has_field(log_rec, "x_duration_min"):
            vals["x_duration_min"] = minutes
        if self._shopfloor_has_field(log_rec, "x_state"):
            vals["x_state"] = "done"
        if self._shopfloor_has_field(log_rec, "x_qty_done"):
            vals["x_qty_done"] = 0.0

        log_rec.write(vals)
        return start_dt, end_dt, minutes

    @api.model
    def _shopfloor_close_slot(
        self,
        slot,
        log_rec,
        start_dt,
        end_dt,
        minutes,
        activity_type,
    ):
        if not slot:
            return False

        vals = {}

        if self._shopfloor_has_field(slot, "x_state"):
            vals["x_state"] = "done"
        if self._shopfloor_has_field(slot, "x_date_start") and start_dt:
            vals["x_date_start"] = start_dt
        if self._shopfloor_has_field(slot, "x_date_end"):
            vals["x_date_end"] = end_dt
        if self._shopfloor_has_field(slot, "x_minutes"):
            vals["x_minutes"] = minutes
        if self._shopfloor_has_field(slot, "x_actual_duration_min"):
            vals["x_actual_duration_min"] = minutes
        if self._shopfloor_has_field(slot, "x_qty_done"):
            vals["x_qty_done"] = 0.0
        if self._shopfloor_has_field(slot, "x_interval_qty_done"):
            vals["x_interval_qty_done"] = 0.0

        if self._shopfloor_has_field(slot, "x_activity_type"):
            activity_value = self._shopfloor_selection_value(
                slot,
                "x_activity_type",
                [activity_type],
            )
            if activity_value:
                vals["x_activity_type"] = activity_value

        if self._shopfloor_has_field(slot, "x_is_helper"):
            vals["x_is_helper"] = activity_type == "helper"
        if self._shopfloor_has_field(slot, "x_is_other_operation_interval"):
            vals["x_is_other_operation_interval"] = activity_type == "other"

        if (
            activity_type == "other"
            and log_rec
            and self._shopfloor_has_field(log_rec, "x_other_operation_id")
            and log_rec.x_other_operation_id
            and self._shopfloor_has_field(slot, "x_other_operation_id")
        ):
            vals["x_other_operation_id"] = log_rec.x_other_operation_id.id

        status = False
        color = False

        if activity_type == "other":
            status = self._shopfloor_selection_value(
                slot,
                "x_gantt_status",
                ["other_activities", "other_operation"],
            )
            color = 3
        elif activity_type == "helper":
            status = self._shopfloor_selection_value(
                slot,
                "x_gantt_status",
                ["helper", "help"],
            )
            color = 4
        else:
            planned_minutes = 0.0
            for field_name in ("x_duration_expected", "x_minutes_planned"):
                try:
                    if self._shopfloor_has_field(slot, field_name) and slot[field_name]:
                        planned_minutes = float(slot[field_name] or 0.0)
                        break
                except Exception:
                    pass

            is_slow = bool(planned_minutes and minutes > planned_minutes + 0.01)
            if is_slow:
                status = self._shopfloor_selection_value(
                    slot,
                    "x_gantt_status",
                    ["incomplete_slow", "incomplete"],
                )
                color = 2
            else:
                status = self._shopfloor_selection_value(
                    slot,
                    "x_gantt_status",
                    ["incomplete_fast", "incomplete"],
                )
                color = 10 if status == "incomplete_fast" else 2

        if status and self._shopfloor_has_field(slot, "x_gantt_status"):
            vals["x_gantt_status"] = status
        if color is not False and self._shopfloor_has_field(slot, "x_gantt_color"):
            vals["x_gantt_color"] = color

        slot.with_context(
            no_overlap_check=True,
            skip_overlap_guard=True,
            slot_sync_running=True,
            wo_done_reconcile_running=True,
        ).write(vals)

        return True

    @api.model
    def _shopfloor_close_productivity_for(
        self,
        workorder,
        employee,
        cutoff_utc,
    ):
        if "mrp.workcenter.productivity" not in self.env or not workorder:
            return 0

        Productivity = self.env["mrp.workcenter.productivity"]
        domain = [
            ("workorder_id", "=", workorder.id),
            ("date_end", "=", False),
        ]

        if self._shopfloor_has_field(Productivity, "date_start"):
            domain.append(("date_start", "<=", cutoff_utc))

        if self._shopfloor_has_field(Productivity, "employee_id") and employee:
            domain.append(("employee_id", "=", employee.id))

        lines = Productivity.search(domain)
        if lines:
            lines.write({"date_end": cutoff_utc})

        return len(lines)

    @api.model
    def _shopfloor_close_productivity(self, log_rec, cutoff_utc):
        try:
            workorder = log_rec.x_workorder_id
        except Exception:
            workorder = False

        try:
            employee = log_rec.x_employee_id
        except Exception:
            employee = False

        return self._shopfloor_close_productivity_for(
            workorder,
            employee,
            cutoff_utc,
        )

    @api.model
    def _shopfloor_clear_session_values(
        self,
        session,
        cutoff_utc,
        reservation_release_reason="nightly_auto_stop",
    ):
        # Nightly auto-stop records zero completed quantity, therefore
        # unresolved component reservations must be returned before the
        # session loses its WO context.
        try:
            if (
                session
                and session.exists()
                and "shopfloor.component.flow.service" in self.env
            ):
                released_count = self.env[
                    "shopfloor.component.flow.service"
                ].release_session(
                    session,
                    reason=reservation_release_reason,
                )

                if released_count:
                    _logger.warning(
                        "[NIGHTLY_AUTO_STOP] component reservations released | "
                        "session=%s reason=%s lines=%s",
                        session.id,
                        reservation_release_reason,
                        released_count,
                    )

        except Exception as exc:
            _logger.exception(
                "[NIGHTLY_AUTO_STOP] component reservation release failed | "
                "session=%s error=%s",
                session.id if session else False,
                exc,
            )

            # Do not clear the session if its component reservation could not
            # be released. Otherwise the reservation could remain permanently
            # attached to a session with no operation context.
            raise

        vals = {}

        for field_name in (
            "x_workorder_id",
            "x_operation_template_id",
            "x_other_operation_id",
            "x_current_slot_id",
            "x_helped_employee_id",
        ):
            if self._shopfloor_has_field(session, field_name):
                vals[field_name] = False

        if self._shopfloor_has_field(session, "x_is_helper_mode"):
            vals["x_is_helper_mode"] = False
        if self._shopfloor_has_field(session, "x_activity_type"):
            vals["x_activity_type"] = False
        if self._shopfloor_has_field(session, "x_ui_state"):
            ui_value = self._shopfloor_selection_value(
                session,
                "x_ui_state",
                ["not_started"],
            )
            if ui_value:
                vals["x_ui_state"] = ui_value
        if self._shopfloor_has_field(session, "x_state"):
            state_value = self._shopfloor_selection_value(
                session,
                "x_state",
                ["active"],
            )
            if state_value:
                vals["x_state"] = state_value

        for field_name in (
            "x_employee_text",
            "x_operation_template_text",
            "x_wc_text",
            "x_product_mo_text",
        ):
            if self._shopfloor_has_field(session, field_name):
                vals[field_name] = False

        for field_name in (
            "x_qty_planned",
            "x_expected_duration_min",
            "x_actual_duration_min",
        ):
            if self._shopfloor_has_field(session, field_name):
                vals[field_name] = 0.0

        if self._shopfloor_has_field(session, "x_last_seen_at"):
            vals["x_last_seen_at"] = cutoff_utc

        if vals:
            session.write(vals)

        return True

    @api.model
    def _shopfloor_reset_matching_session(self, session, log_rec, cutoff_utc):
        if not self._shopfloor_session_matches_log(session, log_rec, cutoff_utc):
            return False

        return self._shopfloor_clear_session_values(session, cutoff_utc)

    @api.model
    def _shopfloor_reset_session_for_slot(self, session, slot, cutoff_utc):
        if not session or not slot:
            return False

        try:
            if not session.x_current_slot_id or session.x_current_slot_id.id != slot.id:
                return False
        except Exception:
            return False

        # Do not reset a session that already owns newer running work.
        try:
            newer_log = self.env["x_wo_time_log"].search(
                [
                    ("x_session_id", "=", session.id),
                    ("x_state", "in", ["running", "pause"]),
                    ("x_end_dt", "=", False),
                    ("x_start_dt", ">", cutoff_utc),
                ],
                limit=1,
            )
            if newer_log:
                return False
        except Exception:
            pass

        return self._shopfloor_clear_session_values(session, cutoff_utc)

    @api.model
    def _shopfloor_return_workorder_to_pool(self, workorder):
        if not workorder or not workorder.exists():
            return False

        Log = self.env["x_wo_time_log"]
        running_domain = [
            ("x_workorder_id", "=", workorder.id),
            ("x_state", "in", ["running", "pause"]),
            ("x_end_dt", "=", False),
        ]
        if Log.search(running_domain, limit=1):
            return False

        try:
            if workorder.state in ("done", "cancel"):
                return False
        except Exception:
            pass

        try:
            workorder.button_pending()
        except Exception as exc:
            _logger.warning(
                "[NIGHTLY_AUTO_STOP] button_pending failed | wo=%s error=%s",
                workorder.id,
                exc,
            )

        try:
            if self._shopfloor_has_field(workorder, "state") and workorder.state not in (
                "done",
                "cancel",
            ):
                workorder.write({"state": "ready"})
                return True
        except Exception as exc:
            _logger.warning(
                "[NIGHTLY_AUTO_STOP] force-ready failed | wo=%s error=%s",
                workorder.id,
                exc,
            )

        return False

    @api.model
    def _shopfloor_close_orphan_slots(
        self,
        cutoff_utc,
        employee_names=None,
        excluded_slot_ids=None,
        dry_run=False,
    ):
        """
        Close Gantt slots still marked in_progress even when their time log or
        kiosk session was already closed by another path. This is important
        because the running-operations email reads running slots.
        """
        Slot = self.env["x_wo_emp_slot"]
        Session = self.env["x_shopfloor_session"]
        excluded_slot_ids = set(excluded_slot_ids or [])

        domain = [
            ("x_state", "=", "in_progress"),
            ("x_date_start", "<=", cutoff_utc),
        ]

        if employee_names:
            employees = self.search([("name", "in", employee_names)])
            domain.append(("x_employee_id", "in", employees.ids))

        slots = Slot.search(domain, order="x_date_start asc, id asc")
        preview = []
        result = {
            "dynamic_closed": 0,
            "baseline_released": 0,
            "sessions_reset": 0,
            "productivity_closed": 0,
            "workorders": self.env["mrp.workorder"],
            "closed_slot_ids": [],
            "errors": [],
        }

        for slot in slots:
            if slot.id in excluded_slot_ids:
                continue

            preview.append(
                {
                    "slot_id": slot.id,
                    "employee": (
                        slot.x_employee_id.display_name
                        if slot.x_employee_id
                        else False
                    ),
                    "workorder": (
                        slot.x_workorder_id.display_name
                        if self._shopfloor_has_field(slot, "x_workorder_id")
                        and slot.x_workorder_id
                        else False
                    ),
                    "plan_type": (
                        slot.x_plan_type
                        if self._shopfloor_has_field(slot, "x_plan_type")
                        else False
                    ),
                    "start": slot.x_date_start,
                }
            )

            if dry_run:
                continue

            try:
                with self.env.cr.savepoint():
                    plan_type = (
                        slot.x_plan_type
                        if self._shopfloor_has_field(slot, "x_plan_type")
                        else False
                    )

                    # START may mark a baseline slot in_progress only for visual
                    # synchronization. Release it back to planned; it is not the
                    # actual worked interval.
                    if plan_type == "baseline":
                        vals = {"x_state": "planned"}
                        if self._shopfloor_has_field(slot, "x_gantt_status"):
                            vals["x_gantt_status"] = False
                        if self._shopfloor_has_field(slot, "x_gantt_color"):
                            vals["x_gantt_color"] = 0
                        slot.with_context(
                            no_overlap_check=True,
                            skip_overlap_guard=True,
                            slot_sync_running=True,
                        ).write(vals)
                        result["baseline_released"] += 1
                        result["closed_slot_ids"].append(slot.id)
                        continue

                    start_dt = slot.x_date_start or cutoff_utc
                    end_dt = cutoff_utc if cutoff_utc >= start_dt else start_dt
                    minutes = self._shopfloor_minutes_between(start_dt, end_dt)
                    activity_type = self._shopfloor_slot_activity_type(slot)

                    self._shopfloor_close_slot(
                        slot,
                        False,
                        start_dt,
                        end_dt,
                        minutes,
                        activity_type,
                    )
                    result["dynamic_closed"] += 1
                    result["closed_slot_ids"].append(slot.id)

                    employee = (
                        slot.x_employee_id
                        if self._shopfloor_has_field(slot, "x_employee_id")
                        else False
                    )
                    workorder = (
                        slot.x_workorder_id
                        if self._shopfloor_has_field(slot, "x_workorder_id")
                        else False
                    )

                    result["productivity_closed"] += (
                        self._shopfloor_close_productivity_for(
                            workorder,
                            employee,
                            cutoff_utc,
                        )
                    )

                    if workorder:
                        result["workorders"] |= workorder

                    if self._shopfloor_has_field(Session, "x_current_slot_id"):
                        sessions = Session.search(
                            [("x_current_slot_id", "=", slot.id)],
                            limit=10,
                        )
                        for session in sessions:
                            if self._shopfloor_reset_session_for_slot(
                                session,
                                slot,
                                cutoff_utc,
                            ):
                                result["sessions_reset"] += 1

                    _logger.warning(
                        "[NIGHTLY_AUTO_STOP] orphan slot closed | slot=%s "
                        "employee=%s activity=%s start=%s cutoff=%s minutes=%s",
                        slot.id,
                        employee.id if employee else False,
                        activity_type,
                        start_dt,
                        cutoff_utc,
                        minutes,
                    )

            except Exception as exc:
                result["errors"].append(
                    {
                        "slot_id": slot.id,
                        "employee": (
                            slot.x_employee_id.display_name
                            if slot.x_employee_id
                            else False
                        ),
                        "error": str(exc),
                    }
                )
                _logger.exception(
                    "[NIGHTLY_AUTO_STOP] orphan slot failed | slot=%s",
                    slot.id,
                )

        if dry_run:
            return {"count": len(preview), "records": preview}

        return result

    @api.model
    def _shopfloor_cleanup_unstarted_selections(
        self,
        cutoff_utc,
        employee_names=None,
        dry_run=False,
    ):
        """
        Release component reservations belonging to operations that were
        selected before the nightly cutoff but never started.

        Safety rules:
        - session must still be in not_started state;
        - session must still point to the same WO as its reservations;
        - all active reservations of the session must be older than cutoff;
        - there must be no running/pause log;
        - there must be no active current slot.
        """
        Reservation = self.env[
            "shopfloor.component.reservation"
        ]
        Session = self.env[
            "x_shopfloor_session"
        ]
        Log = self.env[
            "x_wo_time_log"
        ]

        reservation_domain = [
            ("x_state", "=", "reserved"),
            ("x_session_id", "!=", False),
            ("create_date", "<=", cutoff_utc),
        ]

        employee_ids = []

        if employee_names:
            employees = self.search([
                ("name", "in", employee_names),
            ])

            employee_ids = employees.ids

            reservation_domain.append(
                (
                    "x_session_id.x_employee_id",
                    "in",
                    employee_ids,
                )
            )

        old_reserved_lines = Reservation.search(
            reservation_domain,
            order="create_date asc, id asc",
        )

        candidate_sessions = old_reserved_lines.mapped(
            "x_session_id"
        ).exists()

        preview = []
        result = {
            "sessions_reset": 0,
            "reservations_released": 0,
            "records": [],
            "errors": [],
        }

        for session in candidate_sessions:
            try:
                if not session.exists():
                    continue

                if (
                    self._shopfloor_has_field(
                        session,
                        "x_state",
                    )
                    and session.x_state != "active"
                ):
                    continue

                if (
                    not self._shopfloor_has_field(
                        session,
                        "x_ui_state",
                    )
                    or session.x_ui_state != "not_started"
                ):
                    continue

                if (
                    not self._shopfloor_has_field(
                        session,
                        "x_workorder_id",
                    )
                    or not session.x_workorder_id
                ):
                    continue

                workorder = session.x_workorder_id

                active_lines = Reservation.search([
                    ("x_session_id", "=", session.id),
                    ("x_state", "=", "reserved"),
                ])

                if not active_lines:
                    continue

                # A newer reservation means the session was reused after
                # the cutoff. Do not clear the new selection.
                newer_lines = active_lines.filtered(
                    lambda line:
                    line.create_date
                    and line.create_date > cutoff_utc
                )

                if newer_lines:
                    _logger.warning(
                        "[NIGHTLY_AUTO_STOP] unstarted selection skipped; "
                        "newer reservation exists | session=%s "
                        "newer_lines=%s cutoff=%s",
                        session.id,
                        newer_lines.ids,
                        cutoff_utc,
                    )
                    continue

                # Never clear a session whose current WO differs from the
                # reservation's WO.
                mismatched_lines = active_lines.filtered(
                    lambda line:
                    not line.x_workorder_id
                    or line.x_workorder_id.id != workorder.id
                )

                if mismatched_lines:
                    _logger.warning(
                        "[NIGHTLY_AUTO_STOP] unstarted selection skipped; "
                        "reservation WO mismatch | session=%s "
                        "session_wo=%s lines=%s",
                        session.id,
                        workorder.id,
                        mismatched_lines.ids,
                    )
                    continue

                # A log means this selection was actually started and must
                # be handled by the normal running-log path.
                log_domain = [
                    ("x_state", "in", ["running", "pause"]),
                    ("x_end_dt", "=", False),
                ]

                if self._shopfloor_has_field(
                    Log,
                    "x_session_id",
                ):
                    log_domain.append(
                        ("x_session_id", "=", session.id)
                    )
                else:
                    if session.x_employee_id:
                        log_domain.append(
                            (
                                "x_employee_id",
                                "=",
                                session.x_employee_id.id,
                            )
                        )

                    log_domain.append(
                        (
                            "x_workorder_id",
                            "=",
                            workorder.id,
                        )
                    )

                if Log.search(log_domain, limit=1):
                    continue

                # A current active slot means Start may already have run.
                current_slot = (
                    session.x_current_slot_id
                    if self._shopfloor_has_field(
                        session,
                        "x_current_slot_id",
                    )
                    else False
                )

                if current_slot:
                    slot_state = (
                        current_slot.x_state
                        if self._shopfloor_has_field(
                            current_slot,
                            "x_state",
                        )
                        else False
                    )

                    if slot_state in (
                        "in_progress",
                        "planned",
                    ):
                        continue

                record_info = {
                    "session_id": session.id,
                    "employee": (
                        session.x_employee_id.display_name
                        if session.x_employee_id
                        else False
                    ),
                    "workorder": workorder.display_name,
                    "reservation_ids": active_lines.ids,
                    "reservation_count": len(active_lines),
                    "oldest_reservation": min(
                        active_lines.mapped(
                            "create_date"
                        )
                    ) if active_lines else False,
                }

                preview.append(record_info)

                if dry_run:
                    continue

                with self.env.cr.savepoint():
                    released_count = len(active_lines)

                    self._shopfloor_clear_session_values(
                        session,
                        cutoff_utc,
                        reservation_release_reason=(
                            "nightly_unstarted_selection"
                        ),
                    )

                    result["sessions_reset"] += 1
                    result[
                        "reservations_released"
                    ] += released_count

                    _logger.warning(
                        "[NIGHTLY_AUTO_STOP] unstarted selection cleared | "
                        "session=%s employee=%s wo=%s "
                        "reservations=%s cutoff=%s",
                        session.id,
                        (
                            session.x_employee_id.id
                            if session.x_employee_id
                            else False
                        ),
                        workorder.id,
                        active_lines.ids,
                        cutoff_utc,
                    )

            except Exception as exc:
                error = {
                    "session_id": session.id,
                    "employee": (
                        session.x_employee_id.display_name
                        if session.x_employee_id
                        else False
                    ),
                    "error": str(exc),
                }

                result["errors"].append(error)

                _logger.exception(
                    "[NIGHTLY_AUTO_STOP] unstarted selection cleanup "
                    "failed | session=%s",
                    session.id,
                )

        if dry_run:
            return {
                "count": len(preview),
                "records": preview,
            }

        result["records"] = preview

        return result

    # ------------------------------------------------------------------
    # Main reusable method: manual repair + cron
    # ------------------------------------------------------------------
    @api.model
    def _shopfloor_auto_stop_at(
        self,
        cutoff_utc,
        employee_names=None,
        dry_run=False,
    ):
        """
        Close every dangling activity that started on/before cutoff_utc.

        employee_names is optional and is useful for a one-off repair.
        Datetimes passed here must be naive UTC, matching Odoo storage.
        """
        Log = self.env["x_wo_time_log"]

        domain = [
            ("x_state", "in", ["running", "pause"]),
            ("x_end_dt", "=", False),
            ("x_start_dt", "<=", cutoff_utc),
        ]

        if employee_names:
            employees = self.search([("name", "in", employee_names)])
            domain.append(("x_employee_id", "in", employees.ids))

        logs = Log.search(domain, order="x_start_dt asc, id asc")

        preview = [
            {
                "log_id": log_rec.id,
                "employee": log_rec.x_employee_id.display_name,
                "workorder": (
                    log_rec.x_workorder_id.display_name
                    if self._shopfloor_has_field(log_rec, "x_workorder_id")
                    and log_rec.x_workorder_id
                    else False
                ),
                "start": log_rec.x_start_dt,
            }
            for log_rec in logs
        ]

        if dry_run:
            orphan_preview = (
                self._shopfloor_close_orphan_slots(
                    cutoff_utc,
                    employee_names=employee_names,
                    dry_run=True,
                )
            )

            unstarted_preview = (
                self._shopfloor_cleanup_unstarted_selections(
                    cutoff_utc,
                    employee_names=employee_names,
                    dry_run=True,
                )
            )

            return {
                "cutoff_utc": cutoff_utc,
                "open_log_count": len(logs),
                "open_logs": preview,
                "orphan_slot_count": (
                    orphan_preview["count"]
                ),
                "orphan_slots": (
                    orphan_preview["records"]
                ),
                "unstarted_selection_count": (
                    unstarted_preview["count"]
                ),
                "unstarted_selections": (
                    unstarted_preview["records"]
                ),
            }

        result = {
            "cutoff_utc": cutoff_utc,
            "logs_closed": 0,
            "slots_closed": 0,
            "orphan_slots_closed": 0,
            "baseline_slots_released": 0,
            "sessions_reset": 0,
            "unstarted_selections_reset": 0,
            "unstarted_reservations_released": 0,
            "productivity_closed": 0,
            "workorders_returned": 0,
            "errors": [],
        }
        affected_workorders = self.env["mrp.workorder"]
        closed_slot_ids = set()

        for log_rec in logs:
            try:
                with self.env.cr.savepoint():
                    session = self._shopfloor_find_matching_session(log_rec, cutoff_utc)
                    activity_type = self._shopfloor_log_activity_type(
                        log_rec,
                        session=session,
                    )
                    slot = self._shopfloor_find_matching_slot(
                        log_rec,
                        session,
                        cutoff_utc,
                        activity_type,
                    )

                    start_dt, end_dt, minutes = self._shopfloor_close_log(
                        log_rec,
                        cutoff_utc,
                    )
                    result["logs_closed"] += 1

                    if slot and self._shopfloor_close_slot(
                        slot,
                        log_rec,
                        start_dt,
                        end_dt,
                        minutes,
                        activity_type,
                    ):
                        result["slots_closed"] += 1
                        closed_slot_ids.add(slot.id)

                    result["productivity_closed"] += self._shopfloor_close_productivity(
                        log_rec,
                        cutoff_utc,
                    )

                    if session and self._shopfloor_reset_matching_session(
                        session,
                        log_rec,
                        cutoff_utc,
                    ):
                        result["sessions_reset"] += 1

                    try:
                        if log_rec.x_workorder_id:
                            affected_workorders |= log_rec.x_workorder_id
                    except Exception:
                        pass

                    _logger.warning(
                        "[NIGHTLY_AUTO_STOP] closed | log=%s employee=%s "
                        "activity=%s slot=%s session=%s start=%s cutoff=%s "
                        "minutes=%s qty_done=0",
                        log_rec.id,
                        log_rec.x_employee_id.id if log_rec.x_employee_id else False,
                        activity_type,
                        slot.id if slot else False,
                        session.id if session else False,
                        start_dt,
                        cutoff_utc,
                        minutes,
                    )

            except Exception as exc:
                error = {
                    "log_id": log_rec.id,
                    "employee": (
                        log_rec.x_employee_id.display_name
                        if log_rec.x_employee_id
                        else False
                    ),
                    "error": str(exc),
                }
                result["errors"].append(error)
                _logger.exception(
                    "[NIGHTLY_AUTO_STOP] failed | log=%s employee=%s",
                    log_rec.id,
                    log_rec.x_employee_id.id if log_rec.x_employee_id else False,
                )

        orphan_result = self._shopfloor_close_orphan_slots(
            cutoff_utc,
            employee_names=employee_names,
            excluded_slot_ids=closed_slot_ids,
            dry_run=False,
        )
        result["orphan_slots_closed"] += orphan_result["dynamic_closed"]
        result["baseline_slots_released"] += orphan_result["baseline_released"]
        result["sessions_reset"] += orphan_result["sessions_reset"]
        result["productivity_closed"] += orphan_result["productivity_closed"]
        result["errors"].extend(
            orphan_result["errors"]
        )
        affected_workorders |= orphan_result[
            "workorders"
        ]

        # Any running sessions have already been handled above.
        # What remains here are reservations belonging to selections
        # that never reached Start.
        unstarted_result = (
            self._shopfloor_cleanup_unstarted_selections(
                cutoff_utc,
                employee_names=employee_names,
                dry_run=False,
            )
        )

        result["unstarted_selections_reset"] += (
            unstarted_result["sessions_reset"]
        )

        result[
            "unstarted_reservations_released"
        ] += unstarted_result[
            "reservations_released"
        ]

        result["sessions_reset"] += (
            unstarted_result["sessions_reset"]
        )

        result["errors"].extend(
            unstarted_result["errors"]
        )

        for workorder in affected_workorders:
            try:
                with self.env.cr.savepoint():
                    if self._shopfloor_return_workorder_to_pool(workorder):
                        result["workorders_returned"] += 1
            except Exception as exc:
                result["errors"].append(
                    {
                        "workorder_id": workorder.id,
                        "error": str(exc),
                    }
                )
                _logger.exception(
                    "[NIGHTLY_AUTO_STOP] workorder reset failed | wo=%s",
                    workorder.id,
                )

        _logger.warning("[NIGHTLY_AUTO_STOP] result=%s", result)
        return result

    @api.model
    def _cron_shopfloor_auto_stop_2315(self):
        """
        Run every 15 minutes, but process each Europe/Bucharest 23:15 cutoff once.
        This remains correct when Romania enters or leaves daylight-saving time.
        """
        cutoff_utc, cutoff_date = self._shopfloor_latest_cutoff_utc()
        cutoff_key = "%s|%s" % (cutoff_date.isoformat(), cutoff_utc.isoformat())

        Parameters = self.env["ir.config_parameter"].sudo()
        last_cutoff = Parameters.get_param(LAST_CUTOFF_PARAM)

        if last_cutoff == cutoff_key:
            return {
                "skipped": True,
                "reason": "cutoff_already_processed",
                "cutoff_utc": cutoff_utc,
            }

        result = self.sudo()._shopfloor_auto_stop_at(cutoff_utc)

        # Closed records are idempotently excluded on retry. Do not mark the
        # cutoff complete while any records failed, so a later cron can retry.
        if not result.get("errors"):
            Parameters.set_param(LAST_CUTOFF_PARAM, cutoff_key)

        return result
