import logging
from datetime import datetime, time, timedelta

import pytz

from markupsafe import Markup, escape

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class RunningOperationsReport(models.Model):
    _inherit = "ir.cron"

    @api.model
    def _cron_send_running_operations_email(self, morning_shift_only=False):
        """
        Send an email containing all currently running activities:
        - production
        - helper
        - other activities
        """

        Slot = self.env["x_wo_emp_slot"].sudo()
        now_utc = fields.Datetime.now()

        _logger.warning(
            "[RUNNING_OPERATIONS_REPORT] Method started at %s",
            now_utc,
        )

        running_slots = Slot.search(
            [
                ("x_gantt_status", "=", "running"),
            ],
            order="x_date_start asc",
        )

        _logger.warning(
            "[RUNNING_OPERATIONS_REPORT] Running slots found: %s | IDs: %s",
            len(running_slots),
            running_slots.ids,
        )

        if not running_slots:
            _logger.warning(
                "[RUNNING_OPERATIONS_REPORT] No running slots found. Email skipped."
            )
            return True

        admin_user = Slot.env.ref(
            "base.user_admin",
            raise_if_not_found=False,
        )

        config = Slot.env["ir.config_parameter"].sudo()

        # This system parameter can contain one address or multiple
        # comma-separated addresses.
        email_to = config.get_param(
            "shopfloor_live_dispatch.running_report_email"
        )

        _logger.warning(
            "[RUNNING_OPERATIONS_REPORT] Recipient: %s",
            email_to,
        )

        if not email_to and admin_user:
            email_to = admin_user.partner_id.email

        if not email_to:
            return True

        timezone = (
            (admin_user and admin_user.tz)
            or Slot.env.company.partner_id.tz
            or "Europe/Bucharest"
        )

        local_environment = Slot.with_context(tz=timezone)
        now_local = fields.Datetime.context_timestamp(
            local_environment,
            now_utc,
        )

        # ------------------------------------------------------------
        # 15:30 REPORT:
        # Keep only employees planned on the morning shift.
        #
        # Morning shift is identified by having a planning.slot
        # ending today at 15:30 local time.
        # ------------------------------------------------------------
        if morning_shift_only:
            PlanningSlot = Slot.env["planning.slot"].sudo()

            local_tz = pytz.timezone(timezone)
            today_local = now_local.date()

            # Build today's local boundaries and convert them to UTC,
            # because planning.slot datetimes are stored in UTC.
            local_day_start = local_tz.localize(
                datetime.combine(
                    today_local,
                    time.min,
                )
            )

            local_day_end = local_day_start + timedelta(days=1)

            day_start_utc = (
                local_day_start
                .astimezone(pytz.UTC)
                .replace(tzinfo=None)
            )

            day_end_utc = (
                local_day_end
                .astimezone(pytz.UTC)
                .replace(tzinfo=None)
            )

            planning_domain = [
                ("employee_id", "!=", False),
                ("start_datetime", "<", day_end_utc),
                ("end_datetime", ">", day_start_utc),
            ]

            # Do not consider absence slots.
            if "is_absent" in PlanningSlot._fields:
                planning_domain.append(
                    ("is_absent", "=", False)
                )

            today_planning_slots = PlanningSlot.search(
                planning_domain
            )

            morning_employee_ids = set()

            planning_environment = PlanningSlot.with_context(
                tz=timezone
            )

            for planning_slot in today_planning_slots:
                if not planning_slot.end_datetime:
                    continue

                end_local = fields.Datetime.context_timestamp(
                    planning_environment,
                    planning_slot.end_datetime,
                )

                # Morning shift in your Planning:
                # 07:00 - 11:00
                # 11:30 - 15:30
                #
                # We only need to identify the slot ending at 15:30.
                if (
                    end_local.date() == today_local
                    and end_local.hour == 15
                    and end_local.minute == 30
                ):
                    morning_employee_ids.add(
                        planning_slot.employee_id.id
                    )

            _logger.warning(
                "[RUNNING_OPERATIONS_REPORT] Morning shift employees: %s",
                sorted(morning_employee_ids),
            )

            # Keep only running activities belonging to employees
            # scheduled on the morning shift.
            running_slots = running_slots.filtered(
                lambda slot:
                    slot.x_employee_id
                    and slot.x_employee_id.id
                    in morning_employee_ids
            )

            _logger.warning(
                "[RUNNING_OPERATIONS_REPORT] "
                "Running slots after morning shift filter: %s | IDs: %s",
                len(running_slots),
                running_slots.ids,
            )

            if not running_slots:
                _logger.warning(
                    "[RUNNING_OPERATIONS_REPORT] "
                    "No running activities for morning-shift employees. "
                    "Email skipped."
                )
                return True

        activity_labels = {
            "production": "Producție",
            "helper": "Ajutor",
            "other": "Alte activități",
        }

        def get_field(record, field_name):
            if field_name not in record._fields:
                return False
            return record[field_name]

        def get_text(record, *field_names):
            for field_name in field_names:
                value = get_field(record, field_name)

                if not value:
                    continue

                if hasattr(value, "display_name"):
                    return value.display_name

                return str(value)

            return ""

        rows = []

        for slot in running_slots:
            activity_type = get_text(slot, "x_activity_type")

            # Fallback for older slots which may not have x_activity_type.
            if not activity_type:
                if get_field(slot, "x_is_helper"):
                    activity_type = "helper"
                elif get_field(slot, "x_is_other_operation_interval"):
                    activity_type = "other"
                else:
                    activity_type = "production"

            activity_label = activity_labels.get(
                activity_type,
                activity_type or "Producție",
            )

            employee = get_text(
                slot,
                "x_employee_id",
                "x_employee_text",
            )

            operation = get_text(
                slot,
                "x_operation_template_id",
                "x_other_operation_id",
                "x_workorder_id",
                "x_operation_text",
            )

            workcenter = get_text(
                slot,
                "x_workcenter_id",
                "x_wc_text",
            )

            production_order = get_text(
                slot,
                "x_mo_id",
                "x_mo_number",
            )

            product = get_text(
                slot,
                "x_product_id",
                "x_product_text",
            )

            # Fallback through the work order.
            workorder = get_field(slot, "x_workorder_id")

            if workorder:
                if not operation:
                    operation = workorder.name or ""

                if not workcenter and workorder.workcenter_id:
                    workcenter = workorder.workcenter_id.display_name

                if workorder.production_id:
                    production = workorder.production_id

                    if not production_order:
                        production_order = production.name or ""

                    if not product and production.product_id:
                        product = production.product_id.display_name

            start_utc = slot.x_date_start

            if start_utc:
                start_local = fields.Datetime.context_timestamp(
                    local_environment,
                    start_utc,
                )

                start_text = start_local.strftime("%d.%m.%Y %H:%M")

                duration_minutes = max(
                    0,
                    int((now_utc - start_utc).total_seconds() / 60),
                )
            else:
                start_text = "-"
                duration_minutes = 0

            hours = duration_minutes // 60
            minutes = duration_minutes % 60

            if hours:
                duration_text = f"{hours} h {minutes} min"
            else:
                duration_text = f"{minutes} min"

            rows.append(
                Markup(
                    """
                    <tr>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                    </tr>
                    """
                ).format(
                    escape(employee or "-"),
                    escape(activity_label or "-"),
                    escape(operation or "-"),
                    escape(workcenter or "-"),
                    escape(product or "-"),
                    escape(production_order or "-"),
                    escape(start_text),
                    escape(duration_text),
                )
            )

        rows_html = Markup("").join(rows)

        body_html = Markup(
            """
            <div style="font-family:Arial, sans-serif;">
                <h2>Activități aflate în desfășurare</h2>

                <p>
                    Raport generat la <strong>{}</strong>.
                </p>

                <p>
                    Număr activități în desfășurare:
                    <strong>{}</strong>
                </p>

                <table style="
                    width:100%;
                    border-collapse:collapse;
                    font-size:14px;
                ">
                    <thead>
                        <tr style="background:#f3f4f6;">
                            <th style="padding:8px; border:1px solid #d1d5db;">
                                Angajat
                            </th>
                            <th style="padding:8px; border:1px solid #d1d5db;">
                                Tip activitate
                            </th>
                            <th style="padding:8px; border:1px solid #d1d5db;">
                                Operațiune
                            </th>
                            <th style="padding:8px; border:1px solid #d1d5db;">
                                Mașină
                            </th>
                            <th style="padding:8px; border:1px solid #d1d5db;">
                                Produs
                            </th>
                            <th style="padding:8px; border:1px solid #d1d5db;">
                                Nr. comandă
                            </th>
                            <th style="padding:8px; border:1px solid #d1d5db;">
                                Început
                            </th>
                            <th style="padding:8px; border:1px solid #d1d5db;">
                                Durată curentă
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {}
                    </tbody>
                </table>
            </div>
            """
        ).format(
            escape(now_local.strftime("%d.%m.%Y %H:%M")),
            len(running_slots),
            rows_html,
        )

        # sender = (
        #     Slot.env.company.partner_id.email_formatted
        #     or (
        #         admin_user
        #         and admin_user.partner_id.email_formatted
        #     )
        #     or email_to.split(",")[0].strip()
        # )

        mail_domain = (
            Slot.env["ir.config_parameter"]
            .sudo()
            .get_param(
                "mail.catchall.domain",
                "360design-telesoft.odoo.com",
            )
            .strip()
        )

        sender = '"%s" <notifications@%s>' % (
            Slot.env.company.name or "TELESOFT SRL",
            mail_domain,
        )

        mail = Slot.env["mail.mail"].sudo().create(
            {
                "subject": (
                    "Operațiuni în desfășurare – "
                    + now_local.strftime("%d.%m.%Y %H:%M")
                ),
                "email_from": sender,
                "email_to": email_to,
                "body_html": body_html,
                "auto_delete": False,
            }
        )

        _logger.warning(
            "[RUNNING_OPERATIONS_REPORT] Creating email ID %s from %s to %s",
            mail.id,
            sender,
            email_to,
        )

        mail.send(raise_exception=True)

        _logger.warning(
            "[RUNNING_OPERATIONS_REPORT] Email send completed."
        )

        return True
