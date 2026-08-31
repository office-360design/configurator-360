import logging

from odoo import models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

class ShopfloorLiveScanService(models.AbstractModel):
    _name = "shopfloor.live.scan.service"
    _description = "Shopfloor Live Scan Service"

    def _common(self):
        return self.env["shopfloor.live.common.service"]

    def _field_exists(self, model_or_rec, field_name):
        return self._common().field_exists(model_or_rec, field_name)

    def _has(self, model_or_rec, field_name):
        return self._field_exists(model_or_rec, field_name)
        
    def _now(self):
        return self._common().now()

    def _open_session_action(self, sess):
        return self._common().open_record_action(
            name="Production session",
            res_model="x_shopfloor_session",
            res_id=sess.id,
            view_mode="form",
            target="current",
        )

    # ------------------------------------------------------------
    # MAX ADDED - defensive session cleanup on badge scan
    # ------------------------------------------------------------
    def _clear_assignment_vals(self, sess):
        vals = {}

        for fname in [
            "x_workorder_id",
            "x_operation_template_id",
            "x_workcenter_id",
            "x_product_id",
            "x_mo_id",
            "x_current_slot_id",
            "x_helped_employee_id",
            "x_other_operation_id",
        ]:
            if self._has(sess, fname):
                vals[fname] = False

        for fname in [
            "x_operation_template_text",
            "x_wc_text",
            "x_product_text",
            "x_product_mo_text",
            "x_mo_number",
            "x_quantity_text",
            "x_duration_text",
        ]:
            if self._has(sess, fname):
                vals[fname] = False

        for fname in [
            "x_qty_planned",
            "x_expected_duration_min",
            "x_actual_duration_min",
        ]:
            if self._has(sess, fname):
                vals[fname] = 0.0

        if self._has(sess, "x_is_helper_mode"):
            vals["x_is_helper_mode"] = False

        if self._has(sess, "x_ui_state"):
            vals["x_ui_state"] = "not_started"

        if self._has(sess, "x_activity_type"):
            vals["x_activity_type"] = False

        return vals

    def _session_has_running_log(self, sess, emp):
        try:
            running = self.env["x_wo_time_log"].search(
                [
                    ("x_session_id", "=", sess.id),
                    ("x_employee_id", "=", emp.id),
                    ("x_state", "=", "running"),
                    ("x_end_dt", "=", False),
                ],
                limit=1,
            )
            return bool(running)
        except Exception:
            return False

    def _find_employee_running_logs(self, emp):
        """
        Find open intervals globally for the employee across ALL sessions.

        This covers production, helper and other activities because all three
        are represented by x_wo_time_log rows with:
            x_state = "running"
            x_end_dt = False
        """
        return self.env["x_wo_time_log"].search(
            [
                ("x_employee_id", "=", emp.id),
                ("x_state", "=", "running"),
                ("x_end_dt", "=", False),
            ],
            order="x_start_dt desc, id desc",
            limit=2,
        )

    def _running_log_activity_label(self, running_log):
        if not running_log:
            return "activitate necunoscută"

        try:
            if (
                self._has(running_log, "x_workorder_id")
                and running_log.x_workorder_id
            ):
                prefix = ""

                if (
                    self._has(running_log, "x_activity_type")
                    and running_log.x_activity_type == "helper"
                ):
                    prefix = "Ajutor - "

                return (
                    prefix
                    + (
                        running_log.x_workorder_id.display_name
                        or "operație de producție"
                    )
                )
        except Exception:
            pass

        try:
            if (
                self._has(running_log, "x_other_operation_id")
                and running_log.x_other_operation_id
            ):
                return (
                    running_log.x_other_operation_id.display_name
                    or "Altă activitate"
                )
        except Exception:
            pass

        try:
            if self._has(running_log, "x_activity_type"):
                if running_log.x_activity_type == "helper":
                    return "Ajutor coleg"

                if running_log.x_activity_type == "other":
                    return "Altă activitate"
        except Exception:
            pass

        return "activitate în lucru"

    def _recover_session_from_running_log(
        self,
        running_log,
        emp,
        zone=False,
        terminal_name=False,
        now=False,
    ):
        """
        Reopen the exact session that owns the employee's running log.

        A running time log is the source of truth. The session can have been
        incorrectly marked closed/inactive by another path; scanning the badge
        must return the employee to that activity instead of creating a fresh
        empty session.
        """
        if not now:
            now = self._now()

        sess = False

        if (
            self._has(running_log, "x_session_id")
            and running_log.x_session_id
        ):
            sess = running_log.x_session_id

        if not sess:
            raise UserError(
                "Ai deja o activitate pornită, dar intervalul de lucru nu "
                "mai este legat de o sesiune.\n\n"
                "Activitate: %s\n\n"
                "Este necesară verificarea situației înainte de continuare."
                % self._running_log_activity_label(running_log)
            )

        if (
            self._has(sess, "x_employee_id")
            and sess.x_employee_id
            and sess.x_employee_id.id != emp.id
        ):
            raise UserError(
                "Intervalul activ este legat de o sesiune a altui angajat. "
                "Este necesară verificarea situației înainte de continuare."
            )

        vals = {
            "x_last_seen_at": now,
        }

        if self._has(sess, "x_state"):
            vals["x_state"] = "active"

        if self._has(sess, "x_ui_state"):
            vals["x_ui_state"] = "running"

        if self._has(sess, "x_employee_id"):
            vals["x_employee_id"] = emp.id

        if self._has(sess, "x_employee_text"):
            vals["x_employee_text"] = emp.display_name or emp.name or ""

        if terminal_name and self._has(sess, "x_terminal_name"):
            vals["x_terminal_name"] = terminal_name

        if zone and self._has(sess, "x_zone_id"):
            vals["x_zone_id"] = zone.id

        if self._has(sess, "x_ended_at"):
            vals["x_ended_at"] = False

        activity_type = False

        if self._has(running_log, "x_activity_type"):
            activity_type = running_log.x_activity_type or False

        if not activity_type:
            if (
                self._has(running_log, "x_other_operation_id")
                and running_log.x_other_operation_id
            ):
                activity_type = "other"
            elif (
                self._has(running_log, "x_is_helper")
                and running_log.x_is_helper
            ):
                activity_type = "helper"
            else:
                activity_type = "production"

        if self._has(sess, "x_activity_type"):
            vals["x_activity_type"] = activity_type

        is_helper = activity_type == "helper"

        if self._has(sess, "x_is_helper_mode"):
            vals["x_is_helper_mode"] = is_helper

        if self._has(sess, "x_helped_employee_id"):
            helped_employee = False

            if (
                is_helper
                and self._has(running_log, "x_helped_employee_id")
                and running_log.x_helped_employee_id
            ):
                helped_employee = running_log.x_helped_employee_id

            vals["x_helped_employee_id"] = (
                helped_employee.id
                if helped_employee
                else False
            )

        workorder = False

        if (
            self._has(running_log, "x_workorder_id")
            and running_log.x_workorder_id
        ):
            workorder = running_log.x_workorder_id

        if self._has(sess, "x_workorder_id"):
            vals["x_workorder_id"] = (
                workorder.id
                if workorder
                else False
            )

        other_operation = False

        if (
            self._has(running_log, "x_other_operation_id")
            and running_log.x_other_operation_id
        ):
            other_operation = running_log.x_other_operation_id

        if self._has(sess, "x_other_operation_id"):
            vals["x_other_operation_id"] = (
                other_operation.id
                if other_operation
                else False
            )

        if workorder:
            try:
                if self._has(sess, "x_workcenter_id"):
                    vals["x_workcenter_id"] = (
                        workorder.workcenter_id.id
                        if workorder.workcenter_id
                        else False
                    )
            except Exception:
                pass

            try:
                if self._has(sess, "x_mo_id"):
                    vals["x_mo_id"] = (
                        workorder.production_id.id
                        if workorder.production_id
                        else False
                    )
            except Exception:
                pass

            try:
                if self._has(sess, "x_product_id"):
                    vals["x_product_id"] = (
                        workorder.production_id.product_id.id
                        if workorder.production_id
                        and workorder.production_id.product_id
                        else False
                    )
            except Exception:
                pass

            try:
                if self._has(sess, "x_operation_template_id"):
                    op_tmpl = False

                    if (
                        "operation_id" in workorder._fields
                        and workorder.operation_id
                        and "x_operation_template_id"
                        in workorder.operation_id._fields
                        and workorder.operation_id.x_operation_template_id
                    ):
                        op_tmpl = workorder.operation_id.x_operation_template_id

                    if op_tmpl:
                        vals["x_operation_template_id"] = op_tmpl.id
            except Exception:
                pass

        if self._has(sess, "x_current_slot_id") and "x_wo_emp_slot" in self.env:
            try:
                Slot = self.env["x_wo_emp_slot"]

                slot_domain = [
                    ("x_employee_id", "=", emp.id),
                    ("x_state", "=", "in_progress"),
                ]

                if "x_plan_type" in Slot._fields:
                    slot_domain.append(
                        ("x_plan_type", "=", "dynamic")
                    )

                if workorder and "x_workorder_id" in Slot._fields:
                    slot_domain.append(
                        ("x_workorder_id", "=", workorder.id)
                    )

                elif other_operation:
                    if "x_activity_type" in Slot._fields:
                        slot_domain.append(
                            ("x_activity_type", "=", "other")
                        )

                    if "x_other_operation_id" in Slot._fields:
                        slot_domain.append(
                            ("x_other_operation_id", "=", other_operation.id)
                        )

                if is_helper and "x_is_helper" in Slot._fields:
                    slot_domain.append(
                        ("x_is_helper", "=", True)
                    )

                matching_slots = Slot.search(
                    slot_domain,
                    order="x_date_start desc, id desc",
                    limit=2,
                )

                if len(matching_slots) == 1:
                    vals["x_current_slot_id"] = matching_slots.id
                elif len(matching_slots) > 1:
                    _logger.warning(
                        "[SHOPFLOOR_SCAN_SERVICE] multiple live slots while "
                        "recovering running session | employee=%s session=%s "
                        "log=%s slots=%s",
                        emp.id,
                        sess.id,
                        running_log.id,
                        matching_slots.ids,
                    )
            except Exception as exc:
                _logger.warning(
                    "[SHOPFLOOR_SCAN_SERVICE] live slot recovery failed | "
                    "employee=%s session=%s log=%s error=%s",
                    emp.id,
                    sess.id,
                    running_log.id,
                    exc,
                )

        sess.write(vals)

        _logger.warning(
            "[SHOPFLOOR_SCAN_SERVICE] recovered running activity from another "
            "session | employee=%s session=%s log=%s activity_type=%s "
            "workorder=%s other_operation=%s",
            emp.id,
            sess.id,
            running_log.id,
            activity_type,
            workorder.id if workorder else False,
            other_operation.id if other_operation else False,
        )

        return sess

    def _resolve_employee_from_scan(self, rec):
        Employee = self.env["hr.employee"]

        emp = False

        if self._has(rec, "x_employee_id") and rec.x_employee_id:
            emp = rec.x_employee_id

        if (not emp) and self._has(rec, "x_badge") and rec.x_badge:
            badge_val = str(rec.x_badge).strip()

            emp = Employee.search(
                [
                    ("barcode", "=", badge_val),
                ],
                limit=1,
            )

            if (not emp) and "x_badge" in Employee._fields:
                emp = Employee.search(
                    [
                        ("x_badge", "=", badge_val),
                    ],
                    limit=1,
                )

            if emp and self._has(rec, "x_employee_id"):
                rec.write({
                    "x_employee_id": emp.id,
                })

        if not emp:
            raise UserError("Scan a badge first.")

        return emp

    def _resolve_hub_context_from_scan(self, rec):
        hub = False
        zone = False
        terminal_name = False

        if self._has(rec, "x_worker_hub_id") and rec.x_worker_hub_id:
            hub = rec.x_worker_hub_id

        if hub:
            if self._has(hub, "x_zone_id") and hub.x_zone_id:
                zone = hub.x_zone_id

            if self._has(hub, "x_device_name") and hub.x_device_name:
                terminal_name = hub.x_device_name

        if (
            not terminal_name
            and self._has(rec, "x_device_name")
            and rec.x_device_name
        ):
            terminal_name = rec.x_device_name

        return hub, zone, terminal_name

    def _session_is_in_current_planification(self, sess, emp, now=False):
        """
        Return True only when the session's assigned activity is represented by
        a CURRENT planification/Gantt slot for this employee.

        This check is intentionally used only for the secondary stale-session
        consistency guard. A real open x_wo_time_log remains authoritative even
        when it has no matching planification slot, so running Help/Other work
        can never be bypassed by starting something else.
        """
        if not sess or not emp:
            return False

        if not now:
            now = self._now()

        if "x_wo_emp_slot" not in self.env:
            return False

        Slot = self.env["x_wo_emp_slot"]

        domain = [
            ("x_employee_id", "=", emp.id),
            ("x_state", "in", ["planned", "in_progress"]),
            ("x_date_start", "!=", False),
            ("x_date_end", "!=", False),
            ("x_date_start", "<=", now),
            ("x_date_end", ">", now),
        ]

        if "x_plan_type" in Slot._fields:
            domain.append(("x_plan_type", "in", ["baseline", "dynamic"]))

        workorder = False
        other_operation = False
        activity_type = False
        is_helper = False

        try:
            if self._has(sess, "x_workorder_id") and sess.x_workorder_id:
                workorder = sess.x_workorder_id
        except Exception:
            workorder = False

        try:
            if self._has(sess, "x_other_operation_id") and sess.x_other_operation_id:
                other_operation = sess.x_other_operation_id
        except Exception:
            other_operation = False

        try:
            if self._has(sess, "x_activity_type"):
                activity_type = sess.x_activity_type or False
        except Exception:
            activity_type = False

        try:
            if self._has(sess, "x_is_helper_mode"):
                is_helper = bool(sess.x_is_helper_mode)
        except Exception:
            is_helper = False

        if activity_type == "helper":
            is_helper = True

        # Production / helper sessions are tied to a work order.
        if workorder:
            if "x_workorder_id" not in Slot._fields:
                return False

            domain.append(("x_workorder_id", "=", workorder.id))

            # Do not let a helper slot validate a stale normal-production
            # session, or vice versa, when the slot model carries that marker.
            if "x_is_helper" in Slot._fields:
                domain.append(("x_is_helper", "=", is_helper))

        # Other activities have no work order and are matched by their own
        # activity record / activity type.
        elif other_operation:
            if "x_other_operation_id" in Slot._fields:
                domain.append(("x_other_operation_id", "=", other_operation.id))
            elif "x_activity_type" in Slot._fields:
                domain.append(("x_activity_type", "=", "other"))
            else:
                return False

        else:
            # A stale session with no identifiable assigned activity cannot be
            # considered part of the current planification.
            return False

        try:
            slot = Slot.search(
                domain,
                order="x_date_start desc, id desc",
                limit=1,
            )
        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_SCAN_SERVICE] current planification check failed | "
                "employee=%s session=%s error=%s",
                emp.id,
                sess.id,
                exc,
            )
            return False

        if slot:
            _logger.warning(
                "[SHOPFLOOR_SCAN_SERVICE] stale running session is still in "
                "current planification | employee=%s session=%s slot=%s "
                "workorder=%s other_operation=%s",
                emp.id,
                sess.id,
                slot.id,
                workorder.id if workorder else False,
                other_operation.id if other_operation else False,
            )
            return True

        return False

    def _find_or_create_today_session(self, emp, zone=False, terminal_name=False, now=False):
        Session = self.env["x_shopfloor_session"]

        if not now:
            now = self._now()

        today = now.date()

        # GLOBAL running-activity check across every session for this employee.
        # This must happen before looking for/creating today's active session.
        running_logs = self._find_employee_running_logs(emp)

        if len(running_logs) > 1:
            labels = []

            for running_log in running_logs:
                labels.append(
                    "%s (log %s / sesiune %s)"
                    % (
                        self._running_log_activity_label(running_log),
                        running_log.id,
                        (
                            running_log.x_session_id.id
                            if self._has(running_log, "x_session_id")
                            and running_log.x_session_id
                            else "-"
                        ),
                    )
                )

            _logger.error(
                "[SHOPFLOOR_SCAN_SERVICE] employee has multiple running logs | "
                "employee=%s logs=%s",
                emp.id,
                running_logs.ids,
            )

            raise UserError(
                "Nu se poate deschide meniul de selecție.\n\n"
                "Există mai multe activități active pentru acest angajat:\n%s\n\n"
                "Este necesară verificarea situației înainte de continuare."
                % "\n".join(labels)
            )

        if running_logs:
            return self._recover_session_from_running_log(
                running_log=running_logs[:1],
                emp=emp,
                zone=zone,
                terminal_name=terminal_name,
                now=now,
            )

        # Secondary consistency check for stale session metadata.
        #
        # Historical x_ui_state=running rows are common in this database, so
        # they must NOT block a worker just because the old session was never
        # cleaned. Only sessions whose assigned activity is still represented
        # by a CURRENT planification slot (overlapping `now`) are considered.
        #
        # IMPORTANT: this is only the fallback check. A real open running log
        # above remains authoritative across all sessions and all activity types.
        running_session_candidates = Session.search(
            [
                ("x_employee_id", "=", emp.id),
                ("x_ui_state", "=", "running"),
            ],
            order="x_started_at desc, id desc",
        )

        inconsistent_running_sessions = Session.browse()

        for candidate in running_session_candidates:
            if self._session_is_in_current_planification(
                candidate,
                emp,
                now=now,
            ):
                inconsistent_running_sessions |= candidate

                # One is enough to block and explain the inconsistency.
                break

        if inconsistent_running_sessions:
            _logger.error(
                "[SHOPFLOOR_SCAN_SERVICE] running session without running log "
                "but still present in current planification | "
                "employee=%s sessions=%s",
                emp.id,
                inconsistent_running_sessions.ids,
            )

            raise UserError(
                "Nu se poate deschide meniul de selecție.\n\n"
                "Există o sesiune marcată ca fiind în lucru pentru acest angajat "
                "(sesiunea %s), iar activitatea ei este încă inclusă în "
                "planificarea curentă, dar nu există un interval de timp activ.\n\n"
                "Este necesară verificarea situației înainte de continuare."
                % inconsistent_running_sessions[0].id
            )

        sess = Session.search(
            [
                ("x_employee_id", "=", emp.id),
                ("x_state", "=", "active"),
                ("x_started_at", ">=", str(today) + " 00:00:00"),
                ("x_started_at", "<=", str(today) + " 23:59:59"),
            ],
            limit=1,
            order="x_started_at desc",
        )

        if not sess:
            emp_name = emp.display_name or emp.name or ""
            zone_label = zone.display_name if zone else ""

            session_name = "%s | %s | %s %s" % (
                emp_name,
                zone_label,
                now.strftime("%d/%m/%Y"),
                now.strftime("%H:%M"),
            )

            vals = {
                "x_employee_id": emp.id,
                "x_state": "active",
                "x_started_at": now,
                "x_last_seen_at": now,
                "x_name": session_name,
                "x_ui_state": "not_started",
            }

            if self._has(Session, "x_employee_text"):
                vals["x_employee_text"] = emp.display_name or emp.name or ""

            if zone and self._has(Session, "x_zone_id"):
                vals["x_zone_id"] = zone.id

            if terminal_name and self._has(Session, "x_terminal_name"):
                vals["x_terminal_name"] = terminal_name

            if self._has(Session, "x_company_id") and self.env.company:
                vals["x_company_id"] = self.env.company.id

            if self._has(Session, "x_actual_duration_min"):
                vals["x_actual_duration_min"] = 0.0

            # Live dispatch flow: new sessions start empty.
            vals.update(self._clear_assignment_vals(Session))

            sess = Session.create(vals)

            _logger.warning(
                "[SHOPFLOOR_SCAN_SERVICE] created new session=%s employee=%s",
                sess.id,
                emp.id,
            )

            return sess

        vals_update = {
            "x_last_seen_at": now,
        }

        if self._has(sess, "x_employee_text"):
            vals_update["x_employee_text"] = emp.display_name or emp.name or ""

        if terminal_name and self._has(sess, "x_terminal_name"):
            vals_update["x_terminal_name"] = terminal_name

        if not self._session_has_running_log(sess, emp):
            released_count = self.env[
                "shopfloor.component.flow.service"
            ].release_session(
                sess,
                reason="badge_rescan_cleanup",
            )

            vals_update.update(
                self._clear_assignment_vals(sess)
            )

            _logger.warning(
                "[SHOPFLOOR_SCAN_SERVICE] cleaned non-running session "
                "before opening | session=%s employee=%s "
                "reservations_released=%s",
                sess.id,
                emp.id,
                released_count,
            )

        sess.write(vals_update)

        return sess

    def _refresh_actual_duration(self, sess, emp, now=False):
        if not now:
            now = self._now()

        actual_minutes = 0.0
        running_log = False

        try:
            Log = self.env["x_wo_time_log"]

            # Search the current running interval for this session.
            # This works for:
            # - normal work orders
            # - helper sessions
            # - other activities
            running_log = Log.search(
                [
                    ("x_session_id", "=", sess.id),
                    ("x_employee_id", "=", emp.id),
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

                if start_dt and now > start_dt:
                    actual_minutes = self._common().minutes_between(
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
                "[SHOPFLOOR_SCAN_SERVICE] current interval refreshed | "
                "session=%s employee=%s log=%s activity_type=%s "
                "workorder=%s other_operation=%s minutes=%s",
                sess.id,
                emp.id,
                running_log.id if running_log else False,
                (
                    sess.x_activity_type
                    if self._has(sess, "x_activity_type")
                    else False
                ),
                (
                    sess.x_workorder_id.id
                    if self._has(sess, "x_workorder_id")
                    and sess.x_workorder_id
                    else False
                ),
                (
                    sess.x_other_operation_id.id
                    if self._has(sess, "x_other_operation_id")
                    and sess.x_other_operation_id
                    else False
                ),
                actual_minutes,
            )

        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_SCAN_SERVICE] duration refresh failed | "
                "session=%s employee=%s error=%s",
                sess.id,
                emp.id,
                exc,
            )

        return actual_minutes

    def _clear_scan_record(self, rec, now=False):
        if not now:
            now = self._now()

        scan_vals = {}

        if self._has(rec, "x_badge"):
            scan_vals["x_badge"] = False

        if self._has(rec, "x_employee_id"):
            scan_vals["x_employee_id"] = False

        if self._has(rec, "x_scanned_at"):
            scan_vals["x_scanned_at"] = now

        if scan_vals:
            rec.write(scan_vals)

    def _clear_hub_scan_fields(self, hub):
        if not hub:
            return

        hub_vals = {}

        if self._has(hub, "x_badge"):
            hub_vals["x_badge"] = False

        if self._has(hub, "x_employee_id"):
            hub_vals["x_employee_id"] = False

        if self._has(hub, "x_last_scan_dt"):
            hub_vals["x_last_scan_dt"] = False

        if hub_vals:
            hub.write(hub_vals)

    def scan_correct(self, scan_record):
        if not scan_record:
            raise UserError("No scan record found.")

        rec = scan_record[:1]
        rec.ensure_one()

        now = self._now()

        _logger.warning(
            "[SHOPFLOOR_SCAN_SERVICE] scan_correct hit record=%s",
            rec.id,
        )

        emp = self._resolve_employee_from_scan(rec)
        hub, zone, terminal_name = self._resolve_hub_context_from_scan(rec)

        sess = self._find_or_create_today_session(
            emp=emp,
            zone=zone,
            terminal_name=terminal_name,
            now=now,
        )

        self._refresh_actual_duration(sess, emp, now=now)

        self._clear_scan_record(rec, now=now)
        self._clear_hub_scan_fields(hub)

        _logger.warning(
            "[SHOPFLOOR_SCAN_SERVICE] live dispatch flow - skipped auto workorder assignment | session=%s employee=%s",
            sess.id,
            emp.id,
        )

        return self._open_session_action(sess)
    
    def cancel_session_selection(self, sessions):
        if not sessions:
            raise UserError("No session found.")

        now = self._now()
        primary = False

        for sess in sessions:
            primary = sess

            # Defensive guard. Cancel should only be used before Start.
            ui_state = False
            try:
                if self._has(sess, "x_ui_state"):
                    ui_state = sess.x_ui_state
            except Exception:
                ui_state = False

            if ui_state == "running":
                raise UserError(
                    "Operația este deja pornită. Folosește Stop pentru a opri operația."
                )

            self.env[
                "shopfloor.component.flow.service"
            ].release_session(
                sess,
                reason="selection_cancelled",
            )

            released_count = self.env[
                "shopfloor.component.flow.service"
            ].release_session(
                sess,
                reason="selection_cancelled",
            )

            vals = self._clear_assignment_vals(sess)

            if self._has(sess, "x_last_seen_at"):
                vals["x_last_seen_at"] = now

            if vals:
                sess.write(vals)

            _logger.warning(
                "[SHOPFLOOR_SCAN_SERVICE] cancel session selection | "
                "session=%s employee=%s reservations_released=%s",
                sess.id,
                (
                    sess.x_employee_id.id
                    if self._has(sess, "x_employee_id")
                    and sess.x_employee_id
                    else False
                ),
                released_count,
            )

        return self._open_session_action(primary)

    # ------------------------------------------------------------
    # MAX ADDED - action 1251: Scan badge button from Worker Hub
    # ------------------------------------------------------------
    def open_badge_scan(self, hubs):
        if not hubs:
            raise UserError("No hub record found.")

        hub = hubs[:1]
        hub.ensure_one()

        Scan = self.env["x_worker_badge_scan"]

        vals = {
            "x_worker_hub_id": hub.id,
            "x_scanned_at": self._now(),
        }

        if self._has(hub, "x_device_name") and hub.x_device_name:
            vals["x_device_name"] = hub.x_device_name

        scan = Scan.create(vals)

        action = self._common().open_record_action(
            name="Scaneaza Ecuson",
            res_model="x_worker_badge_scan",
            res_id=scan.id,
            view_mode="form",
            target="new",
        )

        action["context"] = {
            "form_view_initial_mode": "edit",
            "force_focus_field": "x_badge",
        }

        action["flags"] = {
            "initial_mode": "edit",
            "no_breadcrumbs": True,
            "headless": True,
        }

        return action

    # ------------------------------------------------------------
    # MAX ADDED - action 1281: Incorrect scan / retry scan
    # ------------------------------------------------------------
    def incorrect_scan(self, scans):
        common = self._common()

        if not scans:
            return common.close_action()

        scan = scans[:1]
        scan.ensure_one()

        hub = False

        if self._has(scan, "x_worker_hub_id") and scan.x_worker_hub_id:
            hub = scan.x_worker_hub_id

        scan_vals = {}

        if self._has(scan, "x_badge"):
            scan_vals["x_badge"] = False

        if self._has(scan, "x_employee_id"):
            scan_vals["x_employee_id"] = False

        if self._has(scan, "x_scan_message"):
            scan_vals["x_scan_message"] = False

        if self._has(scan, "x_scanned_at"):
            scan_vals["x_scanned_at"] = self._now()

        if scan_vals:
            scan.write(scan_vals)

        if hub:
            hub_vals = {}

            if self._has(hub, "x_badge"):
                hub_vals["x_badge"] = False

            if self._has(hub, "x_employee_id"):
                hub_vals["x_employee_id"] = False

            if self._has(hub, "x_last_scan_dt"):
                hub_vals["x_last_scan_dt"] = False

            if hub_vals:
                hub.write(hub_vals)

            return common.open_hub_action(hub)

        return common.close_action()

    # ------------------------------------------------------------
    # MAX ADDED - action 1282: OK button on generic popup
    # ------------------------------------------------------------
    def popup_ok(self, popups):
        common = self._common()

        if not popups:
            raise UserError("No popup record found.")

        popup = popups[:1]
        popup.ensure_one()

        ok_behavior = ""

        try:
            if self._has(popup, "x_ok_behavior"):
                ok_behavior = popup.x_ok_behavior or ""
        except Exception:
            ok_behavior = ""

        if ok_behavior == "close":
            return common.close_action()

        hub = common.find_hub_for_popup(popup)

        if not hub:
            raise UserError("Hub not found on popup.")

        return common.open_hub_action(hub)

    def open_badge_scan_from_session(self, sessions):
        if not sessions:
            raise UserError("No session found.")

        sess = sessions[:1]
        sess.ensure_one()

        hub = self._common().find_hub_for_session(sess)

        if not hub:
            raise UserError("Hub not found for this device/session.")

        return self.open_badge_scan(hub)
    
    def back_to_worker_hub_from_session(self, sessions):
        if not sessions:
            raise UserError("No session found.")

        sess = sessions[:1]
        sess.ensure_one()

        hub = self._common().find_hub_for_session(sess)

        if not hub:
            raise UserError("Hub not found for this device/session.")

        return self._common().open_hub_action(hub)