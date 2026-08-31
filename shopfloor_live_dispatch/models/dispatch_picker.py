from odoo import fields, models
from odoo.exceptions import UserError


class ShopfloorLiveDispatchPick(models.TransientModel):
    _name = "shopfloor.live.dispatch.pick"
    _description = "Shopfloor Live Dispatch Operation Picker"

    x_session_id = fields.Many2one(
        "x_shopfloor_session",
        string="Session",
        required=True,
        readonly=True,
    )

    x_employee_id = fields.Many2one(
        "hr.employee",
        string="Employee",
        readonly=True,
    )

    x_message = fields.Html(
        string="Message",
        sanitize=False,
        readonly=True,
    )

    x_line_ids = fields.One2many(
        "shopfloor.live.dispatch.pick.line",
        "x_pick_id",
        string="Available Operations",
        readonly=True,
    )

    def action_back_to_session(self):
        self.ensure_one()

        if not self.x_session_id:
            raise UserError("Missing shopfloor session.")

        return self.env["shopfloor.live.common.service"].open_shopfloor_session_action(
            self.x_session_id,
            name="Production session",
        )


class ShopfloorLiveDispatchPickLine(models.TransientModel):
    _name = "shopfloor.live.dispatch.pick.line"
    _description = "Shopfloor Live Dispatch Operation Picker Line"
    _order = "x_sort_index asc, id asc"

    x_pick_id = fields.Many2one(
        "shopfloor.live.dispatch.pick",
        string="Picker",
        required=True,
        ondelete="cascade",
        readonly=True,
    )

    x_session_id = fields.Many2one(
        "x_shopfloor_session",
        string="Session",
        readonly=True,
    )

    x_employee_id = fields.Many2one(
        "hr.employee",
        string="Employee",
        readonly=True,
    )

    x_workorder_id = fields.Many2one(
        "mrp.workorder",
        string="Work Order",
        required=True,
        readonly=True,
    )

    x_operation_template_id = fields.Many2one(
        "x_operation_template",
        string="Operation",
        readonly=True,
    )

    x_production_id = fields.Many2one(
        "mrp.production",
        string="Manufacturing Order",
        readonly=True,
    )

    x_product_id = fields.Many2one(
        "product.product",
        string="Product",
        readonly=True,
    )

    x_workcenter_id = fields.Many2one(
        "mrp.workcenter",
        string="Work Center",
        readonly=True,
    )

    x_operation_name = fields.Char(
        string="Operation Name",
        readonly=True,
    )

    x_mo_product_text = fields.Char(
        string="MO / Product",
        readonly=True,
    )

    x_parent_mo_id = fields.Many2one(
        "mrp.production",
        string="Parent Manufacturing Order",
        readonly=True,
    )

    x_parent_product_name = fields.Char(
        string="Parent Product",
        readonly=True,
    )

    x_parent_referinta_interna = fields.Char(
        string="Parent Internal Reference",
        readonly=True,
    )

    x_workcenter_name = fields.Char(
        string="Machine",
        readonly=True,
    )

    x_qty_remaining = fields.Float(
        string="Remaining Quantity",
        readonly=True,
    )

    x_qty_total = fields.Float(
        string="Total Quantity",
        readonly=True,
    )

    x_qty_done = fields.Float(
        string="Completed Quantity",
        readonly=True,
    )

    x_qty_text = fields.Char(
        string="Quantity Text",
        readonly=True,
    )

    x_expected_duration_min = fields.Float(
        string="Expected Duration",
        readonly=True,
    )

    x_duration_text = fields.Char(
        string="Duration Text",
        readonly=True,
    )

    x_score = fields.Integer(
        string="Score",
        readonly=True,
    )

    x_is_best = fields.Boolean(
        string="Recommended",
        readonly=True,
    )

    x_badge_text = fields.Char(
        string="Badge",
        readonly=True,
    )

    x_deadline_text = fields.Char(
        string="Deadline",
        readonly=True,
    )

    x_sort_index = fields.Integer(
        string="Sort Index",
        readonly=True,
    )

    def action_choose_candidate(self):
        self.ensure_one()

        if not self.x_session_id:
            raise UserError("Missing shopfloor session.")

        if not self.x_workorder_id:
            raise UserError("Missing work order.")

        return self.env["shopfloor.live.dispatch.service"].choose_candidate_from_picker(
            self
        )