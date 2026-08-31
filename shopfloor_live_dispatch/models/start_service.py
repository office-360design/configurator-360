# import addons.shopfloor_live_dispatch.models.shopfloor_session
import datetime
import logging

from odoo import models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ShopfloorLiveStartService(models.AbstractModel):
    _name = "shopfloor.live.start.service"
    _description = "Shopfloor Live Start Service"

    def start_workorder(self, sessions):
        env = self.env
        records = sessions

        # ==============================================================
        # START (x_shopfloor_session) - Studio-safe
        # FIXED:
        # - Prevents "admin + selected employee" double productivity lines
        # - Syncs Gantt dynamic/baseline slot to "in_progress"
        # - Keeps wo.button_start() for Odoo logic
        # - SAFE for helpers
        # - Sets x_ui_state="running"
        # - Calculates completed worked minutes for the current session
        # - Returns to Worker Hub (no auto-completion) AFTER processing
        # ==============================================================

        def _safe_log(msg, level="info"):
            try:
                if level == "warning":
                    _logger.warning(msg)
                elif level == "error":
                    _logger.error(msg)
                elif level == "debug":
                    _logger.debug(msg)
                else:
                    _logger.info(msg)
            except Exception:
                pass


        def _has(rec, name):
            try:
                return name in rec._fields
            except Exception:
                return False


        def _rec_name(rec):
            try:
                return rec._name
            except Exception:
                return "record"


        def _stamp_helper(rec, sess):
            try:
                vals = {}
                is_helper_mode = False
                helped_emp = False

                if _has(sess, "x_is_helper_mode"):
                    is_helper_mode = bool(sess["x_is_helper_mode"])

                if _has(sess, "x_helped_employee_id"):
                    helped_emp = sess["x_helped_employee_id"] or False

                if _has(rec, "x_is_helper"):
                    vals["x_is_helper"] = is_helper_mode

                if _has(rec, "x_helped_employee_id"):
                    vals["x_helped_employee_id"] = (
                        helped_emp.id
                        if is_helper_mode and helped_emp
                        else False
                    )

                if _has(rec, "x_activity_type"):
                    vals["x_activity_type"] = (
                        "helper"
                        if is_helper_mode
                        else "production"
                    )

                if vals:
                    rec.write(vals)

            except Exception as e:
                _safe_log(
                    "START: helper stamp failed on %s: %s"
                    % (_rec_name(rec), e),
                    level="warning",
                )


        # --------------------------------------------------------------
        # Reliable current time
        # --------------------------------------------------------------
        now = False

        try:
            now = env.cr.now()
        except Exception as e:
            now = False
            _safe_log(
                "START: env.cr.now() failed: %s" % e,
                level="warning",
            )

        if not now:
            raise Exception(
                "Could not determine current time "
                "(env.cr.now() returned False)."
            )


        Log = env["x_wo_time_log"]
        Prod = env["mrp.workcenter.productivity"]
        Loss = env["mrp.workcenter.productivity.loss"]
        Common = env["shopfloor.live.common.service"]


        def _field_exists(model_or_rec, field_name):
            try:
                return field_name in model_or_rec._fields
            except Exception:
                return False


        def _minutes_between(start_dt, end_dt):
            try:
                return Common.minutes_between(start_dt, end_dt)
            except Exception:
                return 0.0


        def _close_runtime_for_auto_paused_log(running_log, emp, end_dt, minutes):
            """Close the live records that belong to an auto-paused interval.

            Starting another activity may legitimately pause the employee's
            previous x_wo_time_log. The old implementation stopped only that
            custom log, leaving its dynamic Gantt slot and Odoo productivity
            timer open until the nightly cutoff. That produced multi-hour
            historical intervals and later overlap errors. Keep all three live
            representations on the exact same end timestamp.
            """
            old_wo = False
            activity_type = "production"

            try:
                if _has(running_log, "x_workorder_id") and running_log.x_workorder_id:
                    old_wo = running_log.x_workorder_id
            except Exception:
                old_wo = False

            try:
                if (
                    _has(running_log, "x_activity_type")
                    and running_log.x_activity_type in ("production", "helper", "other")
                ):
                    activity_type = running_log.x_activity_type
                elif not old_wo:
                    activity_type = "other"
            except Exception:
                if not old_wo:
                    activity_type = "other"

            # Close the employee-attributed Odoo productivity timer for the old
            # work order. There is no productivity timer for "other" activities.
            if old_wo:
                try:
                    open_productivity = Prod.search([
                        ("workorder_id", "=", old_wo.id),
                        ("date_end", "=", False),
                        ("employee_id", "=", emp.id),
                    ])
                    if open_productivity:
                        open_productivity.write({"date_end": end_dt})
                        _safe_log(
                            "START AUTO-PAUSE: closed old productivity | "
                            "emp=%s wo=%s prod_ids=%s end=%s"
                            % (emp.id, old_wo.id, open_productivity.ids, end_dt),
                            level="warning",
                        )
                except Exception as exc:
                    _safe_log(
                        "START AUTO-PAUSE: old productivity close failed | "
                        "emp=%s wo=%s error=%s"
                        % (emp.id, old_wo.id, exc),
                        level="warning",
                    )

            if "x_wo_emp_slot" not in env:
                return

            try:
                Slot = env["x_wo_emp_slot"]
                domain = [
                    ("x_employee_id", "=", emp.id),
                    ("x_state", "=", "in_progress"),
                ]

                if "x_plan_type" in Slot._fields:
                    domain.append(("x_plan_type", "=", "dynamic"))

                if old_wo and "x_workorder_id" in Slot._fields:
                    domain.append(("x_workorder_id", "=", old_wo.id))
                elif not old_wo:
                    if "x_activity_type" in Slot._fields:
                        domain.append(("x_activity_type", "=", "other"))
                    elif "x_workorder_id" in Slot._fields:
                        domain.append(("x_workorder_id", "=", False))

                if "x_date_start" in Slot._fields:
                    domain.append(("x_date_start", "<=", end_dt))

                old_slots = Slot.search(
                    domain,
                    order="x_date_start desc, id desc",
                )

                for old_slot in old_slots:
                    vals = {}
                    if _has(old_slot, "x_state"):
                        vals["x_state"] = "done"
                    if _has(old_slot, "x_date_end"):
                        vals["x_date_end"] = end_dt
                    if _has(old_slot, "x_minutes"):
                        vals["x_minutes"] = minutes
                    if _has(old_slot, "x_actual_duration_min"):
                        vals["x_actual_duration_min"] = minutes
                    if _has(old_slot, "x_activity_type"):
                        vals["x_activity_type"] = activity_type

                    if activity_type == "other":
                        if _has(old_slot, "x_is_helper"):
                            vals["x_is_helper"] = False
                        if _has(old_slot, "x_is_other_operation_interval"):
                            vals["x_is_other_operation_interval"] = True
                        if _has(old_slot, "x_gantt_status"):
                            vals["x_gantt_status"] = "other_activities"
                        if _has(old_slot, "x_gantt_color"):
                            vals["x_gantt_color"] = 3
                    elif activity_type == "helper":
                        if _has(old_slot, "x_is_helper"):
                            vals["x_is_helper"] = True
                        if _has(old_slot, "x_is_other_operation_interval"):
                            vals["x_is_other_operation_interval"] = False
                        if _has(old_slot, "x_gantt_status"):
                            vals["x_gantt_status"] = "help"
                        if _has(old_slot, "x_gantt_color"):
                            vals["x_gantt_color"] = 4
                    else:
                        planned_minutes = 0.0
                        try:
                            if _has(old_slot, "x_duration_expected"):
                                planned_minutes = float(old_slot.x_duration_expected or 0.0)
                        except Exception:
                            planned_minutes = 0.0

                        is_slow = bool(
                            planned_minutes
                            and minutes > planned_minutes + 0.01
                        )
                        if _has(old_slot, "x_gantt_status"):
                            vals["x_gantt_status"] = (
                                "incomplete_slow" if is_slow else "incomplete_fast"
                            )
                        if _has(old_slot, "x_gantt_color"):
                            vals["x_gantt_color"] = 2 if is_slow else 10

                    if vals:
                        old_slot.with_context(
                            no_overlap_check=True,
                            skip_overlap_guard=True,
                            slot_sync_running=True,
                        ).write(vals)

                    _safe_log(
                        "START AUTO-PAUSE: closed old dynamic slot | "
                        "emp=%s wo=%s slot=%s end=%s minutes=%s"
                        % (
                            emp.id,
                            old_wo.id if old_wo else False,
                            old_slot.id,
                            end_dt,
                            minutes,
                        ),
                        level="warning",
                    )

            except Exception as exc:
                _safe_log(
                    "START AUTO-PAUSE: old dynamic slot close failed | "
                    "emp=%s wo=%s error=%s"
                    % (emp.id, old_wo.id if old_wo else False, exc),
                    level="warning",
                )

        # --------------------------------------------------------------
        # Productive loss type
        # --------------------------------------------------------------
        productive_loss = False

        try:
            productive_loss = Loss.search(
                [("loss_type", "=", "productive")],
                limit=1,
            )
        except Exception as e:
            productive_loss = False
            _safe_log(
                "START: productive loss search failed: %s" % e,
                level="warning",
            )


        # --------------------------------------------------------------
        # Detect login user's employee
        # Shared-login productivity fix
        # --------------------------------------------------------------
        user_emp = False

        try:
            if _has(env.user, "employee_id") and env.user.employee_id:
                user_emp = env.user.employee_id
        except Exception:
            user_emp = False


        # --------------------------------------------------------------
        # MAX ADDED - start "Alte Activitati" without a workorder
        # --------------------------------------------------------------
        def _get_session_other_operation(sess):
            try:
                if (
                    sess
                    and _has(sess, "x_other_operation_id")
                    and sess.x_other_operation_id
                ):
                    return sess.x_other_operation_id
            except Exception:
                pass

            return False


        def _is_other_activity_session(sess, wo=False, other_op=False):
            if not sess:
                return False

            try:
                if (
                    _has(sess, "x_activity_type")
                    and sess.x_activity_type == "other"
                    and other_op
                ):
                    return True
            except Exception:
                pass

            # If no workorder is selected, but an other operation is selected,
            # this START must use the non-production branch.
            if other_op and not wo:
                return True

            return False


        def _other_operation_display_name(other_op):
            if not other_op:
                return "Altă activitate"

            for fname in [
                "x_name",
                "name",
                "display_name",
            ]:
                try:
                    if _has(other_op, fname) and other_op[fname]:
                        return str(other_op[fname])
                except Exception:
                    pass

            try:
                return other_op.display_name or "Altă activitate"
            except Exception:
                return "Altă activitate"


        def _get_other_expected_minutes(sess, other_op):
            expected_min = 0.0

            try:
                if (
                    other_op
                    and _has(other_op, "x_expected_duration_min")
                    and other_op.x_expected_duration_min
                ):
                    expected_min = float(other_op.x_expected_duration_min or 0.0)
            except Exception:
                expected_min = 0.0

            try:
                if (
                    not expected_min
                    and sess
                    and _has(sess, "x_expected_duration_min")
                    and sess.x_expected_duration_min
                ):
                    expected_min = float(sess.x_expected_duration_min or 0.0)
            except Exception:
                pass

            return expected_min


        def _start_other_activity(sess, emp, other_op, now, zone=False):
            other_name = _other_operation_display_name(other_op)
            expected_min = _get_other_expected_minutes(sess, other_op)

            _safe_log(
                "START_OTHER: pressed | session=%s employee=%s(emp_id=%s) "
                "other_op=%s(other_id=%s) now=%s expected_min=%s"
                % (
                    sess.id,
                    emp.display_name,
                    emp.id,
                    other_name,
                    other_op.id if other_op else False,
                    now,
                    expected_min,
                ),
                level="warning",
            )

            # Close/pause any previous running custom log for this employee.
            running_logs = Log.search([
                ("x_employee_id", "=", emp.id),
                ("x_state", "=", "running"),
                ("x_end_dt", "=", False),
            ])

            for running_log in running_logs:
                start_dt = (
                    running_log.x_start_dt
                    if _has(running_log, "x_start_dt")
                    else False
                )

                minutes = 0.0

                try:
                    if start_dt and now > start_dt:
                        minutes = _minutes_between(start_dt, now)
                except Exception:
                    minutes = 0.0

                vals_pause = {}

                if _has(running_log, "x_end_dt"):
                    vals_pause["x_end_dt"] = now

                if _has(running_log, "x_duration_min"):
                    vals_pause["x_duration_min"] = minutes

                if _has(running_log, "x_state"):
                    vals_pause["x_state"] = "pause"

                if vals_pause:
                    running_log.write(vals_pause)
                    _close_runtime_for_auto_paused_log(
                        running_log,
                        emp,
                        now,
                        minutes,
                    )

            # Create custom running log with no workorder.
            log_vals = {}

            if _field_exists(Log, "x_name"):
                log_vals["x_name"] = (
                    (emp.display_name or "")
                    + " - "
                    + other_name
                )

            if _field_exists(Log, "x_session_id"):
                log_vals["x_session_id"] = sess.id

            if _field_exists(Log, "x_employee_id"):
                log_vals["x_employee_id"] = emp.id

            if _field_exists(Log, "x_start_dt"):
                log_vals["x_start_dt"] = now

            if _field_exists(Log, "x_state"):
                log_vals["x_state"] = "running"

            if _field_exists(Log, "x_activity_type"):
                log_vals["x_activity_type"] = "other"

            if other_op and _field_exists(Log, "x_other_operation_id"):
                log_vals["x_other_operation_id"] = other_op.id

            if zone and _field_exists(Log, "x_zone_id"):
                log_vals["x_zone_id"] = zone.id

            new_log = Log.create(log_vals)

            _safe_log(
                "START_OTHER: created running log | log=%s vals=%s"
                % (
                    new_log.id if new_log else False,
                    str(log_vals),
                ),
                level="warning",
            )

            current_slot = False

            if "x_wo_emp_slot" in env:
                Slot = env["x_wo_emp_slot"]

                # Prefer existing current slot on session.
                try:
                    if (
                        _has(sess, "x_current_slot_id")
                        and sess.x_current_slot_id
                    ):
                        candidate = sess.x_current_slot_id

                        if (
                            candidate
                            and candidate._name == "x_wo_emp_slot"
                            and _has(candidate, "x_employee_id")
                            and candidate.x_employee_id
                            and candidate.x_employee_id.id == emp.id
                            and (
                                not _has(candidate, "x_state")
                                or candidate.x_state != "cancelled"
                            )
                        ):
                            is_candidate_other = False

                            try:
                                if (
                                    _has(candidate, "x_activity_type")
                                    and candidate.x_activity_type == "other"
                                ):
                                    is_candidate_other = True
                            except Exception:
                                pass

                            try:
                                if (
                                    not is_candidate_other
                                    and other_op
                                    and _has(candidate, "x_other_operation_id")
                                    and candidate.x_other_operation_id
                                    and candidate.x_other_operation_id.id == other_op.id
                                ):
                                    is_candidate_other = True
                            except Exception:
                                pass

                            if is_candidate_other:
                                current_slot = candidate
                except Exception as exc:
                    _safe_log(
                        "START_OTHER: current slot lookup failed: %s" % exc,
                        level="warning",
                    )

                # Then look for an existing in-progress/planned other slot.
                if not current_slot:
                    domain = [
                        ("x_employee_id", "=", emp.id),
                        ("x_state", "in", ["planned", "in_progress"]),
                    ]

                    if "x_plan_type" in Slot._fields:
                        domain.append(("x_plan_type", "=", "dynamic"))

                    if "x_activity_type" in Slot._fields:
                        domain.append(("x_activity_type", "=", "other"))

                    elif other_op and "x_other_operation_id" in Slot._fields:
                        domain.append(("x_other_operation_id", "=", other_op.id))

                    try:
                        current_slot = Slot.search(
                            domain,
                            order="x_date_start desc, id desc",
                            limit=1,
                        )
                    except Exception as exc:
                        _safe_log(
                            "START_OTHER: existing slot search failed: %s"
                            % exc,
                            level="warning",
                        )
                        current_slot = False

                slot_vals = {}

                if current_slot:
                    if _has(current_slot, "x_state"):
                        slot_vals["x_state"] = "in_progress"

                    if _has(current_slot, "x_activity_type"):
                        slot_vals["x_activity_type"] = "other"

                    if _has(current_slot, "x_is_helper"):
                        slot_vals["x_is_helper"] = False

                    if _has(current_slot, "x_helped_employee_id"):
                        slot_vals["x_helped_employee_id"] = False

                    if _has(current_slot, "x_is_other_operation_interval"):
                        slot_vals["x_is_other_operation_interval"] = True

                    if other_op and _has(current_slot, "x_other_operation_id"):
                        slot_vals["x_other_operation_id"] = other_op.id

                    if _has(current_slot, "x_gantt_status"):
                        slot_vals["x_gantt_status"] = "running"

                    if _has(current_slot, "x_gantt_color"):
                        slot_vals["x_gantt_color"] = 3

                    if slot_vals:
                        current_slot.write(slot_vals)

                    _safe_log(
                        "START_OTHER: existing slot set in_progress | slot=%s vals=%s"
                        % (
                            current_slot.id,
                            str(slot_vals),
                        ),
                        level="warning",
                    )

                else:
                    create_vals = {}

                    if "x_name" in Slot._fields:
                        create_vals["x_name"] = other_name

                    if "x_employee_id" in Slot._fields:
                        create_vals["x_employee_id"] = emp.id

                    if "x_date_start" in Slot._fields:
                        create_vals["x_date_start"] = now

                    if "x_date_end" in Slot._fields:
                        create_vals["x_date_end"] = now + datetime.timedelta(minutes=15)

                    if "x_minutes" in Slot._fields:
                        create_vals["x_minutes"] = 0.0

                    if "x_actual_duration_min" in Slot._fields:
                        create_vals["x_actual_duration_min"] = 0.0

                    if "x_duration_expected" in Slot._fields and expected_min:
                        create_vals["x_duration_expected"] = expected_min

                    if "x_state" in Slot._fields:
                        create_vals["x_state"] = "in_progress"

                    if "x_plan_type" in Slot._fields:
                        create_vals["x_plan_type"] = "dynamic"

                    if "x_activity_type" in Slot._fields:
                        create_vals["x_activity_type"] = "other"

                    if "x_is_helper" in Slot._fields:
                        create_vals["x_is_helper"] = False

                    if "x_helped_employee_id" in Slot._fields:
                        create_vals["x_helped_employee_id"] = False

                    if "x_is_other_operation_interval" in Slot._fields:
                        create_vals["x_is_other_operation_interval"] = True

                    if other_op and "x_other_operation_id" in Slot._fields:
                        create_vals["x_other_operation_id"] = other_op.id

                    if "x_gantt_status" in Slot._fields:
                        create_vals["x_gantt_status"] = "running"

                    if "x_gantt_color" in Slot._fields:
                        create_vals["x_gantt_color"] = 3

                    if zone and "x_zone_id" in Slot._fields:
                        create_vals["x_zone_id"] = zone.id

                    # MAX ADDED - diagnose missing required slot fields before create
                    required_missing = []

                    try:
                        technical_required_fields = [
                            "id",
                            "display_name",
                            "create_uid",
                            "create_date",
                            "write_uid",
                            "write_date",
                            "__last_update",
                        ]

                        for fname, field_obj in Slot._fields.items():
                            try:
                                if (
                                    fname not in technical_required_fields
                                    and getattr(field_obj, "required", False)
                                    and fname not in create_vals
                                ):
                                    required_missing.append(fname)
                            except Exception:
                                pass
                    except Exception:
                        required_missing = []

                    _safe_log(
                        "START_OTHER: slot create attempt | vals=%s required_missing=%s"
                        % (
                            str(create_vals),
                            str(required_missing),
                        ),
                        level="warning",
                    )
                    # MAX ADDITION ENDED

                    try:
                        current_slot = Slot.with_context(
                            no_overlap_check=True,
                            skip_overlap_guard=True,
                            slot_sync_running=True,
                        ).create(create_vals)

                        _safe_log(
                            "START_OTHER: created live dynamic slot | slot=%s vals=%s"
                            % (
                                current_slot.id,
                                str(create_vals),
                            ),
                            level="warning",
                        )

                    except Exception as exc:
                        current_slot = False

                        _safe_log(
                            "START_OTHER: slot create failed HARD: %s vals=%s required_missing=%s"
                            % (
                                exc,
                                str(create_vals),
                                str(required_missing),
                            ),
                            level="error",
                        )

                        raise UserError(
                            "Nu s-a putut crea intervalul Gantt pentru Alte Activități.\n\n"
                            "Cauza probabilă: modelul x_wo_emp_slot are câmpuri obligatorii "
                            "care nu se aplică la alte activități, de exemplu x_workorder_id, "
                            "x_workcenter_id, x_mo_id sau x_product_id.\n\n"
                            "Eroare tehnică: %s\n"
                            "Câmpuri obligatorii lipsă detectate: %s"
                            % (
                                exc,
                                ", ".join(required_missing) if required_missing else "-",
                            )
                        )

            session_vals = {
                "x_last_seen_at": now,
                "x_state": "active",
                "x_ui_state": "running",
            }

            if _has(sess, "x_activity_type"):
                session_vals["x_activity_type"] = "other"

            if _has(sess, "x_actual_duration_min"):
                session_vals["x_actual_duration_min"] = 0.0

            if (
                current_slot
                and _has(sess, "x_current_slot_id")
            ):
                session_vals["x_current_slot_id"] = current_slot.id

            if _has(sess, "x_workorder_id"):
                session_vals["x_workorder_id"] = False

            if _has(sess, "x_operation_template_id"):
                session_vals["x_operation_template_id"] = False

            try:
                sess.write(session_vals)

                _safe_log(
                    "START_OTHER: session set running | session=%s vals=%s"
                    % (
                        sess.id,
                        str(session_vals),
                    ),
                    level="warning",
                )

            except Exception as exc:
                _safe_log(
                    "START_OTHER: session write failed: %s" % exc,
                    level="warning",
                )

            return {
                "log": new_log,
                "slot": current_slot,
            }


        primary = False


        for sess in records:

            if not sess.x_employee_id:
                raise Exception("Select an employee before starting.")

            emp = sess.x_employee_id

            wo = (
                sess.x_workorder_id
                if _has(sess, "x_workorder_id") and sess.x_workorder_id
                else False
            )

            other_op = _get_session_other_operation(sess)
            is_other_activity = _is_other_activity_session(
                sess,
                wo=wo,
                other_op=other_op,
            )

            if not wo and not is_other_activity:
                raise Exception("Select an operation or other activity before starting.")

            zone = (
                sess.x_zone_id
                if _has(sess, "x_zone_id") and sess.x_zone_id
                else False
            )

            if is_other_activity:
                _start_other_activity(
                    sess=sess,
                    emp=emp,
                    other_op=other_op,
                    now=now,
                    zone=zone,
                )

                primary = sess
                continue

            is_helper_slot = False

            try:
                is_helper_slot = bool(
                    _has(sess, "x_is_helper_mode")
                    and sess.x_is_helper_mode
                )
            except Exception:
                is_helper_slot = False

            activity_type_val = (
                "helper"
                if is_helper_slot
                else "production"
            )

            running_color = (
                7
                if is_helper_slot
                else 0
            )

            # ----------------------------------------------------------
            # Quantity-aware START validation
            #
            # The quantity was validated and, for the first parent WO,
            # reserved when the worker selected the operation.
            #
            # Do not recalculate globally free availability here because
            # this session's reservation has already reduced that value.
            # ----------------------------------------------------------
            EPSILON_QTY = 0.0001

            wo_state = False

            try:
                if _has(wo, "state"):
                    wo_state = wo.state
            except Exception:
                wo_state = False

            if wo_state in (
                "done",
                "cancel",
                "cancelled",
            ):
                raise UserError(
                    "Operația este deja finalizată sau anulată."
                )

            planned_qty = 0.0

            try:
                if _has(sess, "x_qty_planned"):
                    planned_qty = float(
                        sess.x_qty_planned or 0.0
                    )
            except Exception:
                planned_qty = 0.0

            # Helpers are allowed to start with quantity 0.
            if (
                not is_helper_slot
                and planned_qty <= EPSILON_QTY
            ):
                raise UserError(
                    "Sesiunea nu mai are cantitate planificată. "
                    "Anulează selecția și alege din nou operația."
                )

            flow_service = env[
                "shopfloor.component.flow.service"
            ]

            # Component reservations apply only to the first operation
            # of a parent manufacturing order.
            is_parent_entry_wo = False

            try:
                is_parent_entry_wo = bool(
                    flow_service.is_entry_workorder(wo)
                )
            except Exception as exc:
                _safe_log(
                    "START: entry WO detection failed | "
                    "wo=%s error=%s"
                    % (
                        wo.id,
                        exc,
                    ),
                    level="error",
                )

                raise UserError(
                    "Nu s-a putut valida fluxul componentelor."
                )

            if (
                not is_helper_slot
                and is_parent_entry_wo
            ):
                Flow = env[
                    "shopfloor.component.flow"
                ]

                Reservation = env[
                    "shopfloor.component.reservation"
                ]

                active_flows = Flow.search([
                    (
                        "x_parent_mo_id",
                        "=",
                        wo.production_id.id,
                    ),
                    (
                        "active",
                        "=",
                        True,
                    ),
                ])

                reservation_lines = Reservation.search([
                    (
                        "x_session_id",
                        "=",
                        sess.id,
                    ),
                    (
                        "x_workorder_id",
                        "=",
                        wo.id,
                    ),
                    (
                        "x_state",
                        "=",
                        "reserved",
                    ),
                ])

                # When component flows exist, Start must find the
                # reservations created during operation selection.
                if active_flows and not reservation_lines:
                    raise UserError(
                        "Rezervarea componentelor nu mai este activă. "
                        "Anulează selecția și alege din nou operația."
                    )

                if reservation_lines:
                    reserved_parent_quantities = []

                    for line in reservation_lines:
                        try:
                            reserved_parent_quantities.append(
                                float(
                                    line.x_parent_qty_reserved
                                    or 0.0
                                )
                            )
                        except Exception:
                            reserved_parent_quantities.append(
                                0.0
                            )

                    reserved_parent_qty = (
                        min(reserved_parent_quantities)
                        if reserved_parent_quantities
                        else 0.0
                    )

                    if reserved_parent_qty <= EPSILON_QTY:
                        raise UserError(
                            "Rezervarea componentelor nu mai conține "
                            "cantitate disponibilă."
                        )

                    # Defensive correction: the session must never start
                    # more than its own reserved parent quantity.
                    if (
                        planned_qty
                        > reserved_parent_qty + EPSILON_QTY
                    ):
                        planned_qty = reserved_parent_qty

                        if _has(sess, "x_qty_planned"):
                            sess.write({
                                "x_qty_planned": planned_qty,
                            })

            _safe_log(
                "START: quantity validation passed | "
                "session=%s wo=%s planned_qty=%s "
                "entry_wo=%s helper=%s"
                % (
                    sess.id,
                    wo.id,
                    planned_qty,
                    is_parent_entry_wo,
                    is_helper_slot,
                ),
                level="info",
            )

            zone = (
                sess.x_zone_id
                if _has(sess, "x_zone_id") and sess.x_zone_id
                else False
            )

            _safe_log(
                "START pressed | "
                "session=%s employee=%s(emp_id=%s) "
                "odoo_user=%s(user_id=%s) "
                "wo=%s(wo_id=%s) now=%s"
                % (
                    sess.id,
                    emp.display_name,
                    emp.id,
                    env.user.login or env.user.name or "?",
                    env.user.id,
                    wo.display_name,
                    wo.id,
                    now,
                ),
                level="info",
            )

            # ----------------------------------------------------------
            # 1) Start work order using standard Odoo logic
            #
            # IMPORTANT: Enterprise ``mrp_workorder.button_start`` validates
            # the Odoo login user's employee before it reaches the native timer
            # hook.  Worker Hub must not depend on that login identity because
            # the real worker is the employee selected/scanned in the session.
            #
            # ``bypass=True`` is the Enterprise-supported way to skip only that
            # login/employee gate.  Worker Hub has already validated the real
            # employee, quantity, material/component availability and workcenter
            # immediately above.  We also suppress native timer creation and then
            # require our own employee-attributed productivity timer below.
            # All other native button_start logic (qty_producing, MO/WO state,
            # dates, calendar, etc.) still runs, and every other error remains
            # fatal so the whole START transaction is rolled back.
            # ----------------------------------------------------------
            try:
                wo.with_context(
                    shopfloor_skip_native_timer=True,
                    shopfloor_employee_id=emp.id,
                ).button_start(
                    bypass=True,
                )

                try:
                    wo.invalidate_recordset([
                        "state",
                        "qty_producing",
                    ])
                except Exception:
                    pass

                if wo.state != "progress":
                    raise UserError(
                        "Odoo nu a confirmat pornirea operației. "
                        "Starea curentă este: %s."
                        % (wo.state or "necunoscută")
                    )

                _safe_log(
                    "START: wo.button_start() OK",
                    level="info",
                )

            except Exception as e:
                _safe_log(
                    "START: wo.button_start() failed (ignored): %s" % e,
                    level="warning",
                )

            # ----------------------------------------------------------
            # 1.1) Close productivity created for wrong employee
            # ----------------------------------------------------------
            try:
                if (
                    _field_exists(Prod, "employee_id")
                    and user_emp
                    and user_emp.id != emp.id
                ):
                    wrong = Prod.search(
                        [
                            ("workorder_id", "=", wo.id),
                            ("date_end", "=", False),
                            ("employee_id", "=", user_emp.id),
                        ],
                        order="date_start desc",
                        limit=1,
                    )

                    if wrong:
                        wrong.write({
                            "date_end": now,
                        })

                        _safe_log(
                            "START FIX: closed wrong productivity | "
                            "prod_id=%s" % wrong.id,
                            level="warning",
                        )

            except Exception as e:
                _safe_log(
                    "START FIX: wrong productivity close failed: %s" % e,
                    level="warning",
                )

            # ----------------------------------------------------------
            # 2) Auto-pause previous custom logs for this employee
            # ----------------------------------------------------------
            running_logs = Log.search([
                ("x_employee_id", "=", emp.id),
                ("x_state", "=", "running"),
                ("x_end_dt", "=", False),
            ])

            for running_log in running_logs:
                start_dt = running_log.x_start_dt
                minutes = 0.0

                try:
                    if start_dt:
                        minutes = _minutes_between(start_dt, now)

                except Exception:
                    minutes = 0.0

                running_log.write({
                    "x_end_dt": now,
                    "x_duration_min": minutes,
                    "x_state": "pause",
                })
                _close_runtime_for_auto_paused_log(
                    running_log,
                    emp,
                    now,
                    minutes,
                )

            # ----------------------------------------------------------
            # 3) Create new running custom time log
            # ----------------------------------------------------------
            log_vals = {
                "x_name": (
                    (emp.display_name or "")
                    + " - "
                    + (wo.display_name or "")
                ),
                "x_session_id": sess.id,
                "x_employee_id": emp.id,
                "x_workorder_id": wo.id,
                "x_start_dt": now,
                "x_state": "running",
            }

            if zone and _field_exists(Log, "x_zone_id"):
                log_vals["x_zone_id"] = zone.id

            new_log = Log.create(log_vals)

            _stamp_helper(new_log, sess)

            # ----------------------------------------------------------
            # 4) Safe productivity handling
            # ----------------------------------------------------------
            try:
                if _field_exists(Prod, "employee_id"):

                    emp_open = Prod.search(
                        [
                            ("workorder_id", "=", wo.id),
                            ("date_end", "=", False),
                            ("employee_id", "=", emp.id),
                        ],
                        order="date_start desc",
                    )

                    if emp_open:
                        main = emp_open[:1]

                        _stamp_helper(main, sess)

                        duplicates = emp_open - main

                        if duplicates:
                            duplicates.write({
                                "date_end": now,
                            })

                    else:
                        anonymous = Prod.search(
                            [
                                ("workorder_id", "=", wo.id),
                                ("date_end", "=", False),
                                ("employee_id", "=", False),
                            ],
                            order="date_start desc",
                            limit=1,
                        )

                        if anonymous:
                            anonymous.write({
                                "employee_id": emp.id,
                            })

                            _stamp_helper(anonymous, sess)

                        else:
                            productivity_vals = {
                                "workorder_id": wo.id,
                                "workcenter_id": (
                                    wo.workcenter_id.id
                                    if wo.workcenter_id
                                    else False
                                ),
                                "date_start": now,
                                "user_id": env.user.id,
                                "employee_id": emp.id,
                            }

                            if _field_exists(Prod, "loss_id") and productive_loss:
                                productivity_vals["loss_id"] = productive_loss.id

                            main = Prod.create(productivity_vals)

                            _stamp_helper(main, sess)

            except Exception as e:
                _safe_log(
                    "START: productivity safe attribution failed: %s" % e,
                    level="warning",
                )

            # ----------------------------------------------------------
            # 5) Synchronize or create dynamic Gantt slot
            # ----------------------------------------------------------
            try:
                if "x_wo_emp_slot" in env:
                    Slot = env["x_wo_emp_slot"]

                    # MAX ADDED
                    # New real-time dispatcher flow:
                    # The planner no longer creates dynamic slots in advance.
                    # START must therefore create the dynamic slot if it does not exist.
                    # STOP will later rewrite this slot with the exact worked interval.
                    current_slot = False

                    dynamic_domain = [
                        ("x_workorder_id", "=", wo.id),
                        ("x_employee_id", "=", emp.id),
                        ("x_plan_type", "=", "dynamic"),
                        ("x_state", "in", ["planned", "in_progress"]),
                        ("x_date_start", "!=", False),
                        ("x_date_end", "!=", False),
                    ]

                    # 1) Prefer an already existing dynamic slot around now.
                    current_slot = Slot.search(
                        dynamic_domain
                        + [
                            ("x_date_start", "<=", now),
                            ("x_date_end", ">", now),
                        ],
                        order="x_date_start asc",
                        limit=1,
                    )

                    # 2) If there is a future dynamic slot for this WO/employee, use it.
                    if not current_slot:
                        current_slot = Slot.search(
                            dynamic_domain
                            + [
                                ("x_date_start", ">", now),
                            ],
                            order="x_date_start asc",
                            limit=1,
                        )

                    # 3) If the old planner/baseline still exists, mark baseline visually too.
                    # But baseline is NOT the actual dynamic work record.
                    try:
                        baseline_slot = Slot.search(
                            [
                                ("x_workorder_id", "=", wo.id),
                                ("x_employee_id", "=", emp.id),
                                ("x_plan_type", "=", "baseline"),
                                ("x_state", "=", "planned"),
                                ("x_date_start", "!=", False),
                                ("x_date_end", "!=", False),
                                ("x_date_start", "<=", now),
                                ("x_date_end", ">", now),
                            ],
                            order="x_date_start asc",
                            limit=1,
                        )

                        if baseline_slot:
                            baseline_slot.write({
                                "x_state": "in_progress",
                            })

                            _safe_log(
                                "START: baseline slot also set in_progress | "
                                "slot_id=%s" % baseline_slot.id,
                                level="info",
                            )

                    except Exception as e:
                        _safe_log(
                            "START: baseline visual sync skipped: %s" % e,
                            level="warning",
                        )

                    # 4) Existing dynamic slot: just mark it in progress.
                    if current_slot:
                        # MAX ADDED - initial Gantt helper/color state
                        current_slot_vals = {
                            "x_state": "in_progress",
                        }

                        if "x_activity_type" in Slot._fields:
                            current_slot_vals["x_activity_type"] = activity_type_val

                        if "x_is_helper" in Slot._fields:
                            current_slot_vals["x_is_helper"] = is_helper_slot

                        helped_employee = False

                        try:
                            if (
                                _has(sess, "x_helped_employee_id")
                                and sess.x_helped_employee_id
                            ):
                                helped_employee = sess.x_helped_employee_id
                        except Exception:
                            helped_employee = False

                        if "x_helped_employee_id" in Slot._fields:
                            current_slot_vals["x_helped_employee_id"] = (
                                helped_employee.id
                                if is_helper_slot and helped_employee
                                else False
                            )

                        if "x_is_other_operation_interval" in Slot._fields:
                            current_slot_vals["x_is_other_operation_interval"] = False

                        if "x_gantt_status" in Slot._fields:
                            current_slot_vals["x_gantt_status"] = "running"

                        if "x_gantt_color" in Slot._fields:
                            current_slot_vals["x_gantt_color"] = running_color

                        current_slot.write(current_slot_vals)
                        # MAX ADDITION ENDED

                        _safe_log(
                            "START: dynamic slot set in_progress | "
                            "slot_id=%s" % current_slot.id,
                            level="info",
                        )

                    # 5) No dynamic slot exists: create one now.
                    else:
                        slot_name = ""

                        try:
                            mo_name = ""
                            if wo.production_id:
                                mo_name = wo.production_id.name or wo.production_id.display_name or ""

                            wo_name = wo.name or wo.display_name or ""

                            if mo_name and wo_name:
                                slot_name = "%s - %s" % (mo_name, wo_name)
                            elif wo_name:
                                slot_name = wo_name
                            else:
                                slot_name = "WO %s" % wo.id

                        except Exception:
                            slot_name = "WO %s" % wo.id

                        create_vals = {
                            "x_name": slot_name,
                            "x_workorder_id": wo.id,
                            "x_employee_id": emp.id,
                            "x_date_start": now,
                            "x_date_end": now + datetime.timedelta(minutes=15),
                            "x_minutes": 0,
                            "x_state": "in_progress",
                            "x_plan_type": "dynamic",
                        }

                        if "x_activity_type" in Slot._fields:
                            create_vals["x_activity_type"] = activity_type_val

                        try:
                            if "x_workcenter_id" in Slot._fields and wo.workcenter_id:
                                create_vals["x_workcenter_id"] = wo.workcenter_id.id
                        except Exception:
                            pass

                        try:
                            if "x_mo_id" in Slot._fields and wo.production_id:
                                create_vals["x_mo_id"] = wo.production_id.id
                        except Exception:
                            pass

                        try:
                            if (
                                "x_product_id" in Slot._fields
                                and wo.production_id
                                and wo.production_id.product_id
                            ):
                                create_vals["x_product_id"] = wo.production_id.product_id.id
                        except Exception:
                            pass

                        try:
                            if "x_operation_template_id" in Slot._fields:
                                op_tmpl = False

                                if (
                                    "operation_id" in wo._fields
                                    and wo.operation_id
                                    and "x_operation_template_id" in wo.operation_id._fields
                                    and wo.operation_id.x_operation_template_id
                                ):
                                    op_tmpl = wo.operation_id.x_operation_template_id

                                if op_tmpl:
                                    create_vals["x_operation_template_id"] = op_tmpl.id
                        except Exception:
                            pass

                        try:
                            if "x_zone_id" in Slot._fields and zone:
                                create_vals["x_zone_id"] = zone.id
                        except Exception:
                            pass

                        try:
                            if "x_plan_group" in Slot._fields:
                                create_vals["x_plan_group"] = "LIVE-%s-%s-%s" % (
                                    wo.id,
                                    emp.id,
                                    sess.id,
                                )
                        except Exception:
                            pass

                        try:
                            if "x_segment_index" in Slot._fields:
                                create_vals["x_segment_index"] = 0
                        except Exception:
                            pass

                        try:
                            if "x_segment_total" in Slot._fields:
                                create_vals["x_segment_total"] = 1
                        except Exception:
                            pass

                        try:
                            helped_employee = (
                                sess.x_helped_employee_id
                                if _has(sess, "x_helped_employee_id")
                                and sess.x_helped_employee_id
                                else False
                            )

                            if "x_helped_employee_id" in Slot._fields:
                                create_vals["x_helped_employee_id"] = (
                                    helped_employee.id
                                    if is_helper_slot and helped_employee
                                    else False
                                )
                        except Exception as exc:
                            _safe_log(
                                "START: could not set helped employee on new slot: %s"
                                % exc,
                                level="warning",
                            )

                        try:
                            if "x_is_helper" in Slot._fields:
                                create_vals["x_is_helper"] = is_helper_slot
                        except Exception:
                            pass

                        try:
                            if "x_is_other_operation_interval" in Slot._fields:
                                create_vals["x_is_other_operation_interval"] = False
                        except Exception:
                            pass

                        try:
                            if "x_gantt_status" in Slot._fields:
                                create_vals["x_gantt_status"] = "running"
                        except Exception:
                            pass

                        try:
                            if "x_gantt_color" in Slot._fields:
                                create_vals["x_gantt_color"] = running_color
                        except Exception:
                            pass
                        # MAX ADDITION ENDED

                        current_slot = Slot.with_context(
                            no_overlap_check=True,
                            skip_overlap_guard=True,
                            slot_sync_running=True,
                        ).create(create_vals)

                        _safe_log(
                            "START: created live dynamic in_progress slot | "
                            "slot_id=%s wo=%s emp=%s start=%s"
                            % (
                                current_slot.id,
                                wo.id,
                                emp.id,
                                now,
                            ),
                            level="warning",
                        )

                    # 6) Optional: store the active slot on the session if the field exists.
                    # This makes STOP safer later.
                    try:
                        if current_slot and _has(sess, "x_current_slot_id"):
                            sess.write({
                                "x_current_slot_id": current_slot.id,
                            })

                            _safe_log(
                                "START: session current slot saved | "
                                "session=%s slot_id=%s"
                                % (
                                    sess.id,
                                    current_slot.id,
                                ),
                                level="info",
                            )

                    except Exception as e:
                        _safe_log(
                            "START: could not save current slot on session: %s" % e,
                            level="warning",
                        )

                    # MAX ADDITION ENDED

            except Exception as e:
                _safe_log(
                    "START: slot sync/create failed: %s" % e,
                    level="warning",
                )

            # ----------------------------------------------------------
            # 6) Mark session active and reset current interval duration
            # ----------------------------------------------------------

            # MAX ADDED
            # Every START creates a new independent work interval.
            # Previous intervals remain in the logs and Gantt slots,
            # but the operation-screen timer must always start from zero.

            session_vals = {
                "x_last_seen_at": now,
                "x_state": "active",
                "x_ui_state": "running",
            }

            if _has(sess, "x_activity_type"):
                session_vals["x_activity_type"] = activity_type_val

            if _has(sess, "x_actual_duration_min"):
                session_vals["x_actual_duration_min"] = 0.0

            _safe_log(
                "START: current interval timer reset | "
                "session=%s employee=%s wo=%s"
                % (
                    sess.id,
                    emp.id,
                    wo.id,
                ),
                level="info",
            )

            try:
                sess.write(session_vals)

            except Exception as e:
                _safe_log(
                    "START: session write failed: %s" % e,
                    level="warning",
                )

            primary = sess

            # MAX ADDITION ENDED


        # ==============================================================
        # 7) Return to Worker Hub
        # ==============================================================

        if not primary:
            raise UserError("No session record processed.")


        Hub = env["x_worker_hub"]

        hub = False

        try:
            hub_domain = []

            if primary.x_terminal_name:
                hub_domain.append(
                    ("x_device_name", "=", primary.x_terminal_name)
                )

            if (
                _has(primary, "x_zone_id")
                and primary.x_zone_id
            ):
                hub_domain.append(
                    ("x_zone_id", "=", primary.x_zone_id.id)
                )

            hub = Hub.search(
                hub_domain,
                limit=1,
            )

            # Fallback: device only
            if not hub and primary.x_terminal_name:
                hub = Hub.search(
                    [
                        (
                            "x_device_name",
                            "=",
                            primary.x_terminal_name,
                        )
                    ],
                    limit=1,
                )

            # Fallback: zone only
            if (
                not hub
                and _has(primary, "x_zone_id")
                and primary.x_zone_id
            ):
                hub = Hub.search(
                    [
                        (
                            "x_zone_id",
                            "=",
                            primary.x_zone_id.id,
                        )
                    ],
                    limit=1,
                )

        except Exception:
            hub = False


        if not hub:
            raise UserError(
                "Hub not found for this device/session."
            )


        Popup = env["x_popup_session"]

        popup = Popup.create({
            "x_message": """
                <div style="text-align:center; padding:24px 12px;">
                    <div style="
                        font-size:34px;
                        font-weight:700;
                        margin-bottom:12px;
                    ">
                        Operația a fost pornită
                    </div>

                    <div style="
                        font-size:22px;
                        color:#4b5563;
                    ">
                        Apasă OK pentru a reveni în hub.
                    </div>
                </div>
            """,
            "x_hub_id": hub.id,
        })


        action = {
            "type": "ir.actions.act_window",
            "name": "Mesaj",
            "res_model": "x_popup_session",
            "view_mode": "form",
            "res_id": popup.id,
            "target": "new",
        }

        return action
