from odoo import _, api, fields, models
from odoo.exceptions import UserError


class ShopfloorReportingCorrectionWizard(models.TransientModel):
    _name = "shopfloor.reporting.correction.wizard"
    _description = "Corectare raportare cantitate interval"

    slot_id = fields.Integer(string="ID interval", required=True, readonly=True)
    slot_name = fields.Char(string="Interval", readonly=True)
    employee_name = fields.Char(string="Angajat", readonly=True)
    production_name = fields.Char(string="Comandă de producție", readonly=True)
    workorder_name = fields.Char(string="Comandă de lucru", readonly=True)
    operation_name = fields.Char(string="Operație", readonly=True)

    target_qty = fields.Float(string="Cantitate operație", readonly=True)
    old_interval_qty = fields.Float(string="Raportat în interval", readonly=True)
    corrected_interval_qty = fields.Float(
        string="Cantitate corectă în interval",
        required=True,
        help=(
            "Introduceți cantitatea realizată efectiv în acest interval. Corecția "
            "poate reduce doar o supra-raportare deja înregistrată."
        ),
    )
    current_workorder_done = fields.Float(
        string="Total raportat operație",
        readonly=True,
    )
    corrected_workorder_done = fields.Float(
        string="Total operație după corecție",
        readonly=True,
    )
    downstream_summary = fields.Text(
        string="Impact operații următoare",
        readonly=True,
    )
    bonus_summary = fields.Text(
        string="Impact bonusare",
        readonly=True,
    )
    correction_reason = fields.Text(
        string="Motiv corecție",
        required=True,
        help="Motivul rămâne în jurnalul serverului împreună cu valorile înainte/după.",
    )

    def _service(self):
        return self.env["shopfloor.reporting.correction.service"]

    def _fill_from_preview(self, preview, keep_corrected=False):
        vals = {
            "slot_name": preview.get("slot_name"),
            "employee_name": preview.get("employee_name"),
            "production_name": preview.get("production_name"),
            "workorder_name": preview.get("workorder_name"),
            "operation_name": preview.get("operation_name"),
            "target_qty": preview.get("target_qty", 0.0),
            "old_interval_qty": preview.get("old_interval_qty", 0.0),
            "current_workorder_done": preview.get("current_workorder_done", 0.0),
            "corrected_workorder_done": preview.get("corrected_workorder_done", 0.0),
            "downstream_summary": preview.get("downstream_summary"),
            "bonus_summary": preview.get("bonus_summary"),
        }
        if not keep_corrected:
            vals["corrected_interval_qty"] = preview.get("old_interval_qty", 0.0)
        return vals

    @api.model
    def default_get(self, fields_list):
        vals = super().default_get(fields_list)
        slot_id = vals.get("slot_id") or self.env.context.get("default_slot_id")
        if not slot_id:
            raise UserError(_("Nu a fost selectat niciun interval de corectat."))
        vals["slot_id"] = int(slot_id)
        preview = self._service().preview(slot_id)
        vals.update(self._fill_from_preview(preview))
        return vals

    @api.onchange("corrected_interval_qty")
    def _onchange_corrected_interval_qty(self):
        for wizard in self:
            if not wizard.slot_id:
                continue
            try:
                preview = wizard._service().preview(
                    wizard.slot_id,
                    wizard.corrected_interval_qty,
                )
            except UserError as exc:
                wizard.corrected_workorder_done = 0.0
                wizard.downstream_summary = str(exc)
                continue
            wizard.corrected_workorder_done = preview.get(
                "corrected_workorder_done", 0.0
            )
            wizard.downstream_summary = preview.get("downstream_summary")
            wizard.bonus_summary = preview.get("bonus_summary")

    def action_apply_correction(self):
        self.ensure_one()
        result = self._service().apply(
            self.slot_id,
            self.corrected_interval_qty,
            self.correction_reason,
        )
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Raportare corectată"),
                "message": _(
                    "Interval: %(old).2f → %(new).2f buc. | "
                    "Operație: %(old_total).2f → %(new_total).2f buc."
                ) % {
                    "old": result["old_interval_qty"],
                    "new": result["new_interval_qty"],
                    "old_total": result["old_workorder_done"],
                    "new_total": result["new_workorder_done"],
                },
                "type": "success",
                "sticky": False,
                "next": {"type": "ir.actions.client", "tag": "reload"},
            },
        }
