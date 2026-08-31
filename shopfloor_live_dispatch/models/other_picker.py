from odoo import fields, models
from odoo.exceptions import UserError


class ShopfloorLiveOtherPick(models.TransientModel):
    _name = "shopfloor.live.other.pick"
    _description = "Shopfloor Live Other Activity Picker"

    x_session_id = fields.Many2one(
        "x_shopfloor_session",
        required=True,
        readonly=True,
        string="Sesiune",
    )

    x_employee_id = fields.Many2one(
        "hr.employee",
        readonly=True,
        string="Angajat",
    )

    x_line_ids = fields.One2many(
        "shopfloor.live.other.pick.line",
        "x_picker_id",
        string="Activități",
        readonly=True,
    )

    def action_back_to_session(self):
        self.ensure_one()

        if not self.x_session_id:
            raise UserError("Missing shopfloor session.")

        return self.env["shopfloor.live.common.service"].open_shopfloor_session_action(
            self.x_session_id,
            name="Shopfloor Session",
        )


class ShopfloorLiveOtherPickLine(models.TransientModel):
    _name = "shopfloor.live.other.pick.line"
    _description = "Shopfloor Live Other Activity Picker Line"

    x_picker_id = fields.Many2one(
        "shopfloor.live.other.pick",
        required=True,
        ondelete="cascade",
    )

    x_other_operation_id = fields.Many2one(
        "x_shopfloor_other_operation",
        required=True,
        readonly=True,
        string="Activitate",
    )

    x_name = fields.Char(readonly=True, string="Activitate")
    x_description = fields.Text(readonly=True, string="Descriere")
    x_expected_duration_min = fields.Float(readonly=True, string="Durată estimată")
    x_sort_index = fields.Integer(readonly=True)

    def action_choose_other_activity(self):
        self.ensure_one()

        if not self.x_picker_id or not self.x_picker_id.x_session_id:
            raise UserError("Missing shopfloor session.")

        if not self.x_other_operation_id:
            raise UserError("Nu a fost selectată nicio activitate.")

        sess = self.x_picker_id.x_session_id

        return self.env["shopfloor.live.other.service"].with_context(
            active_shopfloor_session_id=sess.id,
            active_shopfloor_employee_id=(
                sess.x_employee_id.id
                if sess.x_employee_id
                else False
            ),
            from_other_pick=True,
        ).select_other_operation(self.x_other_operation_id)
