import datetime
import logging

import pytz

from odoo import models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ShopfloorLiveFinishService(models.AbstractModel):
    _name = "shopfloor.live.finish.service"
    _description = "Shopfloor Live Finish Confirm Service"

    def finish_confirm(self, popups):
        env = self.env
        records = popups

        def log(msg, level="info"):
            try:
                if level == "debug":
                    _logger.debug(msg)
                elif level == "warning":
                    _logger.warning(msg)
                elif level == "error":
                    _logger.error(msg)
                else:
                    _logger.info(msg)
            except Exception:
                pass

        # ==============================================================
        # Model: x_session_stop_popup
        # Button: Finish Confirm
        #
        # Behavior:
        # - validates popup context
        # - finalizes current worker log
        # - reconciles finished dynamic slot for this employee
        # - shifts this employee's later dynamic slots FROM TODAY onward
        # - enqueues planner only if no more slots remain today and
        #   the employee still has working time left today
        # - accumulates qty on WO
        # - appends delay reason on WO
        # - finishes WO only if safe
        # - reconciles baseline slots when the WO is completed
        # - closes session when WO is complete
        # - resets session and returns partial WO to ready pool when incomplete
        # - returns to hub
        # ==============================================================

        REPLAN_THRESHOLD_MIN = 15.0
        SKIP_PLANNER = True  # MAX ADDED: planner queue disabled for live dispatch flow
        EPSILON_QTY = 0.0001

        TAIL_SCAN_MINUTES = 5
        TAIL_TRIGGER_TYPE = "delay"
        TAIL_HORIZON_BUFFER_DAYS = 7


        def _safe_log(msg, level="info"):
            try:
                log(msg, level=level)
            except Exception:
                pass


        def _has(rec, name):
            try:
                return name in rec._fields
            except Exception:
                return False


        def _field_exists(model_rec, field_name):
            try:
                return field_name in model_rec._fields
            except Exception:
                return False


        def _company_calendar():
            try:
                return (
                    env.user.company_id
                    and env.user.company_id.resource_calendar_id
                    or False
                )
            except Exception:
                return False


        def _get_resource_id(rec):
            try:
                if rec and _has(rec, "resource_id") and rec.resource_id:
                    return rec.resource_id.id
            except Exception:
                pass

            return False


        def _get_employee_calendar(emp):
            cal = False
            res_id = False

            try:
                if (
                    emp
                    and _has(emp, "resource_calendar_id")
                    and emp.resource_calendar_id
                ):
                    cal = emp.resource_calendar_id
            except Exception:
                pass

            try:
                if (
                    not cal
                    and emp
                    and _has(emp, "resource_id")
                    and emp.resource_id
                ):
                    res = emp.resource_id

                    cal = (
                        (_has(res, "calendar_id") and res.calendar_id)
                        or (
                            _has(res, "resource_calendar_id")
                            and res.resource_calendar_id
                        )
                        or False
                    )
            except Exception:
                pass

            try:
                if (
                    not cal
                    and emp
                    and _has(emp, "contract_id")
                    and emp.contract_id
                ):
                    contract = emp.contract_id

                    if (
                        _has(contract, "resource_calendar_id")
                        and contract.resource_calendar_id
                    ):
                        cal = contract.resource_calendar_id
            except Exception:
                pass

            try:
                if (
                    not cal
                    and emp
                    and _has(emp, "contract_ids")
                    and emp.contract_ids
                ):
                    best = False

                    for contract in emp.contract_ids:
                        state = (
                            contract.state
                            if _has(contract, "state")
                            else False
                        )

                        if state in ("open", "active", "running"):
                            best = contract
                            break

                        best = best or contract

                    if (
                        best
                        and _has(best, "resource_calendar_id")
                        and best.resource_calendar_id
                    ):
                        cal = best.resource_calendar_id
            except Exception:
                pass

            res_id = _get_resource_id(emp)

            _safe_log(
                "TAIL_DBG: employee_calendar emp=%s cal=%s res_id=%s"
                % (
                    emp.id if emp else False,
                    cal.id if cal else False,
                    res_id,
                ),
                level="info",
            )

            return cal, res_id


        def _get_slot_workcenter_calendar(slot):
            cal = False
            res_id = False

            try:
                if (
                    slot
                    and _has(slot, "x_workcenter_id")
                    and slot.x_workcenter_id
                ):
                    wc = slot.x_workcenter_id

                    if (
                        _has(wc, "resource_calendar_id")
                        and wc.resource_calendar_id
                    ):
                        cal = wc.resource_calendar_id

                    res_id = _get_resource_id(wc)
            except Exception:
                pass

            if not cal:
                cal = _company_calendar()

            _safe_log(
                "TAIL_DBG: slot_wc_calendar slot=%s wc_cal=%s wc_res_id=%s"
                % (
                    slot.id if slot else False,
                    cal.id if cal else False,
                    res_id,
                ),
                level="info",
            )

            return cal, res_id


        def _cal_work_hours(cal, start_dt, end_dt, resource_id=False):
            if not cal:
                return 0.0

            try:
                return cal.get_work_hours_count(
                    start_dt,
                    end_dt,
                    compute_leaves=True,
                    resource_id=resource_id or False,
                )
            except Exception:
                try:
                    return cal.get_work_hours_count(
                        start_dt,
                        end_dt,
                        compute_leaves=True,
                    )
                except Exception:
                    return 0.0


        def _calendar_is_working(cal, dt_utc_naive, resource_id=False):
            if not cal:
                return True

            try:
                wh = _cal_work_hours(
                    cal,
                    dt_utc_naive,
                    dt_utc_naive + datetime.timedelta(minutes=1),
                    resource_id=resource_id or False,
                )

                return (wh or 0.0) > 0.0
            except Exception:
                return False


        def _both_working(
            emp_cal,
            emp_res_id,
            wc_cal,
            wc_res_id,
            dt_utc_naive,
        ):
            if not _calendar_is_working(
                emp_cal,
                dt_utc_naive,
                resource_id=emp_res_id,
            ):
                return False

            if not _calendar_is_working(
                wc_cal,
                dt_utc_naive,
                resource_id=wc_res_id,
            ):
                return False

            return True


        def _ceil_to_step(dt, step_minutes):
            if not dt:
                return dt

            flo_min = (dt.minute // step_minutes) * step_minutes
            flo = dt.replace(
                minute=flo_min,
                second=0,
                microsecond=0,
            )

            if flo == dt.replace(second=0, microsecond=0):
                return flo

            return flo + datetime.timedelta(minutes=step_minutes)


        def _slot_duration_minutes(slot):
            try:
                if _has(slot, "x_minutes") and slot.x_minutes:
                    return int(float(slot.x_minutes or 0.0))
            except Exception:
                pass

            try:
                if (
                    _has(slot, "x_date_start")
                    and _has(slot, "x_date_end")
                    and slot.x_date_start
                    and slot.x_date_end
                ):
                    delta = slot.x_date_end - slot.x_date_start
                    mins = int(
                        (delta.days * 86400 + delta.seconds) / 60.0
                    )

                    if mins > 0:
                        return mins
            except Exception:
                pass

            return 15


        def _interval_overlap(a_start, a_end, b_start, b_end):
            try:
                return (
                    a_start < b_end
                    and a_end > b_start
                )
            except Exception:
                return False


        def _load_employee_blockers(
            emp,
            exclude_ids,
            window_start,
            window_end,
        ):
            Slot = env["x_wo_emp_slot"]
            blockers = []

            domain = [
                ("x_employee_id", "=", emp.id),
                ("x_state", "in", ["planned", "in_progress"]),
                ("x_date_end", ">", window_start),
                ("x_date_start", "<", window_end),
            ]

            try:
                rows = Slot.search(
                    domain,
                    order="x_date_start asc, id asc",
                )
            except Exception:
                rows = Slot.browse([])

            exclude_set = set(exclude_ids or [])

            for slot in rows:
                try:
                    if slot.id in exclude_set:
                        continue

                    if not (
                        _has(slot, "x_date_start")
                        and slot.x_date_start
                        and _has(slot, "x_date_end")
                        and slot.x_date_end
                    ):
                        continue

                    blockers.append(
                        (
                            slot.id,
                            slot.x_date_start,
                            slot.x_date_end,
                        )
                    )
                except Exception:
                    pass

            _safe_log(
                "TAIL_DBG: blockers emp=%s count=%s exclude_ids=%s "
                "window=[%s..%s]"
                % (
                    emp.id if emp else False,
                    len(blockers),
                    list(exclude_set),
                    window_start,
                    window_end,
                ),
                level="info",
            )

            return blockers


        def _first_blocker_end(start_dt, end_dt, blockers):
            first_end = False

            for blocker_id, blocker_start, blocker_end in blockers:
                if _interval_overlap(
                    start_dt,
                    end_dt,
                    blocker_start,
                    blocker_end,
                ):
                    if not first_end or blocker_end < first_end:
                        first_end = blocker_end

            return first_end


        def _next_work_instant(
            emp_cal,
            emp_res_id,
            wc_cal,
            wc_res_id,
            dt_utc_naive,
            horizon_end,
        ):
            cur = _ceil_to_step(
                dt_utc_naive,
                TAIL_SCAN_MINUTES,
            )

            step = datetime.timedelta(
                minutes=TAIL_SCAN_MINUTES,
            )

            while cur and cur < horizon_end:
                if _both_working(
                    emp_cal,
                    emp_res_id,
                    wc_cal,
                    wc_res_id,
                    cur,
                ):
                    return cur

                cur = cur + step

            return False


        def _interval_is_working(
            emp_cal,
            emp_res_id,
            wc_cal,
            wc_res_id,
            start_dt,
            end_dt,
        ):
            step = datetime.timedelta(
                minutes=TAIL_SCAN_MINUTES,
            )

            cur = start_dt

            while cur < end_dt:
                if not _both_working(
                    emp_cal,
                    emp_res_id,
                    wc_cal,
                    wc_res_id,
                    cur,
                ):
                    return False

                cur = cur + step

            try:
                probe = end_dt - datetime.timedelta(minutes=1)

                if probe >= start_dt:
                    if not _both_working(
                        emp_cal,
                        emp_res_id,
                        wc_cal,
                        wc_res_id,
                        probe,
                    ):
                        return False
            except Exception:
                pass

            return True


        def _find_continuous_interval_for_slot(
            slot,
            emp,
            cursor_dt,
            duration_min,
            horizon_end,
            blockers,
        ):
            emp_cal, emp_res_id = _get_employee_calendar(emp)
            wc_cal, wc_res_id = _get_slot_workcenter_calendar(slot)

            candidate = _next_work_instant(
                emp_cal,
                emp_res_id,
                wc_cal,
                wc_res_id,
                cursor_dt,
                horizon_end,
            )

            if not candidate:
                _safe_log(
                    "TAIL_DBG: no_candidate slot=%s cursor=%s "
                    "duration=%s horizon_end=%s"
                    % (
                        slot.id if slot else False,
                        cursor_dt,
                        duration_min,
                        horizon_end,
                    ),
                    level="warning",
                )

                return False, False

            step = datetime.timedelta(
                minutes=TAIL_SCAN_MINUTES,
            )

            _safe_log(
                "TAIL_DBG: start_find slot=%s cursor=%s "
                "first_candidate=%s duration=%s horizon_end=%s"
                % (
                    slot.id if slot else False,
                    cursor_dt,
                    candidate,
                    duration_min,
                    horizon_end,
                ),
                level="info",
            )

            while candidate and candidate < horizon_end:
                end_dt = candidate + datetime.timedelta(
                    minutes=duration_min,
                )

                if end_dt > horizon_end:
                    _safe_log(
                        "TAIL_DBG: candidate_exceeds_horizon "
                        "slot=%s candidate=%s end_dt=%s horizon_end=%s"
                        % (
                            slot.id if slot else False,
                            candidate,
                            end_dt,
                            horizon_end,
                        ),
                        level="warning",
                    )

                    return False, False

                if not _interval_is_working(
                    emp_cal,
                    emp_res_id,
                    wc_cal,
                    wc_res_id,
                    candidate,
                    end_dt,
                ):
                    _safe_log(
                        "TAIL_DBG: candidate_not_working "
                        "slot=%s candidate=%s end_dt=%s"
                        % (
                            slot.id if slot else False,
                            candidate,
                            end_dt,
                        ),
                        level="info",
                    )

                    candidate = _next_work_instant(
                        emp_cal,
                        emp_res_id,
                        wc_cal,
                        wc_res_id,
                        candidate + step,
                        horizon_end,
                    )

                    continue

                block_end = _first_blocker_end(
                    candidate,
                    end_dt,
                    blockers,
                )

                if block_end:
                    _safe_log(
                        "TAIL_DBG: candidate_blocked "
                        "slot=%s candidate=%s end_dt=%s block_end=%s"
                        % (
                            slot.id if slot else False,
                            candidate,
                            end_dt,
                            block_end,
                        ),
                        level="info",
                    )

                    candidate = _next_work_instant(
                        emp_cal,
                        emp_res_id,
                        wc_cal,
                        wc_res_id,
                        block_end,
                        horizon_end,
                    )

                    continue

                _safe_log(
                    "TAIL_DBG: candidate_ok "
                    "slot=%s new_start=%s new_end=%s"
                    % (
                        slot.id if slot else False,
                        candidate,
                        end_dt,
                    ),
                    level="info",
                )

                return candidate, end_dt

            _safe_log(
                "TAIL_DBG: no_fit_found slot=%s after_loop"
                % (slot.id if slot else False),
                level="warning",
            )

            return False, False


        def _employee_has_work_left_today(emp, after_dt):
            if not emp or not after_dt:
                _safe_log(
                    "TAIL_DBG: work_left_today emp=%s after=%s "
                    "-> False (missing emp/after)"
                    % (
                        emp.id if emp else False,
                        after_dt,
                    ),
                    level="info",
                )

                return False

            day_end = after_dt.replace(
                hour=23,
                minute=59,
                second=59,
                microsecond=0,
            )

            if after_dt >= day_end:
                _safe_log(
                    "TAIL_DBG: work_left_today emp=%s after=%s "
                    "-> False (after day_end)"
                    % (
                        emp.id,
                        after_dt,
                    ),
                    level="info",
                )

                return False

            emp_cal, emp_res_id = _get_employee_calendar(emp)

            if not emp_cal:
                _safe_log(
                    "TAIL_DBG: work_left_today emp=%s after=%s "
                    "-> True (no calendar fail-open)"
                    % (
                        emp.id,
                        after_dt,
                    ),
                    level="warning",
                )

                return True

            try:
                wh = _cal_work_hours(
                    emp_cal,
                    after_dt,
                    day_end,
                    resource_id=emp_res_id or False,
                )

                result = (wh or 0.0) > 0.0

                _safe_log(
                    "TAIL_DBG: work_left_today emp=%s after=%s "
                    "day_end=%s hours=%s -> %s"
                    % (
                        emp.id,
                        after_dt,
                        day_end,
                        wh,
                        result,
                    ),
                    level="info",
                )

                return result

            except Exception:
                _safe_log(
                    "TAIL_DBG: work_left_today emp=%s after=%s "
                    "-> True (exception fail-open)"
                    % (
                        emp.id,
                        after_dt,
                    ),
                    level="warning",
                )

                return True

        # MAX ADDED - Gantt status/color helpers
        def _gantt_float(value):
            try:
                return float(value or 0.0)
            except Exception:
                return 0.0


        def _gantt_duration_min(start_dt, end_dt):
            try:
                if start_dt and end_dt:
                    delta = end_dt - start_dt

                    return max(
                        0.0,
                        (
                            delta.days * 86400
                            + delta.seconds
                            + delta.microseconds / 1000000.0
                        ) / 60.0,
                    )
            except Exception:
                pass

            return 0.0


        # Odoo color indexes used by x_gantt_color
        # New requested rules:
        # - Rosu: Te < Tl  (expected/planned time is less than worked/actual time)
        # - Verde: Te >= Tl (expected/planned time is greater/equal than worked/actual time)
        # - Albastru: Ajutor
        # - Galben: Alte Operatii
        COLOR_RED = 1
        COLOR_ORANGE = 2
        COLOR_YELLOW = 3
        COLOR_BLUE = 4
        COLOR_YELLOW_GREEN = 5
        COLOR_GREEN = 10


        def _is_helper_interval(slot=False, sess=False, log_rec=False):
            try:
                if slot and _has(slot, "x_is_helper") and slot.x_is_helper:
                    return True
            except Exception:
                pass

            try:
                if (
                    slot
                    and _has(slot, "x_activity_type")
                    and slot.x_activity_type == "helper"
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    sess
                    and _has(sess, "x_is_helper_mode")
                    and sess.x_is_helper_mode
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    sess
                    and _has(sess, "x_activity_type")
                    and sess.x_activity_type == "helper"
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    log_rec
                    and _has(log_rec, "x_activity_type")
                    and log_rec.x_activity_type == "helper"
                ):
                    return True
            except Exception:
                pass

            return False


        def _is_other_operation_interval(slot=False, sess=False, log_rec=False):
            try:
                if (
                    slot
                    and _has(slot, "x_is_other_operation_interval")
                    and slot.x_is_other_operation_interval
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    slot
                    and _has(slot, "x_activity_type")
                    and slot.x_activity_type == "other"
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    slot
                    and _has(slot, "x_other_operation_id")
                    and slot.x_other_operation_id
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    sess
                    and _has(sess, "x_activity_type")
                    and sess.x_activity_type == "other"
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    sess
                    and _has(sess, "x_other_operation_id")
                    and sess.x_other_operation_id
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    log_rec
                    and _has(log_rec, "x_activity_type")
                    and log_rec.x_activity_type == "other"
                ):
                    return True
            except Exception:
                pass

            try:
                if (
                    log_rec
                    and _has(log_rec, "x_other_operation_id")
                    and log_rec.x_other_operation_id
                ):
                    return True
            except Exception:
                pass

            return False

        def _gantt_duration_min(start_dt, end_dt):
            try:
                if start_dt and end_dt:
                    delta = end_dt - start_dt

                    return max(
                        0.0,
                        (
                            delta.days * 86400
                            + delta.seconds
                            + delta.microseconds / 1000000.0
                        ) / 60.0,
                    )
            except Exception:
                pass

            return 0.0

        def _gantt_effective_duration_min(
            slot,
            start_dt,
            end_dt,
        ):
            raw_minutes = _gantt_duration_min(
                start_dt,
                end_dt,
            )

            if (
                raw_minutes <= 0.0
                or not start_dt
                or not end_dt
            ):
                return raw_minutes

            if "employee.bonus.daily.break" not in env:
                _safe_log(
                    "GANTT_BREAK_TIME: model "
                    "employee.bonus.daily.break not found",
                    level="warning",
                )
                return raw_minutes

            employee = False

            try:
                if (
                    slot
                    and _has(slot, "x_employee_id")
                    and slot.x_employee_id
                ):
                    employee = slot.x_employee_id
            except Exception:
                employee = False

            company = False

            try:
                if employee and employee.company_id:
                    company = employee.company_id
            except Exception:
                company = False

            company = company or env.company

            timezone_name = False

            try:
                employee_calendar, employee_resource_id = (
                    _get_employee_calendar(employee)
                )

                if (
                    employee_calendar
                    and _has(employee_calendar, "tz")
                    and employee_calendar.tz
                ):
                    timezone_name = employee_calendar.tz
            except Exception:
                timezone_name = False

            try:
                if (
                    not timezone_name
                    and company.resource_calendar_id
                    and company.resource_calendar_id.tz
                ):
                    timezone_name = company.resource_calendar_id.tz
            except Exception:
                pass

            timezone_name = (
                timezone_name
                or env.user.tz
                or "UTC"
            )

            try:
                local_timezone = pytz.timezone(
                    timezone_name
                )
            except Exception:
                local_timezone = pytz.UTC
                timezone_name = "UTC"

            def _to_local(value):
                if value.tzinfo:
                    return value.astimezone(
                        local_timezone
                    )

                return pytz.UTC.localize(
                    value
                ).astimezone(
                    local_timezone
                )

            def _float_hour_to_minutes(value):
                try:
                    minutes = int(
                        round(
                            float(value or 0.0) * 60.0
                        )
                    )
                except Exception:
                    minutes = 0

                return max(
                    0,
                    min(minutes, 1440),
                )

            def _localize(value):
                try:
                    return local_timezone.localize(
                        value,
                        is_dst=None,
                    )
                except Exception:
                    return local_timezone.localize(
                        value,
                        is_dst=False,
                    )

            try:
                start_local = _to_local(start_dt)
                end_local = _to_local(end_dt)
            except Exception as exc:
                _safe_log(
                    "GANTT_BREAK_TIME: timezone conversion "
                    "failed start=%s end=%s timezone=%s err=%s"
                    % (
                        start_dt,
                        end_dt,
                        timezone_name,
                        exc,
                    ),
                    level="warning",
                )
                return raw_minutes

            Break = env[
                "employee.bonus.daily.break"
            ].sudo()

            domain = [
                "|",
                ("company_id", "=", False),
                ("company_id", "=", company.id),
            ]

            if "is_total" in Break._fields:
                domain.append(
                    ("is_total", "=", False)
                )

            try:
                pause_lines = Break.search(
                    domain,
                    order="sequence asc, id asc",
                )
            except Exception as exc:
                _safe_log(
                    "GANTT_BREAK_TIME: pause search failed "
                    "company=%s err=%s"
                    % (
                        company.id,
                        exc,
                    ),
                    level="warning",
                )
                return raw_minutes

            overlaps = []

            # Begin one day earlier to support pauses
            # that cross midnight.
            current_day = (
                start_local.date()
                - datetime.timedelta(days=1)
            )
            last_day = end_local.date()

            while current_day <= last_day:
                midnight = datetime.datetime.combine(
                    current_day,
                    datetime.time.min,
                )

                for pause in pause_lines:
                    try:
                        pause_start_minutes = (
                            _float_hour_to_minutes(
                                pause.start_hour
                            )
                        )
                        pause_end_minutes = (
                            _float_hour_to_minutes(
                                pause.end_hour
                            )
                        )
                    except Exception:
                        continue

                    # Same start/end is treated as an empty line.
                    if (
                        pause_start_minutes
                        == pause_end_minutes
                    ):
                        continue

                    pause_start_naive = (
                        midnight
                        + datetime.timedelta(
                            minutes=pause_start_minutes,
                        )
                    )

                    pause_end_naive = (
                        midnight
                        + datetime.timedelta(
                            minutes=pause_end_minutes,
                        )
                    )

                    if (
                        pause_end_minutes
                        < pause_start_minutes
                    ):
                        pause_end_naive += (
                            datetime.timedelta(days=1)
                        )

                    try:
                        pause_start = _localize(
                            pause_start_naive
                        )
                        pause_end = _localize(
                            pause_end_naive
                        )
                    except Exception:
                        continue

                    overlap_start = max(
                        start_local,
                        pause_start,
                    )
                    overlap_end = min(
                        end_local,
                        pause_end,
                    )

                    if overlap_start < overlap_end:
                        overlaps.append(
                            (
                                overlap_start,
                                overlap_end,
                            )
                        )

                current_day += datetime.timedelta(
                    days=1
                )

            # Avoid subtracting the same period twice if
            # two configured pauses overlap.
            overlaps.sort(
                key=lambda interval: interval[0]
            )

            merged = []

            for overlap_start, overlap_end in overlaps:
                if (
                    not merged
                    or overlap_start > merged[-1][1]
                ):
                    merged.append(
                        [
                            overlap_start,
                            overlap_end,
                        ]
                    )
                else:
                    merged[-1][1] = max(
                        merged[-1][1],
                        overlap_end,
                    )

            pause_minutes = sum(
                (
                    overlap_end - overlap_start
                ).total_seconds() / 60.0
                for overlap_start, overlap_end in merged
            )

            effective_minutes = max(
                0.0,
                raw_minutes - pause_minutes,
            )

            _safe_log(
                "GANTT_BREAK_TIME: "
                "slot=%s employee=%s company=%s "
                "timezone=%s raw_min=%s pause_min=%s "
                "effective_min=%s pause_ids=%s"
                % (
                    slot.id if slot else False,
                    employee.id if employee else False,
                    company.id if company else False,
                    timezone_name,
                    raw_minutes,
                    pause_minutes,
                    effective_minutes,
                    pause_lines.ids,
                ),
                level="warning",
            )

            return effective_minutes

        def _slot_final_gantt_vals(
            slot,
            actual_start,
            actual_end,
            planned_min=0.0,
            planned_qty=0.0,
            is_incomplete_for_gantt=False,
            interval_qty_done=0.0,
            sess=False,
            log_rec=False,
        ):
            actual_min = _gantt_effective_duration_min(
                slot,
                actual_start,
                actual_end,
            )

            planned_min_val = _gantt_float(planned_min)
            planned_qty_val = _gantt_float(planned_qty)
            interval_qty_val = _gantt_float(interval_qty_done)

            # Prefer the expected duration originally stored on the slot.
            try:
                if (
                    slot
                    and _has(slot, "x_duration_expected")
                    and slot.x_duration_expected
                ):
                    planned_min_val = _gantt_float(
                        slot.x_duration_expected
                    )
            except Exception:
                pass

            # Quantity for which the expected duration was calculated.
            # Prefer the authoritative WO target quantity passed by STOP.
            # Fall back to the quantity stored on the slot for older slots.
            if planned_qty_val <= 0.0:
                try:
                    if (
                        slot
                        and _has(slot, "x_mo_qty")
                        and slot.x_mo_qty
                    ):
                        planned_qty_val = _gantt_float(
                            slot.x_mo_qty
                        )
                except Exception:
                    planned_qty_val = 0.0

            is_helper = _is_helper_interval(
                slot=slot,
                sess=sess,
                log_rec=log_rec,
            )

            is_other_operation = _is_other_operation_interval(
                slot=slot,
                sess=sess,
                log_rec=log_rec,
            )

            proportional_expected_min = planned_min_val

            # For an incomplete operation, calculate how much time
            # should have been needed for the pieces made in this interval.
            #
            # Example:
            # 120 pieces = 60 planned minutes
            # 30 pieces made = 15 expected minutes
            if (
                is_incomplete_for_gantt
                and planned_min_val > 0.0
                and planned_qty_val > 0.0
            ):
                quantity_ratio = (
                    interval_qty_val / planned_qty_val
                )

                quantity_ratio = max(
                    0.0,
                    min(quantity_ratio, 1.0),
                )

                proportional_expected_min = (
                    planned_min_val * quantity_ratio
                )

            # Priority:
            # 1. Other activities = yellow
            # 2. Help = blue
            # 3. Incomplete, within proportional time = yellow-green
            # 4. Incomplete, over proportional time = orange
            # 5. Complete, over planned time = red
            # 6. Complete, within planned time = green
            if is_other_operation:
                status = "other_activities"
                color = COLOR_YELLOW

            elif is_helper:
                status = "help"
                color = COLOR_BLUE

            elif is_incomplete_for_gantt:
                if (
                    proportional_expected_min > 0.0
                    and actual_min
                    > proportional_expected_min + 0.01
                ):
                    status = "incomplete_slow"
                    color = COLOR_ORANGE

                else:
                    status = "incomplete_fast"
                    color = COLOR_YELLOW_GREEN

            elif (
                planned_min_val > 0.0
                and actual_min > planned_min_val + 0.01
            ):
                status = "done_slow"
                color = COLOR_RED

            else:
                status = "done_fast"
                color = COLOR_GREEN

            _safe_log(
                "GANTT_COLOR_FINAL: "
                "slot=%s actual_min=%s "
                "planned_min=%s planned_qty=%s "
                "interval_qty=%s proportional_expected=%s "
                "helper=%s other=%s incomplete=%s "
                "status=%s color=%s"
                % (
                    slot.id if slot else False,
                    actual_min,
                    planned_min_val,
                    planned_qty_val,
                    interval_qty_val,
                    proportional_expected_min,
                    is_helper,
                    is_other_operation,
                    is_incomplete_for_gantt,
                    status,
                    color,
                ),
                level="warning",
            )

            return {
                "x_gantt_status": status,
                "x_gantt_color": color,
            }

        def _reconcile_employee_dynamic_slots(
            wo,
            emp,
            log_rec,
            sess=False,
            planned_min=0.0,
            planned_qty=0.0,
            is_incomplete_for_gantt=False,
            interval_qty_done=0.0,
        ):
            # MAX ADDED
            # Live dispatch flow:
            # - START creates one dynamic in_progress slot when the worker starts.
            # - STOP must close exactly that live slot.
            # - Do NOT delete other dynamic slots, because they may be previous partial
            #   work sessions/history for the same WO.
            if not wo or not emp or not log_rec:
                _safe_log(
                    "SESS_RECON_LIVE: missing wo/emp/log_rec -> skip",
                    level="warning",
                )

                return False

            if "x_wo_emp_slot" not in env:
                _safe_log(
                    "SESS_RECON_LIVE: x_wo_emp_slot model missing -> skip",
                    level="warning",
                )

                return False

            Slot = env["x_wo_emp_slot"]

            actual_start = False
            actual_end = False

            if (
                _has(log_rec, "x_start_dt")
                and log_rec.x_start_dt
            ):
                actual_start = log_rec.x_start_dt

            elif (
                _has(log_rec, "x_date_start")
                and log_rec.x_date_start
            ):
                actual_start = log_rec.x_date_start

            if (
                _has(log_rec, "x_end_dt")
                and log_rec.x_end_dt
            ):
                actual_end = log_rec.x_end_dt

            elif (
                _has(log_rec, "x_date_end")
                and log_rec.x_date_end
            ):
                actual_end = log_rec.x_date_end

            _safe_log(
                "SESS_RECON_LIVE: computed actual interval "
                "emp=%s start=%s end=%s"
                % (
                    emp.id,
                    actual_start,
                    actual_end,
                ),
                level="info",
            )

            if not actual_start or not actual_end:
                _safe_log(
                    "SESS_RECON_LIVE: missing actual interval for emp=%s "
                    "-> do nothing"
                    % emp.id,
                    level="warning",
                )

                return False

            if actual_end <= actual_start:
                _safe_log(
                    "SESS_RECON_LIVE: invalid interval start=%s end=%s "
                    "for emp=%s wo=%s -> skip slot reconciliation"
                    % (
                        actual_start,
                        actual_end,
                        emp.id,
                        wo.id,
                    ),
                    level="warning",
                )

                return False

            delta = actual_end - actual_start

            actual_minutes = (
                delta.days * 86400
                + delta.seconds
                + delta.microseconds / 1000000.0
            ) / 60.0

            if actual_minutes < 0.0:
                actual_minutes = 0.0

            # ----------------------------------------------------------
            # Find the exact live dynamic slot to close.
            # Priority:
            # 1) session.x_current_slot_id, if START saved it
            # 2) latest dynamic in_progress slot for this WO + employee
            # 3) latest dynamic slot overlapping the actual log interval
            # 4) latest non-cancelled dynamic slot for this WO + employee
            # ----------------------------------------------------------
            rep = False

            try:
                if (
                    sess
                    and _has(sess, "x_current_slot_id")
                    and sess.x_current_slot_id
                ):
                    candidate = sess.x_current_slot_id

                    if (
                        candidate
                        and candidate._name == "x_wo_emp_slot"
                        and _has(candidate, "x_workorder_id")
                        and candidate.x_workorder_id
                        and candidate.x_workorder_id.id == wo.id
                        and _has(candidate, "x_employee_id")
                        and candidate.x_employee_id
                        and candidate.x_employee_id.id == emp.id
                        and (
                            not _has(candidate, "x_plan_type")
                            or candidate.x_plan_type == "dynamic"
                        )
                        and (
                            not _has(candidate, "x_state")
                            or candidate.x_state != "cancelled"
                        )
                    ):
                        rep = candidate

                        _safe_log(
                            "SESS_RECON_LIVE: using sess.x_current_slot_id=%s"
                            % rep.id,
                            level="info",
                        )

            except Exception as exc:
                _safe_log(
                    "SESS_RECON_LIVE: current_slot lookup failed: %s"
                    % exc,
                    level="warning",
                )

            if not rep:
                rep = Slot.search(
                    [
                        ("x_workorder_id", "=", wo.id),
                        ("x_employee_id", "=", emp.id),
                        ("x_plan_type", "=", "dynamic"),
                        ("x_state", "=", "in_progress"),
                    ],
                    order="x_date_start desc, id desc",
                    limit=1,
                )

                if rep:
                    _safe_log(
                        "SESS_RECON_LIVE: using latest in_progress slot=%s"
                        % rep.id,
                        level="info",
                    )

            if not rep:
                rep = Slot.search(
                    [
                        ("x_workorder_id", "=", wo.id),
                        ("x_employee_id", "=", emp.id),
                        ("x_plan_type", "=", "dynamic"),
                        ("x_state", "!=", "cancelled"),
                        ("x_date_start", "<=", actual_end),
                        ("x_date_end", ">=", actual_start),
                    ],
                    order="x_date_start desc, id desc",
                    limit=1,
                )

                if rep:
                    _safe_log(
                        "SESS_RECON_LIVE: using overlapping slot=%s"
                        % rep.id,
                        level="info",
                    )

            if not rep:
                rep = Slot.search(
                    [
                        ("x_workorder_id", "=", wo.id),
                        ("x_employee_id", "=", emp.id),
                        ("x_plan_type", "=", "dynamic"),
                        ("x_state", "!=", "cancelled"),
                    ],
                    order="id desc",
                    limit=1,
                )

                if rep:
                    _safe_log(
                        "SESS_RECON_LIVE: using latest fallback slot=%s"
                        % rep.id,
                        level="warning",
                    )

            if not rep:
                _safe_log(
                    "SESS_RECON_LIVE: no dynamic slot found for wo=%s emp=%s"
                    % (
                        wo.id,
                        emp.id,
                    ),
                    level="warning",
                )

                return False

            old_rep_start = (
                rep.x_date_start
                if (
                    _has(rep, "x_date_start")
                    and rep.x_date_start
                )
                else False
            )

            old_rep_end = (
                rep.x_date_end
                if (
                    _has(rep, "x_date_end")
                    and rep.x_date_end
                )
                else False
            )

            rep_vals = {
                "x_state": "done",
            }

            # MAX ADDED - make finished slot filterable by activity type
            # Values expected on x_wo_emp_slot.x_activity_type:
            # - production: normal production work
            # - helper: employee helped another employee
            # - other: other operation / non-production activity
            activity_type_val = "production"

            try:
                if _is_other_operation_interval(
                    slot=rep,
                    sess=sess,
                    log_rec=log_rec,
                ):
                    activity_type_val = "other"

                elif _is_helper_interval(
                    slot=rep,
                    sess=sess,
                    log_rec=log_rec,
                ):
                    activity_type_val = "helper"

                else:
                    # If START/log already set a valid explicit type, preserve it.
                    try:
                        if (
                            log_rec
                            and _has(log_rec, "x_activity_type")
                            and log_rec.x_activity_type in [
                                "production",
                                "helper",
                                "other",
                            ]
                        ):
                            activity_type_val = log_rec.x_activity_type

                        elif (
                            sess
                            and _has(sess, "x_activity_type")
                            and sess.x_activity_type in [
                                "production",
                                "helper",
                                "other",
                            ]
                        ):
                            activity_type_val = sess.x_activity_type
                    except Exception:
                        pass

            except Exception:
                activity_type_val = "production"

            if _has(rep, "x_activity_type"):
                rep_vals["x_activity_type"] = activity_type_val

            if _has(rep, "x_is_helper"):
                rep_vals["x_is_helper"] = activity_type_val == "helper"

            if _has(rep, "x_is_other_operation_interval"):
                rep_vals["x_is_other_operation_interval"] = (
                    activity_type_val == "other"
                )

            other_op = False

            try:
                if (
                    sess
                    and _has(sess, "x_other_operation_id")
                    and sess.x_other_operation_id
                ):
                    other_op = sess.x_other_operation_id
            except Exception:
                other_op = False

            try:
                if (
                    not other_op
                    and log_rec
                    and _has(log_rec, "x_other_operation_id")
                    and log_rec.x_other_operation_id
                ):
                    other_op = log_rec.x_other_operation_id
            except Exception:
                pass

            if other_op and _has(rep, "x_other_operation_id"):
                rep_vals["x_other_operation_id"] = other_op.id

            _safe_log(
                "SLOT_ACTIVITY_TYPE: slot=%s activity_type=%s other_op=%s"
                % (
                    rep.id if rep else False,
                    activity_type_val,
                    other_op.id if other_op else False,
                ),
                level="warning",
            )
            # MAX ADDITION ENDED

            if _has(rep, "x_date_start"):
                rep_vals["x_date_start"] = actual_start

            if _has(rep, "x_date_end"):
                rep_vals["x_date_end"] = actual_end

            if _has(rep, "x_minutes"):
                rep_vals["x_minutes"] = actual_minutes

            if _has(rep, "x_actual_duration_min"):
                rep_vals["x_actual_duration_min"] = actual_minutes

            if _has(rep, "x_qty_done") and log_rec and _has(log_rec, "x_qty_done"):
                rep_vals["x_qty_done"] = log_rec.x_qty_done or 0.0

            # MAX ADDED - store quantity for this exact historical Gantt interval
            interval_qty_val = 0.0

            try:
                interval_qty_val = float(interval_qty_done or 0.0)
            except Exception:
                interval_qty_val = 0.0

            _safe_log(
                "SESS_RECON_LIVE: interval_qty_done=%s has_x_interval_qty_done=%s"
                % (
                    interval_qty_val,
                    _has(rep, "x_interval_qty_done"),
                ),
                level="warning",
            )

            if _has(rep, "x_interval_qty_done"):
                rep_vals["x_interval_qty_done"] = interval_qty_val
            # MAX ADDITION ENDED

            # MAX ADDED - final Gantt status/color after STOP
            gantt_vals = _slot_final_gantt_vals(
                rep,
                actual_start,
                actual_end,
                planned_min=planned_min,
                planned_qty=planned_qty,
                is_incomplete_for_gantt=is_incomplete_for_gantt,
                interval_qty_done=interval_qty_val,
                sess=sess,
                log_rec=log_rec,
            )

            if _has(rep, "x_gantt_status"):
                rep_vals["x_gantt_status"] = gantt_vals["x_gantt_status"]

            if _has(rep, "x_gantt_color"):
                rep_vals["x_gantt_color"] = gantt_vals["x_gantt_color"]

            # IMPORTANT:
            # Do NOT overwrite planned values here.
            # Keep x_duration_expected and x_mo_qty as originally planned.
            # MAX ADDITION ENDED

            # if _has(rep, "x_duration_expected") and planned_min:
            #     rep_vals["x_duration_expected"] = planned_min

            # if _has(rep, "x_mo_qty") and planned_qty:
            #     rep_vals["x_mo_qty"] = planned_qty
            # MAX ADDITION ENDED

            rep.with_context(
                wo_done_reconcile_running=True,
                no_overlap_check=True,
                skip_overlap_guard=True,
                slot_sync_running=True,
            ).write(rep_vals)

            _safe_log(
                "SESS_RECON_LIVE: slot=%s done old=[%s..%s] "
                "actual=[%s..%s] minutes=%s"
                % (
                    rep.id,
                    old_rep_start,
                    old_rep_end,
                    actual_start,
                    actual_end,
                    actual_minutes,
                ),
                level="warning",
            )

            recon_out = {
                "rep_id": rep.id,
                "actual_start": actual_start,
                "actual_end": actual_end,
                "actual_minutes": actual_minutes,
                "old_rep_start": old_rep_start,
                "old_rep_end": old_rep_end,
            }

            _safe_log(
                "SESS_RECON_LIVE: return=%s"
                % str(recon_out),
                level="info",
            )

            return recon_out

            # MAX ADDITION ENDED

        # MAX ADDED - auto-stop helper sessions when the main employee stops
        def _reset_helper_session_vals(helper_sess):
            vals = {}

            if not helper_sess:
                return vals

            if _has(helper_sess, "x_workorder_id"):
                vals["x_workorder_id"] = False

            if _has(helper_sess, "x_operation_template_id"):
                vals["x_operation_template_id"] = False

            if _has(helper_sess, "x_is_helper_mode"):
                vals["x_is_helper_mode"] = False

            if _has(helper_sess, "x_helped_employee_id"):
                vals["x_helped_employee_id"] = False

            if _has(helper_sess, "x_ui_state"):
                vals["x_ui_state"] = "not_started"

            if _has(helper_sess, "x_current_slot_id"):
                vals["x_current_slot_id"] = False

            for fname in [
                "x_operation_template_text",
                "x_wc_text",
                "x_product_mo_text",
            ]:
                if _has(helper_sess, fname):
                    vals[fname] = False

            for fname in [
                "x_qty_planned",
                "x_expected_duration_min",
                "x_actual_duration_min",
            ]:
                if _has(helper_sess, fname):
                    vals[fname] = 0.0

            return vals


        def _auto_stop_helpers_for_main_stop(wo, main_emp, main_sess, stop_dt):
            result = {
                "helper_session_count": 0,
                "helper_log_count": 0,
                "helper_slot_count": 0,
            }

            if not wo or not main_emp or not stop_dt:
                _safe_log(
                    "HELPER_AUTO_STOP: missing wo/main_emp/stop_dt -> skip",
                    level="warning",
                )
                return result

            if "x_shopfloor_session" not in env:
                _safe_log(
                    "HELPER_AUTO_STOP: x_shopfloor_session model missing -> skip",
                    level="warning",
                )
                return result

            Session = env["x_shopfloor_session"]
            Log = env["x_wo_time_log"]

            domain = []

            if _field_exists(Session, "x_workorder_id"):
                domain.append(("x_workorder_id", "=", wo.id))

            if _field_exists(Session, "x_is_helper_mode"):
                domain.append(("x_is_helper_mode", "=", True))

            if _field_exists(Session, "x_helped_employee_id"):
                domain.append(("x_helped_employee_id", "=", main_emp.id))

            if main_sess:
                domain.append(("id", "!=", main_sess.id))

            helper_sessions = Session.search(domain)

            result["helper_session_count"] = len(helper_sessions)

            _safe_log(
                "HELPER_AUTO_STOP: found helper_sessions=%s ids=%s domain=%s"
                % (
                    len(helper_sessions),
                    helper_sessions.ids,
                    str(domain),
                ),
                level="warning",
            )

            for helper_sess in helper_sessions:
                helper_emp = False

                try:
                    if (
                        _has(helper_sess, "x_employee_id")
                        and helper_sess.x_employee_id
                    ):
                        helper_emp = helper_sess.x_employee_id
                except Exception:
                    helper_emp = False

                if not helper_emp:
                    _safe_log(
                        "HELPER_AUTO_STOP: helper session %s has no employee -> skip"
                        % helper_sess.id,
                        level="warning",
                    )
                    continue

                helper_log_domain = [
                    ("x_employee_id", "=", helper_emp.id),
                    ("x_workorder_id", "=", wo.id),
                    ("x_state", "=", "running"),
                    ("x_end_dt", "=", False),
                ]

                # Must belong to this exact helper session.
                if _field_exists(Log, "x_session_id"):
                    helper_log_domain.append(
                        ("x_session_id", "=", helper_sess.id)
                    )

                # Must really be a Help interval.
                if _field_exists(Log, "x_activity_type"):
                    helper_log_domain.append(
                        ("x_activity_type", "=", "helper")
                    )

                # If available, also require that this helper was helping
                # the employee who is currently stopping the main operation.
                if _field_exists(Log, "x_helped_employee_id"):
                    helper_log_domain.append(
                        ("x_helped_employee_id", "=", main_emp.id)
                    )

                helper_log = Log.search(
                    helper_log_domain,
                    order="x_start_dt desc, id desc",
                    limit=1,
                )

                if not helper_log:
                    _safe_log(
                        "HELPER_AUTO_STOP: no running helper log "
                        "helper_sess=%s helper_emp=%s wo=%s"
                        % (
                            helper_sess.id,
                            helper_emp.id,
                            wo.id,
                        ),
                        level="warning",
                    )

                    vals_hs = _reset_helper_session_vals(helper_sess)
                    if vals_hs:
                        helper_sess.write(vals_hs)

                    continue

                h_start = (
                    helper_log.x_start_dt
                    if _has(helper_log, "x_start_dt")
                    else False
                )

                h_end = stop_dt

                if h_start and h_end and h_end <= h_start:
                    h_end = h_start + datetime.timedelta(seconds=1)

                h_minutes = 0.0

                if h_start and h_end and h_end > h_start:
                    h_delta = h_end - h_start
                    h_minutes = (
                        h_delta.days * 86400
                        + h_delta.seconds
                        + h_delta.microseconds / 1000000.0
                    ) / 60.0

                vals_hlog = {}

                if _has(helper_log, "x_end_dt"):
                    vals_hlog["x_end_dt"] = h_end

                if _has(helper_log, "x_duration_min"):
                    vals_hlog["x_duration_min"] = h_minutes

                if _has(helper_log, "x_state"):
                    vals_hlog["x_state"] = "done"

                if _has(helper_log, "x_qty_done"):
                    vals_hlog["x_qty_done"] = 0.0

                helper_log.write(vals_hlog)

                result["helper_log_count"] += 1

                _safe_log(
                    "HELPER_AUTO_STOP: closed helper_log=%s helper_emp=%s "
                    "start=%s end=%s minutes=%s"
                    % (
                        helper_log.id,
                        helper_emp.id,
                        h_start,
                        h_end,
                        h_minutes,
                    ),
                    level="warning",
                )

                try:
                    helper_recon = _reconcile_employee_dynamic_slots(
                        wo,
                        helper_emp,
                        helper_log,
                        helper_sess,
                        planned_min=0.0,
                        is_incomplete_for_gantt=False,
                    )

                    if helper_recon:
                        result["helper_slot_count"] += 1

                    _safe_log(
                        "HELPER_AUTO_STOP: helper_recon=%s"
                        % str(helper_recon),
                        level="warning",
                    )

                except Exception as exc:
                    _safe_log(
                        "HELPER_AUTO_STOP: helper slot reconcile failed "
                        "helper_emp=%s err=%s"
                        % (
                            helper_emp.id,
                            exc,
                        ),
                        level="warning",
                    )

                vals_hs = _reset_helper_session_vals(helper_sess)

                if vals_hs:
                    helper_sess.write(vals_hs)

                    _safe_log(
                        "HELPER_AUTO_STOP: reset helper_sess=%s vals=%s"
                        % (
                            helper_sess.id,
                            str(vals_hs),
                        ),
                        level="warning",
                    )

            # ----------------------------------------------------------
            # SAFETY NET:
            # A helper session may have become stale/reset while its
            # x_wo_time_log remained open.
            #
            # The open running time log is the authoritative indication
            # that the helper is still working.
            #
            # Close any remaining open helper log for this WO/main worker.
            # ----------------------------------------------------------
            remaining_domain = [
                ("x_workorder_id", "=", wo.id),
                ("x_state", "=", "running"),
                ("x_end_dt", "=", False),
            ]

            if _field_exists(Log, "x_activity_type"):
                remaining_domain.append(
                    ("x_activity_type", "=", "helper")
                )

            if _field_exists(Log, "x_helped_employee_id"):
                remaining_domain.append(
                    ("x_helped_employee_id", "=", main_emp.id)
                )

            remaining_helper_logs = Log.search(
                remaining_domain,
                order="x_start_dt asc, id asc",
            )

            _safe_log(
                "HELPER_AUTO_STOP: remaining open helper logs "
                "after session pass | wo=%s main_emp=%s log_ids=%s"
                % (
                    wo.id,
                    main_emp.id,
                    remaining_helper_logs.ids,
                ),
                level="warning",
            )

            for remaining_log in remaining_helper_logs:
                remaining_emp = (
                    remaining_log.x_employee_id
                    if _has(remaining_log, "x_employee_id")
                    and remaining_log.x_employee_id
                    else False
                )

                if not remaining_emp:
                    continue

                remaining_sess = False

                if (
                    _has(remaining_log, "x_session_id")
                    and remaining_log.x_session_id
                ):
                    remaining_sess = remaining_log.x_session_id

                r_start = (
                    remaining_log.x_start_dt
                    if _has(remaining_log, "x_start_dt")
                    else False
                )

                r_end = stop_dt

                if r_start and r_end and r_end <= r_start:
                    r_end = r_start + datetime.timedelta(seconds=1)

                r_minutes = 0.0

                if r_start and r_end and r_end > r_start:
                    delta = r_end - r_start

                    r_minutes = (
                        delta.days * 86400
                        + delta.seconds
                        + delta.microseconds / 1000000.0
                    ) / 60.0

                remaining_vals = {}

                if _has(remaining_log, "x_end_dt"):
                    remaining_vals["x_end_dt"] = r_end

                if _has(remaining_log, "x_duration_min"):
                    remaining_vals["x_duration_min"] = r_minutes

                if _has(remaining_log, "x_state"):
                    remaining_vals["x_state"] = "done"

                if _has(remaining_log, "x_qty_done"):
                    remaining_vals["x_qty_done"] = 0.0

                remaining_log.write(remaining_vals)

                result["helper_log_count"] += 1

                _safe_log(
                    "HELPER_AUTO_STOP SAFETY: closed remaining helper log "
                    "log=%s emp=%s session=%s start=%s end=%s minutes=%s"
                    % (
                        remaining_log.id,
                        remaining_emp.id,
                        remaining_sess.id if remaining_sess else False,
                        r_start,
                        r_end,
                        r_minutes,
                    ),
                    level="warning",
                )

                # Reconcile the helper's Gantt slot using the same exact log.
                try:
                    remaining_recon = _reconcile_employee_dynamic_slots(
                        wo,
                        remaining_emp,
                        remaining_log,
                        remaining_sess,
                        planned_min=0.0,
                        is_incomplete_for_gantt=False,
                    )

                    if remaining_recon:
                        result["helper_slot_count"] += 1

                except Exception as exc:
                    _safe_log(
                        "HELPER_AUTO_STOP SAFETY: slot reconcile failed "
                        "log=%s emp=%s error=%s"
                        % (
                            remaining_log.id,
                            remaining_emp.id,
                            exc,
                        ),
                        level="warning",
                    )

                # Reset its helper session if it still exists.
                if remaining_sess:
                    vals_remaining_sess = _reset_helper_session_vals(
                        remaining_sess
                    )

                    if vals_remaining_sess:
                        remaining_sess.write(
                            vals_remaining_sess
                        )

            _safe_log(
                "HELPER_AUTO_STOP: result=%s"
                % str(result),
                level="warning",
            )

            return result
        # MAX ADDITION ENDED


        def _repack_employee_future_slots_from_today(
            sess,
            emp,
            recon_info,
        ):
            out = {
                "moved_count": 0,
                "deleted_count": 0,
                "needs_planner": False,
                "tail_end": False,
                "future_count": 0,
                "horizon_end": False,
            }

            if not emp or not recon_info:
                _safe_log(
                    "SHIFT_TAIL: skip emp=%s recon_info=%s"
                    % (
                        emp.id if emp else False,
                        str(recon_info),
                    ),
                    level="warning",
                )

                return out

            anchor_dt = recon_info.get("actual_end")
            rep_id = recon_info.get("rep_id")

            if not anchor_dt:
                _safe_log(
                    "SHIFT_TAIL: missing anchor_dt recon_info=%s"
                    % str(recon_info),
                    level="warning",
                )

                return out

            Slot = env["x_wo_emp_slot"]

            day_start = anchor_dt.replace(
                hour=0,
                minute=0,
                second=0,
                microsecond=0,
            )

            today_end = anchor_dt.replace(
                hour=23,
                minute=59,
                second=59,
                microsecond=0,
            )

            domain = [
                ("x_employee_id", "=", emp.id),
                ("x_plan_type", "=", "dynamic"),
                ("x_state", "in", ["planned", "in_progress"]),
                ("x_date_start", ">=", day_start),
                ("x_date_end", ">", anchor_dt),
            ]

            if rep_id:
                domain.append(
                    ("id", "!=", rep_id)
                )

            _safe_log(
                "SHIFT_TAIL: search_domain_from_today "
                "emp=%s rep_id=%s anchor=%s day_start=%s "
                "today_end=%s domain=%s"
                % (
                    emp.id,
                    rep_id,
                    anchor_dt,
                    day_start,
                    today_end,
                    str(domain),
                ),
                level="info",
            )

            future_slots = Slot.search(
                domain,
                order="x_date_start asc, id asc",
            )

            out["future_count"] = len(future_slots)

            horizon_end = today_end

            for slot in future_slots:
                try:
                    if (
                        _has(slot, "x_date_end")
                        and slot.x_date_end
                        and slot.x_date_end > horizon_end
                    ):
                        horizon_end = slot.x_date_end
                except Exception:
                    pass

            horizon_end = horizon_end + datetime.timedelta(
                days=TAIL_HORIZON_BUFFER_DAYS,
            )

            out["horizon_end"] = horizon_end

            _safe_log(
                "SHIFT_TAIL: emp=%s anchor=%s "
                "future_slots=%s ids=%s horizon_end=%s"
                % (
                    emp.id,
                    anchor_dt,
                    len(future_slots),
                    future_slots.ids,
                    horizon_end,
                ),
                level="info",
            )

            fs_list = [
                slot
                for slot in future_slots
            ]

            moving_ids = [
                slot.id
                for slot in fs_list
            ]

            blockers = _load_employee_blockers(
                emp,
                moving_ids,
                day_start,
                horizon_end,
            )

            cursor = anchor_dt

            if not fs_list:
                _safe_log(
                    "SHIFT_TAIL: no future slots found for "
                    "emp=%s from day_start=%s anchor=%s"
                    % (
                        emp.id,
                        day_start,
                        anchor_dt,
                    ),
                    level="warning",
                )

            for idx in range(len(fs_list)):
                slot = fs_list[idx]
                dur_min = _slot_duration_minutes(slot)

                old_start = (
                    slot.x_date_start
                    if (
                        _has(slot, "x_date_start")
                        and slot.x_date_start
                    )
                    else False
                )

                old_end = (
                    slot.x_date_end
                    if (
                        _has(slot, "x_date_end")
                        and slot.x_date_end
                    )
                    else False
                )

                _safe_log(
                    "SHIFT_TAIL: trying slot=%s idx=%s "
                    "old=[%s..%s] dur=%s cursor=%s"
                    % (
                        slot.id,
                        idx,
                        old_start,
                        old_end,
                        dur_min,
                        cursor,
                    ),
                    level="info",
                )

                new_start, new_end = (
                    _find_continuous_interval_for_slot(
                        slot,
                        emp,
                        cursor,
                        dur_min,
                        horizon_end,
                        blockers,
                    )
                )

                if not new_start or not new_end:
                    remaining_ids = [
                        remaining.id
                        for remaining in fs_list[idx:]
                    ]

                    if remaining_ids:
                        try:
                            Slot.browse(
                                remaining_ids
                            ).with_context(
                                wo_done_reconcile_running=True,
                                no_overlap_check=True,
                                skip_overlap_guard=True,
                            ).unlink()

                            out["deleted_count"] += len(
                                remaining_ids
                            )

                            _safe_log(
                                "SHIFT_TAIL: cannot fit after "
                                "cursor=%s -> deleted_remaining=%s ids=%s"
                                % (
                                    cursor,
                                    len(remaining_ids),
                                    remaining_ids,
                                ),
                                level="warning",
                            )

                        except Exception as exc:
                            _safe_log(
                                "SHIFT_TAIL DELETE FAILED: "
                                "ids=%s err=%s"
                                % (
                                    remaining_ids,
                                    exc,
                                ),
                                level="warning",
                            )

                    out["tail_end"] = cursor

                    out["needs_planner"] = (
                        _employee_has_work_left_today(
                            emp,
                            anchor_dt,
                        )
                    )

                    _safe_log(
                        "SHIFT_TAIL: early_return_no_fit "
                        "emp=%s tail_end=%s needs_planner=%s"
                        % (
                            emp.id,
                            out["tail_end"],
                            out["needs_planner"],
                        ),
                        level="warning",
                    )

                    return out

                vals = {}

                if _has(slot, "x_date_start"):
                    vals["x_date_start"] = new_start

                if _has(slot, "x_date_end"):
                    vals["x_date_end"] = new_end

                if _has(slot, "x_minutes"):
                    vals["x_minutes"] = dur_min

                try:
                    slot.with_context(
                        wo_done_reconcile_running=True,
                        no_overlap_check=True,
                        skip_overlap_guard=True,
                    ).write(vals)

                    _safe_log(
                        "SHIFT_TAIL: slot=%s old=[%s..%s] "
                        "new=[%s..%s] dur=%s"
                        % (
                            slot.id,
                            old_start,
                            old_end,
                            new_start,
                            new_end,
                            dur_min,
                        ),
                        level="info",
                    )

                    cursor = new_end
                    out["moved_count"] += 1

                except Exception as exc:
                    _safe_log(
                        "SHIFT_TAIL WRITE FAILED: "
                        "slot=%s err=%s"
                        % (
                            slot.id,
                            exc,
                        ),
                        level="warning",
                    )

                    remaining_ids = [
                        remaining.id
                        for remaining in fs_list[idx:]
                    ]

                    if remaining_ids:
                        try:
                            Slot.browse(
                                remaining_ids
                            ).with_context(
                                wo_done_reconcile_running=True,
                                no_overlap_check=True,
                                skip_overlap_guard=True,
                            ).unlink()

                            out["deleted_count"] += len(
                                remaining_ids
                            )

                            _safe_log(
                                "SHIFT_TAIL: write_failed -> "
                                "deleted_remaining=%s ids=%s"
                                % (
                                    len(remaining_ids),
                                    remaining_ids,
                                ),
                                level="warning",
                            )

                        except Exception as exc2:
                            _safe_log(
                                "SHIFT_TAIL DELETE AFTER WRITE FAILED: "
                                "ids=%s err=%s"
                                % (
                                    remaining_ids,
                                    exc2,
                                ),
                                level="warning",
                            )

                    out["tail_end"] = cursor

                    out["needs_planner"] = (
                        _employee_has_work_left_today(
                            emp,
                            anchor_dt,
                        )
                    )

                    _safe_log(
                        "SHIFT_TAIL: early_return_write_fail "
                        "emp=%s tail_end=%s needs_planner=%s"
                        % (
                            emp.id,
                            out["tail_end"],
                            out["needs_planner"],
                        ),
                        level="warning",
                    )

                    return out

            out["tail_end"] = cursor

            later_slots_today = Slot.search(
                [
                    ("x_employee_id", "=", emp.id),
                    ("x_plan_type", "=", "dynamic"),
                    (
                        "x_state",
                        "in",
                        ["planned", "in_progress"],
                    ),
                    ("x_date_start", ">=", anchor_dt),
                    ("x_date_start", "<", today_end),
                ],
                limit=1,
            )

            _safe_log(
                "SHIFT_TAIL: later_slots_today "
                "emp=%s anchor=%s later_count=%s later_ids=%s"
                % (
                    emp.id,
                    anchor_dt,
                    len(later_slots_today),
                    (
                        later_slots_today.ids
                        if later_slots_today
                        else []
                    ),
                ),
                level="info",
            )

            work_left = _employee_has_work_left_today(
                emp,
                anchor_dt,
            )

            if not later_slots_today and work_left:
                out["needs_planner"] = True

            _safe_log(
                "SHIFT_TAIL: result emp=%s moved=%s "
                "deleted=%s tail_end=%s work_left=%s "
                "needs_planner=%s horizon_end=%s"
                % (
                    emp.id,
                    out["moved_count"],
                    out["deleted_count"],
                    out["tail_end"],
                    work_left,
                    out["needs_planner"],
                    out["horizon_end"],
                ),
                level="info",
            )

            return out


        def _build_scope_key(sess, emp, wo):
            try:
                if (
                    sess
                    and _has(sess, "x_zone_id")
                    and sess.x_zone_id
                ):
                    return "zone_%s" % sess.x_zone_id.id
            except Exception:
                pass

            try:
                if (
                    sess
                    and _has(sess, "x_terminal_name")
                    and sess.x_terminal_name
                ):
                    return "terminal_%s" % sess.x_terminal_name
            except Exception:
                pass

            try:
                if emp:
                    return "emp_%s" % emp.id
            except Exception:
                pass

            try:
                if wo:
                    return "wo_%s" % wo.id
            except Exception:
                pass

            return "global"


        def _enqueue_planner_job(
            now_dt,
            trigger_type,
            sess,
            emp,
            wo,
        ):
            Queue = env["x_planning_queue"]

            scope_key = _build_scope_key(
                sess,
                emp,
                wo,
            )

            existing = Queue.search(
                [
                    ("x_scope_key", "=", scope_key),
                    (
                        "x_state",
                        "in",
                        ["pending", "processing"],
                    ),
                ],
                order="id desc",
                limit=1,
            )

            if existing:
                _safe_log(
                    "QUEUE: skipped existing id=%s scope=%s"
                    % (
                        existing.id,
                        scope_key,
                    ),
                    level="warning",
                )

                return existing.id

            vals_q = {
                "x_name": (
                    "Planner job - %s - %s"
                    % (
                        trigger_type,
                        scope_key,
                    )
                ),
                "x_state": "pending",
                "x_trigger_type": trigger_type,
                "x_scope_key": scope_key,
                "x_requested_at": now_dt,
            }

            if (
                emp
                and _field_exists(
                    Queue,
                    "x_employee_id",
                )
            ):
                vals_q["x_employee_id"] = emp.id

            if (
                wo
                and _field_exists(
                    Queue,
                    "x_workorder_id",
                )
            ):
                vals_q["x_workorder_id"] = wo.id

            if (
                sess
                and _field_exists(
                    Queue,
                    "x_session_id",
                )
            ):
                vals_q["x_session_id"] = sess.id

            _safe_log(
                "QUEUE: creating job trigger=%s scope=%s vals=%s"
                % (
                    trigger_type,
                    scope_key,
                    str(vals_q),
                ),
                level="warning",
            )

            queue_job = Queue.create(vals_q)

            _safe_log(
                "QUEUE: created id=%s vals=%s"
                % (
                    queue_job.id,
                    vals_q,
                ),
                level="warning",
            )

            return queue_job.id


        def _append_wo_delay(
            wo,
            emp,
            sess,
            reason,
            delay_minutes,
            qty_done,
        ):
            if not wo or not reason:
                return

            if (
                _has(wo, "x_delay_line_ids")
                and wo.x_delay_line_ids is not None
            ):
                try:
                    field_obj = wo._fields[
                        "x_delay_line_ids"
                    ]

                    line_model_name = (
                        field_obj.comodel_name
                    )

                    inverse_name = (
                        field_obj.inverse_name
                    )

                    Line = env[line_model_name]

                    vals_line = {}

                    if inverse_name:
                        vals_line[inverse_name] = wo.id

                    if _field_exists(
                        Line,
                        "x_workorder_id",
                    ):
                        vals_line["x_workorder_id"] = wo.id

                    elif _field_exists(
                        Line,
                        "workorder_id",
                    ):
                        vals_line["workorder_id"] = wo.id

                    elif _field_exists(
                        Line,
                        "x_wo_id",
                    ):
                        vals_line["x_wo_id"] = wo.id

                    if (
                        emp
                        and _field_exists(
                            Line,
                            "x_employee_id",
                        )
                    ):
                        vals_line["x_employee_id"] = emp.id

                    elif (
                        emp
                        and _field_exists(
                            Line,
                            "employee_id",
                        )
                    ):
                        vals_line["employee_id"] = emp.id

                    if (
                        sess
                        and _field_exists(
                            Line,
                            "x_session_id",
                        )
                    ):
                        vals_line["x_session_id"] = sess.id

                    if _field_exists(
                        Line,
                        "x_delay_reason_id",
                    ):
                        vals_line[
                            "x_delay_reason_id"
                        ] = reason.id

                    elif _field_exists(
                        Line,
                        "delay_reason_id",
                    ):
                        vals_line[
                            "delay_reason_id"
                        ] = reason.id

                    if _field_exists(
                        Line,
                        "x_minutes",
                    ):
                        vals_line[
                            "x_minutes"
                        ] = delay_minutes

                    elif _field_exists(
                        Line,
                        "x_delay_min",
                    ):
                        vals_line[
                            "x_delay_min"
                        ] = delay_minutes

                    if _field_exists(
                        Line,
                        "x_qty_done",
                    ):
                        vals_line[
                            "x_qty_done"
                        ] = qty_done

                    if _field_exists(
                        Line,
                        "x_name",
                    ):
                        emp_name = (
                            emp.name
                            if (
                                emp
                                and _has(emp, "name")
                            )
                            else ""
                        )

                        vals_line["x_name"] = (
                            "%s - %s"
                            % (
                                reason.display_name,
                                emp_name,
                            )
                        )

                    Line.create(vals_line)

                    return

                except Exception as exc:
                    _safe_log(
                        "WO delay line append failed: %s"
                        % exc,
                        level="warning",
                    )

            if _has(wo, "x_delay_reason_ids"):
                try:
                    wo.write(
                        {
                            "x_delay_reason_ids": [
                                (4, reason.id)
                            ]
                        }
                    )

                    return

                except Exception as exc:
                    _safe_log(
                        "WO delay reason append failed: %s"
                        % exc,
                        level="warning",
                    )


        def _get_wo_current_qty(wo):
            for fname in [
                "qty_done",
                "qty_produced",
                "x_qty_done",
            ]:
                try:
                    if _has(wo, fname):
                        return (
                            float(wo[fname] or 0.0),
                            fname,
                        )
                except Exception:
                    pass

            return 0.0, False


        def _get_wo_target_qty(wo):
            for fname in [
                "qty_production",
                "product_uom_qty",
                "qty_to_produce",
                "x_qty_target",
            ]:
                try:
                    if _has(wo, fname):
                        return (
                            float(wo[fname] or 0.0),
                            fname,
                        )
                except Exception:
                    pass

            return 0.0, False


        # MAX ADDED
        # Dynamic dispatch quantity/state helpers.
        # These mirror the custom module logic:
        # - final WO: write the Odoo production quantity field
        # - intermediate WO: keep the partial count local on qty_produced
        #   so the parent MO quantity is not accidentally advanced.
        def _is_last_workorder_in_routing(wo):
            if not wo:
                return True

            try:
                if not (
                    _has(wo, "production_id")
                    and wo.production_id
                ):
                    return True
            except Exception:
                return True

            try:
                Workorder = env["mrp.workorder"]

                if not _field_exists(
                    Workorder,
                    "blocked_by_workorder_ids",
                ):
                    _safe_log(
                        "DISPATCH_QTY: blocked_by_workorder_ids missing; "
                        "assuming last WO for wo=%s"
                        % wo.id,
                        level="warning",
                    )

                    return True

                next_wo = Workorder.search(
                    [
                        ("production_id", "=", wo.production_id.id),
                        (
                            "blocked_by_workorder_ids",
                            "in",
                            [wo.id],
                        ),
                    ],
                    limit=1,
                )

                return not bool(next_wo)

            except Exception as exc:
                _safe_log(
                    "DISPATCH_QTY: last-WO check failed for wo=%s: %s"
                    % (
                        wo.id if wo else False,
                        exc,
                    ),
                    level="warning",
                )

                return True


        def _get_dispatch_qty_field(wo, is_last_wo):
            dispatch_field_exists = _has(
                wo,
                "x_dispatch_qty_done",
            )

            dispatch_qty = 0.0

            if dispatch_field_exists:
                try:
                    dispatch_qty = float(
                        wo.x_dispatch_qty_done or 0.0
                    )
                except Exception:
                    dispatch_qty = 0.0

            # Once this field has progress, do not let native Odoo quantity
            # fields override it.
            if dispatch_qty > 0.0:
                return dispatch_qty, "x_dispatch_qty_done"

            # Legacy fallback for old WOs.
            current_qty = 0.0
            fallback_field = False

            for fname in [
                "qty_produced",
                "x_qty_done",
                "qty_done",
            ]:
                try:
                    if _has(wo, fname):
                        value = float(wo[fname] or 0.0)

                        if value > current_qty:
                            current_qty = value
                            fallback_field = fname
                except Exception:
                    pass

            # New progress should always be written to the custom field,
            # even if the old quantity was read from a legacy native field.
            qty_field = (
                "x_dispatch_qty_done"
                if dispatch_field_exists
                else fallback_field
            )

            return current_qty, qty_field

        def _get_last_wo_finish_qty_field(wo):
            """
            Field used only when the last WO is actually complete and
            we are about to call button_finish().
            """
            for fname in [
                "qty_producing",
                "qty_done",
                "qty_produced",
                "x_qty_done",
            ]:
                try:
                    if _has(wo, fname):
                        return fname
                except Exception:
                    pass

            return False
    
        def _write_wo_qty_safe(wo, qty_field, qty_value, reason_label):
            if not wo or not qty_field:
                _safe_log(
                    "DISPATCH_QTY: no qty field for %s on wo=%s"
                    % (
                        reason_label,
                        wo.id if wo else False,
                    ),
                    level="warning",
                )

                return False

            try:
                wo.write(
                    {
                        qty_field: qty_value,
                    }
                )

                _safe_log(
                    "DISPATCH_QTY: wrote %s=%s on wo=%s reason=%s"
                    % (
                        qty_field,
                        qty_value,
                        wo.id,
                        reason_label,
                    ),
                    level="info",
                )

                return True

            except Exception as exc:
                _safe_log(
                    "DISPATCH_QTY: write failed field=%s value=%s "
                    "wo=%s reason=%s err=%s"
                    % (
                        qty_field,
                        qty_value,
                        wo.id if wo else False,
                        reason_label,
                        exc,
                    ),
                    level="warning",
                )

                return False


        def _return_partial_wo_to_ready_pool(wo):
            if not wo:
                return False

            pending_ok = False
            ready_ok = False

            try:
                wo.button_pending()
                pending_ok = True

            except Exception as exc:
                _safe_log(
                    "DISPATCH_PARTIAL: button_pending failed wo=%s err=%s"
                    % (
                        wo.id,
                        exc,
                    ),
                    level="warning",
                )

            try:
                if _has(wo, "state"):
                    wo.write(
                        {
                            "state": "ready",
                        }
                    )

                    ready_ok = True

            except Exception as exc:
                _safe_log(
                    "DISPATCH_PARTIAL: force ready failed wo=%s err=%s"
                    % (
                        wo.id,
                        exc,
                    ),
                    level="warning",
                )

            _safe_log(
                "DISPATCH_PARTIAL: returned_to_pool wo=%s "
                "pending_ok=%s ready_ok=%s"
                % (
                    wo.id,
                    pending_ok,
                    ready_ok,
                ),
                level="warning",
            )

            return pending_ok or ready_ok
        # MAX ADDITION ENDED


        def _reconcile_baseline_slots_for_finished_wo(
            wo,
            actual_end,
        ):
            result = {
                "done_count": 0,
                "cancelled_count": 0,
            }

            if not wo or not actual_end:
                return result

            if "x_wo_emp_slot" not in env:
                return result

            Slot = env["x_wo_emp_slot"]

            baseline_slots = Slot.search(
                [
                    ("x_workorder_id", "=", wo.id),
                    ("x_plan_type", "=", "baseline"),
                    (
                        "x_state",
                        "in",
                        ["planned", "in_progress"],
                    ),
                ],
                order="x_date_start asc, id asc",
            )

            done_ids = []
            cancelled_ids = []

            for slot in baseline_slots:
                slot_start = (
                    slot.x_date_start
                    if (
                        _has(slot, "x_date_start")
                        and slot.x_date_start
                    )
                    else False
                )

                if slot_start and slot_start < actual_end:
                    done_ids.append(slot.id)
                else:
                    cancelled_ids.append(slot.id)

            if done_ids:
                Slot.browse(done_ids).with_context(
                    wo_done_reconcile_running=True,
                    no_overlap_check=True,
                    skip_overlap_guard=True,
                    slot_sync_running=True,
                ).write(
                    {
                        "x_state": "done",
                    }
                )

            if cancelled_ids:
                Slot.browse(cancelled_ids).with_context(
                    wo_done_reconcile_running=True,
                    no_overlap_check=True,
                    skip_overlap_guard=True,
                    slot_sync_running=True,
                ).write(
                    {
                        "x_state": "cancelled",
                    }
                )

            result["done_count"] = len(done_ids)
            result["cancelled_count"] = len(
                cancelled_ids
            )

            _safe_log(
                "BASELINE_RECON: wo=%s actual_end=%s "
                "done=%s cancelled=%s"
                % (
                    wo.id,
                    actual_end,
                    result["done_count"],
                    result["cancelled_count"],
                ),
                level="warning",
            )

            return result



        # MAX ADDED - close parent MO when final workorder is fully completed
        def _invalidate_rec(rec):
            if not rec:
                return

            try:
                rec.invalidate_recordset()
                return
            except Exception:
                pass

            try:
                rec.invalidate_cache()
            except Exception:
                pass


        def _get_mo_target_qty(mo):
            if not mo:
                return 0.0

            for fname in [
                "product_qty",
                "qty_production",
                "product_uom_qty",
                "qty_to_produce",
            ]:
                try:
                    if _has(mo, fname):
                        val = float(mo[fname] or 0.0)

                        if val:
                            return val
                except Exception:
                    pass

            return 0.0


        def _mark_parent_mo_done_if_to_close(wo, qty_done=False):
            result = {
                "mo_id": False,
                "mo_name": False,
                "old_state": False,
                "new_state": False,
                "closed": False,
                "skipped_reason": False,
                "button_result": False,
            }

            if not wo:
                result["skipped_reason"] = "missing_wo"
                return result

            mo = False

            try:
                if _has(wo, "production_id") and wo.production_id:
                    mo = wo.production_id.sudo()
            except Exception:
                mo = False

            if not mo:
                result["skipped_reason"] = "missing_production_id"
                return result

            result["mo_id"] = mo.id

            try:
                result["mo_name"] = mo.name if _has(mo, "name") else str(mo.id)
            except Exception:
                result["mo_name"] = str(mo.id)

            _invalidate_rec(mo)

            old_state = False

            try:
                if _has(mo, "state"):
                    old_state = mo.state
            except Exception:
                old_state = False

            result["old_state"] = old_state

            if old_state == "done":
                result["new_state"] = "done"
                result["closed"] = True
                result["skipped_reason"] = "already_done"

                _safe_log(
                    "MO_AUTO_DONE: mo=%s already done"
                    % result["mo_name"],
                    level="warning",
                )

                return result

            # Odoo's Romanian "De Inchis" is usually technical state "to_close".
            # Only force-close when the MO is already ready to close.
            if old_state != "to_close":
                result["skipped_reason"] = "mo_not_to_close"

                _safe_log(
                    "MO_AUTO_DONE: skip mo=%s state=%s reason=%s"
                    % (
                        result["mo_name"],
                        old_state,
                        result["skipped_reason"],
                    ),
                    level="warning",
                )

                return result

            # Extra safety: do not close the MO if some workorder is still open.
            try:
                Workorder = env["mrp.workorder"].sudo()

                unfinished_wo = Workorder.search(
                    [
                        ("production_id", "=", mo.id),
                        ("state", "not in", ["done", "cancel", "cancelled"]),
                    ],
                    limit=1,
                )

                if unfinished_wo:
                    result["skipped_reason"] = "unfinished_workorder"

                    _safe_log(
                        "MO_AUTO_DONE: skip mo=%s unfinished_wo=%s state=%s"
                        % (
                            result["mo_name"],
                            (
                                unfinished_wo.name
                                if _has(unfinished_wo, "name")
                                else unfinished_wo.id
                            ),
                            (
                                unfinished_wo.state
                                if _has(unfinished_wo, "state")
                                else False
                            ),
                        ),
                        level="warning",
                    )

                    return result

            except Exception as exc:
                _safe_log(
                    "MO_AUTO_DONE: unfinished workorder check failed "
                    "mo=%s err=%s"
                    % (
                        result["mo_name"],
                        exc,
                    ),
                    level="warning",
                )

            # Make sure the MO has the full quantity to produce marked as producing.
            # This prevents Odoo from keeping it in to_close because the produced qty
            # is still zero/lower on the production record.
            try:
                target_qty = _get_mo_target_qty(mo)

                qty_to_set = 0.0

                try:
                    qty_to_set = float(qty_done or 0.0)
                except Exception:
                    qty_to_set = 0.0

                if target_qty:
                    qty_to_set = target_qty

                if qty_to_set and _has(mo, "qty_producing"):
                    current_qty_producing = 0.0

                    try:
                        current_qty_producing = float(mo.qty_producing or 0.0)
                    except Exception:
                        current_qty_producing = 0.0

                    if current_qty_producing + EPSILON_QTY < qty_to_set:
                        mo.write(
                            {
                                "qty_producing": qty_to_set,
                            }
                        )

                        _safe_log(
                            "MO_AUTO_DONE: wrote qty_producing=%s on mo=%s"
                            % (
                                qty_to_set,
                                result["mo_name"],
                            ),
                            level="warning",
                        )

            except Exception as exc:
                _safe_log(
                    "MO_AUTO_DONE: qty_producing preparation skipped "
                    "mo=%s err=%s"
                    % (
                        result["mo_name"],
                        exc,
                    ),
                    level="warning",
                )

            # Close the MO.
            try:
                button_res = mo.with_context(
                    skip_backorder=True,
                    skip_immediate=True,
                    no_start_next=True,
                ).button_mark_done()

                if button_res:
                    result["button_result"] = str(button_res)

                    _safe_log(
                        "MO_AUTO_DONE: button_mark_done returned for mo=%s res=%s"
                        % (
                            result["mo_name"],
                            str(button_res),
                        ),
                        level="warning",
                    )

                _invalidate_rec(mo)

                new_state = (
                    mo.state
                    if _has(mo, "state")
                    else False
                )

                result["new_state"] = new_state
                result["closed"] = new_state == "done"

                if not result["closed"] and result["button_result"]:
                    result["skipped_reason"] = "button_returned_wizard_or_action"

                _safe_log(
                    "MO_AUTO_DONE: mo=%s old_state=%s new_state=%s closed=%s"
                    % (
                        result["mo_name"],
                        old_state,
                        new_state,
                        result["closed"],
                    ),
                    level="warning",
                )

            except Exception as exc:
                result["skipped_reason"] = "button_mark_done_failed"

                _safe_log(
                    "MO_AUTO_DONE: button_mark_done failed mo=%s err=%s"
                    % (
                        result["mo_name"],
                        exc,
                    ),
                    level="warning",
                )

            return result
        # MAX ADDITION ENDED


        # -------------------- MAIN --------------------

        _safe_log(
            "TAIL_MARKER: finish_confirm_start",
            level="warning",
        )

        if not records:
            raise UserError(
                "No popup record found."
            )

        popup = records[0]

        sess = (
            popup.x_session_id
            if _has(popup, "x_session_id")
            else False
        )

        emp = (
            popup.x_employee_id
            if _has(popup, "x_employee_id")
            else False
        )

        wo = (
            popup.x_workorder_id
            if _has(popup, "x_workorder_id")
            else False
        )

        # Alte activități: stop directly and return to hub
        is_other_activity = False

        try:
            is_other_activity = bool(
                sess
                and not wo
                and (
                    (
                        _has(sess, "x_activity_type")
                        and sess.x_activity_type == "other"
                    )
                    or (
                        _has(sess, "x_other_operation_id")
                        and sess.x_other_operation_id
                    )
                )
            )
        except Exception:
            is_other_activity = False

        if is_other_activity:
            return env[
                "shopfloor.live.stop.service"
            ].confirm_other_activity(records)

        is_helper_mode = False

        try:
            if (
                popup
                and _has(popup, "x_is_helper_mode")
                and popup.x_is_helper_mode
            ):
                is_helper_mode = True
        except Exception:
            is_helper_mode = False

        if is_helper_mode:
            qty = 0.0

            try:
                popup.write({
                    "x_qty_done": 0.0,
                })
            except Exception:
                pass
        else:
            qty = float(
                popup.x_qty_done or 0.0
            )

        reason = (
            popup.x_delay_reason_id
            if _has(popup, "x_delay_reason_id")
            else False
        )

        planned = (
            float(popup.x_planned_min or 0.0)
            if _has(popup, "x_planned_min")
            else 0.0
        )

        actual = (
            float(popup.x_actual_min or 0.0)
            if _has(popup, "x_actual_min")
            else 0.0
        )

        overrun = (
            float(popup.x_overrun_min or 0.0)
            if _has(popup, "x_overrun_min")
            else 0.0
        )

        _safe_log(
            "TAIL_MARKER: popup_loaded "
            "popup=%s sess=%s emp=%s wo=%s "
            "qty=%s planned=%s actual=%s overrun=%s"
            % (
                popup.id if popup else False,
                sess.id if sess else False,
                emp.id if emp else False,
                wo.id if wo else False,
                qty,
                planned,
                actual,
                overrun,
            ),
            level="warning",
        )

        if not sess:
            raise UserError(
                "Missing session."
            )

        if not emp:
            raise UserError(
                "Missing employee."
            )

        if not wo:
            raise UserError(
                "Missing operation/work order."
            )

        # ------------------------------------------------
        # Validate quantity against the batch released to
        # this exact shopfloor session.
        # ------------------------------------------------
        batch_limit = 0.0

        try:
            if _has(popup, "x_qty_planned"):
                batch_limit = float(
                    popup.x_qty_planned or 0.0
                )
        except Exception:
            batch_limit = 0.0

        if not is_helper_mode and qty < 0.0:
            raise UserError(
                "Cantitatea realizată nu poate fi negativă."
            )

        if (
            not is_helper_mode
            and batch_limit > 0.0
            and qty > batch_limit + EPSILON_QTY
        ):
            raise UserError(
                "Cantitatea realizată depășește cantitatea "
                "disponibilă pentru această operație."
            )

        # MAX ADDED
        # Use the real current DB time for STOP.
        # Do not use popup/write_date as the main stop timestamp because it can be
        # older than the running log start and can create invalid intervals.
        now = False

        try:
            now = env.cr.now()
        except Exception as exc:
            now = False

        if not now:
            now = (
                popup.write_date
                or popup.create_date
                or wo.write_date
                or wo.create_date
            )

        _safe_log(
            "TAIL_MARKER: now=%s"
            % now,
            level="warning",
        )
        # MAX ADDITION ENDED

        # ------------------------------------------------
        # 1) Finalize worker time log
        # ------------------------------------------------

        Log = env["x_wo_time_log"]

        rl = Log.search(
            [
                ("x_employee_id", "=", emp.id),
                ("x_workorder_id", "=", wo.id),
                (
                    "x_state",
                    "in",
                    ["running", "pause"],
                ),
            ],
            order="write_date desc, id desc",
            limit=1,
        )

        if not rl:
            rl = Log.search(
                [
                    ("x_employee_id", "=", emp.id),
                    ("x_workorder_id", "=", wo.id),
                ],
                order="write_date desc, id desc",
                limit=1,
            )

        if not rl:
            raise UserError(
                "No time log found to finish."
            )

        _safe_log(
            "TAIL_MARKER: log_found rl=%s state=%s"
            % (
                rl.id if rl else False,
                (
                    rl.x_state
                    if (
                        _has(rl, "x_state")
                        and rl.x_state
                    )
                    else False
                ),
            ),
            level="warning",
        )

        # MAX ADDED
        # Determine the actual stop interval safely.
        # If a previous STOP step already set x_end_dt and it is valid, keep it.
        # Otherwise use the current DB time.
        start_dt = (
            rl.x_start_dt
            if _has(rl, "x_start_dt")
            else False
        )

        existing_end_dt = (
            rl.x_end_dt
            if (
                _has(rl, "x_end_dt")
                and rl.x_end_dt
            )
            else False
        )

        end_dt = False

        if existing_end_dt and (
            not start_dt
            or existing_end_dt > start_dt
        ):
            end_dt = existing_end_dt
        else:
            end_dt = now

        # Guard against zero/negative intervals.
        if start_dt and end_dt and end_dt <= start_dt:
            _safe_log(
                "TAIL_MARKER: invalid log interval detected "
                "start=%s end=%s -> forcing minimum interval"
                % (
                    start_dt,
                    end_dt,
                ),
                level="warning",
            )

            end_dt = start_dt + datetime.timedelta(seconds=1)

        minutes_seg = 0.0

        if start_dt and end_dt and end_dt > start_dt:
            delta = end_dt - start_dt

            minutes_seg = (
                delta.days * 86400
                + delta.seconds
                + delta.microseconds / 1000000.0
            ) / 60.0

        else:
            if _has(rl, "x_duration_min"):
                minutes_seg = float(
                    rl.x_duration_min or 0.0
                )

        if minutes_seg < 0.0:
            minutes_seg = 0.0
        # MAX ADDITION ENDED

        vals_log = {}

        if _has(rl, "x_end_dt"):
            vals_log["x_end_dt"] = end_dt

        if _has(rl, "x_duration_min"):
            vals_log[
                "x_duration_min"
            ] = minutes_seg

        if _has(rl, "x_state"):
            vals_log["x_state"] = "done"

        if _has(rl, "x_qty_done"):
            vals_log["x_qty_done"] = qty

        if (
            reason
            and _has(rl, "x_delay_reason_id")
        ):
            vals_log[
                "x_delay_reason_id"
            ] = reason.id

        _safe_log(
            "TAIL_MARKER: writing_log vals=%s"
            % str(vals_log),
            level="warning",
        )

        rl.write(vals_log)

        _safe_log(
            "TAIL_MARKER: log_written "
            "rl=%s start=%s end=%s minutes=%s"
            % (
                rl.id,
                start_dt,
                end_dt,
                minutes_seg,
            ),
            level="warning",
        )

        # MAX ADDED - Gantt completion status before slot reconciliation
        # Rule:
        # A slot is incomplete if THIS interval produced less than the full planned WO quantity.
        # Example: 60/120 then 60/120 => both slots are incomplete/orange.
        is_incomplete_for_gantt = False
        gantt_target_qty = 0.0
        gantt_target_field = False

        try:
            if is_helper_mode:
                is_incomplete_for_gantt = False
            else:
                gantt_target_qty, gantt_target_field = _get_wo_target_qty(wo)
                gantt_slot_qty = float(qty or 0.0)

                if (
                    gantt_target_qty
                    and gantt_slot_qty + EPSILON_QTY < gantt_target_qty
                ):
                    is_incomplete_for_gantt = True

                _safe_log(
                    "GANTT_COLOR_QTY: slot_qty=%s target=%s target_field=%s incomplete=%s"
                    % (
                        gantt_slot_qty,
                        gantt_target_qty,
                        gantt_target_field,
                        is_incomplete_for_gantt,
                    ),
                    level="warning",
                )

        except Exception as exc:
            is_incomplete_for_gantt = False

            _safe_log(
                "GANTT_COLOR_QTY: failed: %s" % exc,
                level="warning",
            )
        # MAX ADDITION ENDED

        # ------------------------------------------------
        # 1b) Reconcile only this employee's dynamic slots
        # ------------------------------------------------

        recon_info = False

        try:
            recon_info = _reconcile_employee_dynamic_slots(
                wo,
                emp,
                rl,
                sess,
                planned_min=planned,
                planned_qty=gantt_target_qty,
                is_incomplete_for_gantt=is_incomplete_for_gantt,
                interval_qty_done=qty,
            )

            _safe_log(
                "TAIL_MARKER: after_recon recon_info=%s"
                % str(recon_info),
                level="warning",
            )

        except Exception as exc:
            _safe_log(
                "SESS_RECON FAILED: %s"
                % exc,
                level="warning",
            )

        # ------------------------------------------------
        # 1c) Live dispatch flow: do NOT shift future slots
        # ------------------------------------------------

        # MAX ADDED
        # The old flow had planner-generated future dynamic slots and tried to
        # repack them after each STOP. In the new live-dispatch flow, dynamic
        # slots are actual worked intervals, not a preplanned queue.
        # So there is nothing to shift, delete, or replan here.
        tail_res = {
            "moved_count": 0,
            "deleted_count": 0,
            "needs_planner": False,
            "tail_end": (
                recon_info.get("actual_end")
                if recon_info
                else False
            ),
            "future_count": 0,
            "horizon_end": False,
        }

        _safe_log(
            "SHIFT_TAIL: skipped for live dispatch flow tail_res=%s"
            % str(tail_res),
            level="warning",
        )
        # MAX ADDITION ENDED

        # ------------------------------------------------
        # 1d) If the main employee stops, also stop helpers
        # ------------------------------------------------

        # MAX ADDED
        helper_auto_stop_res = {
            "helper_session_count": 0,
            "helper_log_count": 0,
            "helper_slot_count": 0,
        }

        if not is_helper_mode:
            try:
                helper_auto_stop_res = _auto_stop_helpers_for_main_stop(
                    wo,
                    emp,
                    sess,
                    end_dt,
                )

            except Exception as exc:
                _safe_log(
                    "HELPER_AUTO_STOP FAILED: %s"
                    % exc,
                    level="warning",
                )

        _safe_log(
            "HELPER_AUTO_STOP: after_main_stop result=%s"
            % str(helper_auto_stop_res),
            level="warning",
        )
        # MAX ADDITION ENDED

        # ------------------------------------------------
        # 2) Close any open productivity lines for this WO
        # ------------------------------------------------

        try:
            Prod = env[
                "mrp.workcenter.productivity"
            ]

            open_prod = Prod.search(
                [
                    ("workorder_id", "=", wo.id),
                    ("date_end", "=", False),
                ]
            )

            _safe_log(
                "TAIL_MARKER: open_productivity_count=%s wo=%s"
                % (
                    len(open_prod),
                    wo.id,
                ),
                level="info",
            )

            for productivity in open_prod:
                try:
                    productivity.write(
                        {
                            "date_end": now,
                        }
                    )
                except Exception:
                    pass

        except Exception as exc:
            _safe_log(
                "Productivity close skipped: %s"
                % exc,
                level="warning",
            )

        # ------------------------------------------------
        # 3) Calculate dispatch quantity target/current
        # ------------------------------------------------

        # MAX ADDED
        # Do not use the generic _get_wo_current_qty() here, because for
        # dynamic dispatch an intermediate WO must accumulate qty_produced,
        # while the last WO may need qty_producing/qty_done.
        is_last_wo = _is_last_workorder_in_routing(wo)

        current_qty, qty_field = (
            _get_dispatch_qty_field(
                wo,
                is_last_wo,
            )
        )

        target_qty, target_field = (
            _get_wo_target_qty(wo)
        )

        new_total_qty = current_qty + qty

        if target_qty > 0.0:
            new_total_qty = min(
                new_total_qty,
                target_qty,
            )

        _safe_log(
            "DISPATCH_QTY: qty_calc wo=%s is_last=%s "
            "current=%s field=%s qty_added=%s new_total=%s "
            "target=%s target_field=%s"
            % (
                wo.id if wo else False,
                is_last_wo,
                current_qty,
                qty_field,
                qty,
                new_total_qty,
                target_qty,
                target_field,
            ),
            level="warning",
        )
        # MAX ADDITION ENDED

        # ------------------------------------------------
        # 4) Append delay reason on WO
        # ------------------------------------------------

        delay_minutes = (
            overrun
            if overrun > 0.0
            else 0.0
        )

        _safe_log(
            "TAIL_MARKER: delay_check "
            "reason=%s delay_minutes=%s"
            % (
                reason.id if reason else False,
                delay_minutes,
            ),
            level="info",
        )

        if reason and delay_minutes > 0.0:
            _append_wo_delay(
                wo,
                emp,
                sess,
                reason,
                delay_minutes,
                qty,
            )

        # ------------------------------------------------
        # 5) Safe WO finish / partial-return rule
        # ------------------------------------------------

        # Only another genuinely open log should prevent final completion.
        # The current log `rl` was already closed above.
        running_any = Log.search(
            [
                ("x_workorder_id", "=", wo.id),
                ("id", "!=", rl.id),
                ("x_state", "in", ["running", "pause"]),
                ("x_end_dt", "=", False),
            ],
            order="x_start_dt desc, id desc",
            limit=1,
        )

        can_finish_wo = False

        if not running_any:
            if target_qty > 0.0:
                if (
                    new_total_qty + EPSILON_QTY
                    >= target_qty
                ):
                    can_finish_wo = True

        _safe_log(
            "TAIL_MARKER: finish_rule "
            "running_any=%s can_finish_wo=%s "
            "is_last_wo=%s new_total_qty=%s target_qty=%s"
            % (
                (
                    running_any.id
                    if running_any
                    else False
                ),
                can_finish_wo,
                is_last_wo,
                new_total_qty,
                target_qty,
            ),
            level="info",
        )

        # MAX ADDED - helper stop must not finish or partially return the WO
        if is_helper_mode:
            can_finish_wo = False

            _safe_log(
                "HELPER_STOP: skipping WO finish/partial quantity logic "
                "wo=%s qty=%s"
                % (
                    wo.id if wo else False,
                    qty,
                ),
                level="warning",
            )
        # MAX ADDITION ENDED

        partial_returned_to_pool = False

        if can_finish_wo:
            try:
                # Keep the custom cumulative source of truth updated for every WO.
                _write_wo_qty_safe(
                    wo,
                    qty_field,
                    new_total_qty,
                    "dispatch_total_before_finish",
                )

                # Synchronize Odoo's native WO quantity before finishing.
                # Odoo uses qty_produced for qty_remaining and other native displays.
                if _has(wo, "qty_produced"):
                    _write_wo_qty_safe(
                        wo,
                        "qty_produced",
                        new_total_qty,
                        "native_qty_before_finish",
                    )

                # Only the final WO should update the MO's currently produced quantity.
                if is_last_wo:
                    finish_qty_field = (
                        _get_last_wo_finish_qty_field(wo)
                        or qty_field
                    )

                    if finish_qty_field != "qty_produced":
                        _write_wo_qty_safe(
                            wo,
                            finish_qty_field,
                            new_total_qty,
                            "finish_last_before_button",
                        )

                finish_result = wo.button_finish()

                _safe_log(
                    "DISPATCH_FINISH: button_finish returned "
                    "wo=%s result=%s"
                    % (
                        wo.id,
                        str(finish_result),
                    ),
                    level="warning",
                )

                _invalidate_rec(wo)

                wo_state = (
                    wo.state
                    if _has(wo, "state")
                    else False
                )

                # button_finish should always set state=done. Use button_done only
                # as a fallback if an installed override returned without doing so.
                if wo_state != "done":
                    _safe_log(
                        "DISPATCH_FINISH: button_finish returned but WO is not done "
                        "wo=%s state=%s; trying button_done fallback"
                        % (
                            wo.id,
                            wo_state,
                        ),
                        level="warning",
                    )

                    wo.button_done()
                    _invalidate_rec(wo)

                    wo_state = (
                        wo.state
                        if _has(wo, "state")
                        else False
                    )

                if wo_state != "done":
                    raise UserError(
                        "Operația nu a putut fi marcată ca finalizată. "
                        "Starea curentă este: %s."
                        % (wo_state or "necunoscută")
                    )

                # Reassert the custom cumulative field after native Odoo methods.
                _write_wo_qty_safe(
                    wo,
                    qty_field,
                    new_total_qty,
                    "dispatch_total_after_finish",
                )

                # KEEP the existing code below this point:
                # - _mark_parent_mo_done_if_to_close(...)
                # - baseline reconciliation
                # - session close/reset

                # MAX ADDED - if final WO moved the MO to "to_close", close the MO too
                mo_done_res = False

                if is_last_wo:
                    mo_done_res = _mark_parent_mo_done_if_to_close(
                        wo,
                        qty_done=new_total_qty,
                    )

                    _safe_log(
                        "MO_AUTO_DONE: after final WO finish result=%s"
                        % str(mo_done_res),
                        level="warning",
                    )
                # MAX ADDITION ENDED

                # MAX ADDITION ENDED

                try:
                    _invalidate_rec(wo)
                except Exception:
                    pass

                wo_state = (
                    wo.state
                    if _has(wo, "state")
                    else False
                )

                _safe_log(
                    "TAIL_MARKER: wo_finished "
                    "wo=%s state=%s"
                    % (
                        wo.id,
                        wo_state,
                    ),
                    level="warning",
                )

                if (
                    not _has(wo, "state")
                    or wo_state == "done"
                ):
                    baseline_res = (
                        _reconcile_baseline_slots_for_finished_wo(
                            wo,
                            end_dt,
                        )
                    )

                    _safe_log(
                        "TAIL_MARKER: baseline_reconciled "
                        "wo=%s result=%s"
                        % (
                            wo.id,
                            str(baseline_res),
                        ),
                        level="warning",
                    )

            except UserError:
                raise

            except Exception as exc:
                _safe_log(
                    "WO FINISH FAILED: wo=%s error=%s"
                    % (
                        wo.id if wo else False,
                        exc,
                    ),
                    level="error",
                )

                raise UserError(
                    "Operația nu a putut fi finalizată. "
                    "Modificările au fost anulate; verificați jurnalul serverului."
                )

        elif not is_helper_mode:
            # MAX ADDED
            # Partial completion:
            # save accumulated qty and return the operation to the dynamic
            # dispatch ready pool, as the module method does.
            partial_qty_written = _write_wo_qty_safe(
                wo,
                qty_field,
                new_total_qty,
                "partial_before_return_to_pool",
            )

            if not partial_qty_written:
                raise UserError(
                    "Cantitatea operației nu a putut fi salvată."
                )

            # For partial last WOs, do not leave qty_producing populated.
            # It is an Odoo "currently producing / final production" field,
            # not our live-dispatch accumulated progress field.
            if is_last_wo and _has(wo, "qty_producing"):
                _write_wo_qty_safe(
                    wo,
                    "qty_producing",
                    0.0,
                    "partial_clear_qty_producing",
                )

            if running_any:
                _safe_log(
                    "DISPATCH_PARTIAL: not forcing ready because another "
                    "running log exists for wo=%s running_log=%s"
                    % (
                        wo.id,
                        running_any.id,
                    ),
                    level="warning",
                )

            else:
                partial_returned_to_pool = (
                    _return_partial_wo_to_ready_pool(
                        wo,
                    )
                )
            # MAX ADDITION ENDED

        else:
            _safe_log(
                "HELPER_STOP: no WO quantity/state update performed.",
                level="warning",
            )

        # ------------------------------------------------
        # 5b) Settle component reservation
        # ------------------------------------------------
        if not is_helper_mode:
            try:
                component_flow_result = env[
                    "shopfloor.component.flow.service"
                ].settle_session(
                    sess=sess,
                    wo=wo,
                    parent_qty_done=qty,
                )

                _safe_log(
                    "COMPONENT_FLOW: settled session=%s "
                    "wo=%s qty=%s result=%s"
                    % (
                        sess.id,
                        wo.id,
                        qty,
                        str(component_flow_result),
                    ),
                    level="warning",
                )

            except UserError:
                raise

            except Exception as exc:
                _safe_log(
                    "COMPONENT_FLOW: settlement failed "
                    "session=%s wo=%s error=%s"
                    % (
                        sess.id,
                        wo.id,
                        exc,
                    ),
                    level="error",
                )

                raise UserError(
                    "Rezervarea componentelor nu a putut fi "
                    "actualizată. Operația nu a fost înregistrată."
                )

        # ------------------------------------------------
        # 5c) Post terminal-WO progress into Odoo stock
        # ------------------------------------------------
        stock_post_result = {
            "is_terminal": False,
            "posted": False,
        }

        if not is_helper_mode:
            try:
                stock_post_result = env[
                    "shopfloor.stock.posting.service"
                ].post_terminal_progress(
                    wo
                )

                _safe_log(
                    "SHOPFLOOR_STOCK: terminal posting "
                    "wo=%s result=%s"
                    % (
                        wo.id,
                        str(stock_post_result),
                    ),
                    level="warning",
                )

            except UserError:
                raise

            except Exception as exc:
                _safe_log(
                    "SHOPFLOOR_STOCK: posting failed "
                    "wo=%s error=%s"
                    % (
                        wo.id if wo else False,
                        exc,
                    ),
                    level="error",
                )

                raise UserError(
                    "Stocul aferent operației nu a putut fi "
                    "actualizat. Modificările au fost anulate."
                )


        # ------------------------------------------------
        # 5d) Refresh parent flow only after a terminal WO
        # ------------------------------------------------
        if (
            not is_helper_mode
            and stock_post_result.get(
                "is_terminal"
            )
        ):
            try:
                child_mo = (
                    wo.production_id
                    if (
                        wo
                        and _has(
                            wo,
                            "production_id",
                        )
                    )
                    else False
                )

                synced_parents = env[
                    "shopfloor.component.flow.service"
                ].sync_parents_for_child_mo(
                    child_mo
                ) if child_mo else env[
                    "mrp.production"
                ].browse([])

                _safe_log(
                    "COMPONENT_FLOW: refreshed after "
                    "terminal stock posting "
                    "child_mo=%s parents=%s"
                    % (
                        (
                            child_mo.id
                            if child_mo
                            else False
                        ),
                        synced_parents.ids,
                    ),
                    level="warning",
                )

            except UserError:
                raise

            except Exception as exc:
                _safe_log(
                    "COMPONENT_FLOW: terminal refresh failed "
                    "child_mo=%s error=%s"
                    % (
                        (
                            wo.production_id.id
                            if (
                                wo
                                and wo.production_id
                            )
                            else False
                        ),
                        exc,
                    ),
                    level="error",
                )

                raise UserError(
                    "Disponibilitatea componentelor nu a "
                    "putut fi actualizată."
                )

        # ------------------------------------------------
        # 6) Close/reset session
        # ------------------------------------------------

        vals_s = {}

        # MAX ADDED - helper stop resets helper session without closing the helped WO
        if is_helper_mode:
            if _has(sess, "x_workorder_id"):
                vals_s["x_workorder_id"] = False

            if _has(sess, "x_operation_template_id"):
                vals_s["x_operation_template_id"] = False

            if _has(sess, "x_is_helper_mode"):
                vals_s["x_is_helper_mode"] = False

            if _has(sess, "x_helped_employee_id"):
                vals_s["x_helped_employee_id"] = False

            if _has(sess, "x_ui_state"):
                vals_s["x_ui_state"] = "not_started"

            for fname in [
                "x_operation_template_text",
                "x_wc_text",
                "x_product_mo_text",
            ]:
                if _has(sess, fname):
                    vals_s[fname] = False

            for fname in [
                "x_qty_planned",
                "x_expected_duration_min",
                "x_actual_duration_min",
            ]:
                if _has(sess, fname):
                    vals_s[fname] = 0.0

        elif can_finish_wo:
        # MAX ADDITION ENDED
            if _has(sess, "x_state"):
                vals_s["x_state"] = "closed"

            if _has(sess, "x_ui_state"):
                vals_s["x_ui_state"] = "done"

        else:
            # MAX ADDED
            # For partial completion, keep the session usable and clear only
            # the assigned operation context, matching action_stop_dynamic_workorder().
            if _has(sess, "x_workorder_id"):
                vals_s["x_workorder_id"] = False

            if _has(sess, "x_ui_state"):
                vals_s["x_ui_state"] = "not_started"

            for fname in [
                "x_employee_text",
                "x_operation_template_text",
                "x_wc_text",
                "x_product_mo_text",
            ]:
                if _has(sess, fname):
                    vals_s[fname] = False

            for fname in [
                "x_qty_planned",
                "x_expected_duration_min",
            ]:
                if _has(sess, fname):
                    vals_s[fname] = 0.0
            # MAX ADDITION ENDED

        # MAX ADDED
        # Clear active live slot pointer after STOP closes the slot.
        if _has(sess, "x_current_slot_id"):
            vals_s["x_current_slot_id"] = False
        # MAX ADDITION ENDED

        if vals_s:
            _safe_log(
                "TAIL_MARKER: writing_session vals=%s "
                "can_finish_wo=%s partial_returned_to_pool=%s"
                % (
                    str(vals_s),
                    can_finish_wo,
                    partial_returned_to_pool,
                ),
                level="info",
            )

            sess.write(vals_s)

        # ------------------------------------------------
        # 7) Queue planner only if this employee has no
        #    more slots today and still has working time left
        # ------------------------------------------------

        _safe_log(
            "TAIL_MARKER: before_queue "
            "tail_res=%s skip_planner=%s"
            % (
                str(tail_res),
                SKIP_PLANNER,
            ),
            level="warning",
        )

        if (
            tail_res
            and tail_res.get("needs_planner")
            and not SKIP_PLANNER
        ):
            try:
                _safe_log(
                    "TAIL_MARKER: queue_condition_met "
                    "emp=%s wo=%s trigger=%s"
                    % (
                        emp.id if emp else False,
                        wo.id if wo else False,
                        TAIL_TRIGGER_TYPE,
                    ),
                    level="warning",
                )

                _enqueue_planner_job(
                    now,
                    TAIL_TRIGGER_TYPE,
                    sess,
                    emp,
                    wo,
                )

            except Exception as exc:
                _safe_log(
                    "QUEUE CREATE FAILED: %s"
                    % exc,
                    level="warning",
                )

        else:
            _safe_log(
                "TAIL_MARKER: queue_not_created "
                "tail_res=%s"
                % str(tail_res),
                level="warning",
            )

        # ------------------------------------------------
        # 8) Mark popup done
        # ------------------------------------------------

        popup_vals = {}

        if _has(popup, "x_step"):
            popup_vals["x_step"] = "done"

        if _has(popup, "x_message"):
            popup_vals["x_message"] = """
                <div style="text-align:center; padding: 24px 12px;">
                    <div style="font-size: 34px; font-weight: 700;
                                margin-bottom: 12px; color:#15803d;">
                        Operație înregistrată
                    </div>
                    <div style="font-size: 22px; color: #4b5563;">
                        Cantitatea a fost salvată.
                    </div>
                </div>
            """

        if popup_vals:
            popup.write(popup_vals)

        _safe_log(
            "TAIL_MARKER: popup_done popup=%s"
            % popup.id,
            level="warning",
        )

        # ------------------------------------------------
        # 9) Return to hub
        # ------------------------------------------------

        hub = False

        if (
            _has(popup, "x_hub_id")
            and popup.x_hub_id
        ):
            hub = popup.x_hub_id

        if not hub:
            try:
                Hub = env["x_worker_hub"]

                terminal_name = (
                    sess.x_terminal_name
                    if _has(sess, "x_terminal_name")
                    else False
                )

                if terminal_name:
                    hub = Hub.search(
                        [
                            (
                                "x_device_name",
                                "=",
                                terminal_name,
                            )
                        ],
                        limit=1,
                    )

            except Exception:
                hub = False

        _safe_log(
            "TAIL_MARKER: return_hub hub=%s"
            % (
                hub.id
                if hub
                else False
            ),
            level="warning",
        )

        # ------------------------------------------------
        # 9) Build return-to-hub action
        # ------------------------------------------------

        if not hub:
            next_action = {
                "type": "ir.actions.act_window_close",
            }

        else:
            next_action = {
                "type": "ir.actions.act_window",
                "name": "Worker Hub",
                "res_model": "x_worker_hub",
                "views": [[False, "form"]],
                "res_id": hub.id,
                "target": "current",
            }


        # ------------------------------------------------
        # 10) Build QZ print action
        # ------------------------------------------------

        # MAX ADDED - helper stop should not print product label
        print_action = False

        if not is_helper_mode:
            print_action = env[
                "qz.printer.automation"
            ].action_qz_print(
                report_xml_id=1389,
                res_ids=records.ids,
                printer_name="ZDesigner ZD230-203dpi ZPL",
            )
        # MAX ADDITION ENDED

        _safe_log(
            "QZ_PRINT_BRIDGE: print_action=%s next_action=%s"
            % (
                str(print_action),
                str(next_action),
            ),
            level="warning",
        )


        # ------------------------------------------------
        # 11) Print, then open Worker Hub
        # ------------------------------------------------

        # if print_action:
        #     action = {
        #         "type": "ir.actions.client",
        #         "tag": "worker_hub_bridge.qz_print_then_open_hub",
        #         "target": "current",
        #         "params": {
        #             "print_action": print_action,
        #             "next_action": next_action,
        #         },
        #     }

        # else:
        action = next_action


        return action
