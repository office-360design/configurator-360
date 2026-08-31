from odoo import api, fields, models


class ShopfloorComponentFlow(models.Model):
    _name = "shopfloor.component.flow"
    _description = "Shopfloor Component Quantity Flow"
    _order = "x_parent_mo_id, x_product_id"

    x_name = fields.Char(
        string="Name",
        compute="_compute_name",
        store=True,
    )

    x_parent_mo_id = fields.Many2one(
        "mrp.production",
        string="Parent Manufacturing Order",
        required=True,
        index=True,
        ondelete="cascade",
    )

    x_product_id = fields.Many2one(
        "product.product",
        string="Component",
        required=True,
        index=True,
        ondelete="restrict",
    )

    x_child_mo_ids = fields.Many2many(
        "mrp.production",
        "shopfloor_component_flow_child_mo_rel",
        "flow_id",
        "production_id",
        string="Child Manufacturing Orders",
    )

    # Component units required for one unit of the parent product.
    x_child_qty_per_parent = fields.Float(
        string="Component Quantity per Parent",
        required=True,
        default=1.0,
    )

    # Fully processed component units released by child MOs.
    x_released_qty = fields.Float(
        string="Released Quantity",
        default=0.0,
    )

    # Component units currently held by active worker sessions.
    x_reserved_qty = fields.Float(
        string="Reserved Quantity",
        default=0.0,
    )

    # Component units already used by the first parent WO.
    x_consumed_qty = fields.Float(
        string="Consumed Quantity",
        default=0.0,
    )

    x_available_qty = fields.Float(
        string="Available Quantity",
        compute="_compute_available_qty",
        store=True,
    )

    active = fields.Boolean(
        default=True,
    )

    _sql_constraints = [
        (
            "parent_product_unique",
            "unique(x_parent_mo_id, x_product_id)",
            "A component-flow record already exists for this parent order and component.",
        ),
    ]

    @api.depends(
        "x_parent_mo_id.name",
        "x_product_id.display_name",
    )
    def _compute_name(self):
        for rec in self:
            parent_name = rec.x_parent_mo_id.name or ""
            product_name = rec.x_product_id.display_name or ""

            rec.x_name = "%s - %s" % (
                parent_name,
                product_name,
            )

    @api.depends(
        "x_released_qty",
        "x_reserved_qty",
        "x_consumed_qty",
    )
    def _compute_available_qty(self):
        for rec in self:
            rec.x_available_qty = max(
                0.0,
                float(rec.x_released_qty or 0.0)
                - float(rec.x_reserved_qty or 0.0)
                - float(rec.x_consumed_qty or 0.0),
            )


class ShopfloorComponentReservation(models.Model):
    _name = "shopfloor.component.reservation"
    _description = "Shopfloor Component Reservation"
    _order = "id desc"

    x_session_id = fields.Many2one(
        "x_shopfloor_session",
        string="Shopfloor Session",
        required=True,
        index=True,
        ondelete="cascade",
    )

    x_workorder_id = fields.Many2one(
        "mrp.workorder",
        string="Parent Work Order",
        required=True,
        index=True,
        ondelete="cascade",
    )

    x_parent_mo_id = fields.Many2one(
        "mrp.production",
        string="Parent Manufacturing Order",
        required=True,
        index=True,
        ondelete="cascade",
    )

    x_flow_id = fields.Many2one(
        "shopfloor.component.flow",
        string="Component Flow",
        required=True,
        index=True,
        ondelete="cascade",
    )

    x_parent_qty_reserved = fields.Float(
        string="Parent Quantity Reserved",
        required=True,
    )

    x_child_qty_reserved = fields.Float(
        string="Component Quantity Reserved",
        required=True,
    )

    x_parent_qty_consumed = fields.Float(
        string="Parent Quantity Consumed",
        default=0.0,
    )

    x_child_qty_consumed = fields.Float(
        string="Component Quantity Consumed",
        default=0.0,
    )

    x_state = fields.Selection(
        [
            ("reserved", "Reserved"),
            ("settled", "Settled"),
            ("released", "Released"),
        ],
        string="State",
        required=True,
        default="reserved",
        index=True,
    )

    x_release_reason = fields.Char(
        string="Release Reason",
    )

    x_settled_at = fields.Datetime(
        string="Settled At",
    )
