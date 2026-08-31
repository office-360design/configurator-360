from odoo import SUPERUSER_ID, _, fields, models
from odoo.exceptions import AccessError, UserError


class ShopfloorForceCloseProductionWizard(models.TransientModel):
    _name = "shopfloor.force.close.production.wizard"
    _description = "Confirmare finalizare manuală comandă de producție"

    production_id = fields.Many2one(
        "mrp.production",
        string="Comandă de producție",
        required=True,
        readonly=True,
    )
    confirmation_message = fields.Text(
        string="Confirmare",
        readonly=True,
    )

    def _confirmation_message_for_production(self, production):
        return _(
            "Sunteți sigur că problema a fost verificată și doriți să "
            "finalizați %(mo_name)s?"
        ) % {
            "mo_name": production.name if production else _("comanda selectată"),
        }

    def default_get(self, fields_list):
        vals = super().default_get(fields_list)
        if "confirmation_message" in fields_list:
            production_id = vals.get("production_id") or self.env.context.get(
                "default_production_id"
            )
            production = (
                self.env["mrp.production"].browse(production_id).exists()
                if production_id
                else self.env["mrp.production"]
            )
            vals["confirmation_message"] = self._confirmation_message_for_production(
                production
            )
        return vals

    def _check_force_close_access(self):
        if not self.env.su and not self.env.user.has_group("mrp.group_mrp_user"):
            raise AccessError(
                _("Nu aveți dreptul de a finaliza manual comenzi de producție.")
            )

    def _confirm_standard_close_action(self, action):
        """Resolve standard MRP confirmations after our explicit user prompt."""
        if not isinstance(action, dict):
            return action

        res_model = action.get("res_model")
        action_context = action.get("context")
        if not isinstance(action_context, dict):
            action_context = {}
        action_context = dict(action_context)
        action_context.update({
            "skip_backorder": True,
            "skip_immediate": True,
            "no_start_next": True,
            "shopfloor_manual_force_close": True,
        })

        if res_model == "mrp.consumption.warning":
            warning = (
                self.env[res_model]
                .with_user(SUPERUSER_ID)
                .sudo()
                .with_context(**action_context)
                .create({})
            )
            return warning.action_confirm()

        if res_model == "mrp.production.backorder":
            backorder = (
                self.env[res_model]
                .with_user(SUPERUSER_ID)
                .sudo()
                .with_context(**action_context)
                .create({})
            )
            return backorder.action_close_mo()

        return action

    def _force_close_production(self, production):
        production = production.with_user(SUPERUSER_ID).sudo()
        production.invalidate_recordset()

        if production.state == "done":
            return
        if production.state != "to_close":
            raise UserError(
                _("Comanda %(mo_name)s nu mai este în starea «De închis».")
                % {"mo_name": production.name}
            )

        waiting_children = production._shopfloor_open_child_producers()
        if waiting_children:
            raise UserError(
                _(
                    "Comanda %(mo_name)s nu poate fi finalizată manual cât timp "
                    "așteaptă comenzile reper: %(children)s. Finalizați mai întâi "
                    "comenzile reper."
                )
                % {
                    "mo_name": production.name,
                    "children": ", ".join(waiting_children.mapped("name")),
                }
            )

        # A manual override means the current MO quantity is intentionally being
        # accepted as complete. This also prevents an old partial qty_producing
        # value from turning the confirmation into an unwanted backorder.
        target_qty = float(production.product_qty or 0.0)
        if target_qty > 0.0 and "qty_producing" in production._fields:
            if float(production.qty_producing or 0.0) < target_qty:
                production.write({"qty_producing": target_qty})

        close_context = {
            "skip_backorder": True,
            "skip_immediate": True,
            "no_start_next": True,
            "shopfloor_manual_force_close": True,
        }

        try:
            action = production.with_context(**close_context).button_mark_done()
            for _step in range(4):
                production.invalidate_recordset()
                if production.state == "done":
                    break
                next_action = self._confirm_standard_close_action(action)
                if next_action is action:
                    break
                action = next_action
        except Exception as exc:
            raise UserError(
                _(
                    "Comanda %(mo_name)s nu a putut fi finalizată de Odoo.\n\n%(error)s"
                )
                % {"mo_name": production.name, "error": str(exc)}
            ) from exc

        production.invalidate_recordset()
        if production.state != "done":
            raise UserError(
                _(
                    "Comanda %(mo_name)s nu a putut fi finalizată după confirmarea "
                    "manuală."
                )
                % {"mo_name": production.name}
            )

        production._shopfloor_clear_waiting_children()
        production._shopfloor_clear_auto_close_block()

        parents = production._shopfloor_parent_productions()
        if parents:
            parents._shopfloor_try_auto_close_ready_production()

    def action_confirm_force_close(self):
        self.ensure_one()
        self._check_force_close_access()
        self._force_close_production(self.production_id)
        return {"type": "ir.actions.client", "tag": "reload"}
