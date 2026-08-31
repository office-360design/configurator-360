from odoo import fields, models
from odoo.exceptions import UserError


class ShopfloorLiveHelpPick(models.TransientModel):
    _name = "shopfloor.live.help.pick"
    _description = "Shopfloor Live Help Picker"

    x_session_id = fields.Many2one(
        "x_shopfloor_session",
        required=True,
        readonly=True,
        string="Sesiune",
    )

    x_line_ids = fields.One2many(
        "shopfloor.live.help.pick.line",
        "x_picker_id",
        string="Colegi",
        readonly=True,
    )

    def action_back_to_session(self):
        self.ensure_one()

        if not self.x_session_id:
            raise UserError("Missing shopfloor session.")

        return self.env["shopfloor.live.common.service"].open_shopfloor_session_action(
            self.x_session_id,
        )


class ShopfloorLiveHelpPickLine(models.TransientModel):
    _name = "shopfloor.live.help.pick.line"
    _description = "Shopfloor Live Help Picker Line"

    x_picker_id = fields.Many2one(
        "shopfloor.live.help.pick",
        required=True,
        ondelete="cascade",
    )

    x_target_session_id = fields.Many2one(
        "x_shopfloor_session",
        required=True,
        readonly=True,
        string="Sesiune coleg",
    )

    x_employee_id = fields.Many2one(
        "hr.employee",
        readonly=True,
        string="Angajat",
    )

    x_operation_template_text = fields.Char(readonly=True)
    x_workorder_id = fields.Many2one("mrp.workorder", readonly=True)
    x_mo_number = fields.Char(readonly=True)
    x_product_mo_text = fields.Char(readonly=True)
    x_wc_text = fields.Char(readonly=True)

    def action_choose_helper_candidate(self):
        self.ensure_one()

        if not self.x_picker_id or not self.x_picker_id.x_session_id:
            raise UserError("Missing helper session.")

        if not self.x_target_session_id:
            raise UserError("No colleague selected.")

        helper_sess = self.x_picker_id.x_session_id

        return self.env["shopfloor.live.help.service"].with_context(
            helper_session_id=helper_sess.id,
            helper_employee_id=helper_sess.x_employee_id.id if helper_sess.x_employee_id else False,
            from_help_pick=True,
        ).choose_worker_to_help(self.x_target_session_id)
