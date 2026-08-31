import logging

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools.float_utils import float_compare

_logger = logging.getLogger(__name__)


class MrpProduction(models.Model):
    _inherit = "mrp.production"

    shopfloor_auto_close_blocked = fields.Boolean(
        string="Închidere automată blocată",
        readonly=True,
        copy=False,
        index=True,
        help=(
            "Este activ când toate operațiile comenzii sunt terminate, dar "
            "MO-ul nu poate fi închis automat în siguranță."
        ),
    )
    shopfloor_auto_close_block_reason = fields.Selection(
        selection=[
            ("raw_snapshot_not_fully_consumed", "Consum incomplet față de necesarul comenzii"),
            ("finished_quantity_incomplete", "Cantitate produsă incompletă"),
            ("consumption_warning", "Diferență de consum"),
            ("button_mark_done_returned_action", "Odoo necesită confirmare la închidere"),
            ("button_mark_done_failed", "Eroare la închiderea automată"),
        ],
        string="Motiv blocare închidere",
        readonly=True,
        copy=False,
        index=True,
    )
    shopfloor_auto_close_blocked_at = fields.Datetime(
        string="Blocată la",
        readonly=True,
        copy=False,
    )
    shopfloor_auto_close_block_summary = fields.Char(
        string="Rezumat blocare",
        readonly=True,
        copy=False,
    )
    shopfloor_auto_close_block_details = fields.Text(
        string="Detalii blocare",
        readonly=True,
        copy=False,
    )
    shopfloor_auto_close_waiting_children = fields.Boolean(
        string="Așteaptă comenzi reper",
        readonly=True,
        copy=False,
        index=True,
        help=(
            "Este activ când MO-ul este pregătit de închidere, dar încă așteaptă "
            "finalizarea uneia sau mai multor comenzi reper/copil."
        ),
    )
    shopfloor_auto_close_waiting_children_summary = fields.Char(
        string="Comenzi reper așteptate",
        readonly=True,
        copy=False,
    )
    shopfloor_total_duration_real = fields.Float(
        string="Durata reală totală",
        compute="_compute_shopfloor_total_durations",
        readonly=True,
        help=(
            "Suma duratelor reale ale tuturor comenzilor de lucru din acest MO "
            "și din toate comenzile reper/copil descendente."
        ),
    )
    shopfloor_total_duration_expected = fields.Float(
        string="Durata estimată totală",
        compute="_compute_shopfloor_total_durations",
        readonly=True,
        help=(
            "Suma duratelor estimate ale tuturor comenzilor de lucru din acest MO "
            "și din toate comenzile reper/copil descendente."
        ),
    )
    shopfloor_order_reference = fields.Char(
        string="Referință comandă",
        compute="_compute_shopfloor_order_reference",
        readonly=True,
        help=(
            "Referința comenzii clientului. Pentru comenzile părinte se folosește "
            "Referința Internă, iar pentru comenzile reper/copil se preia aceeași "
            "referință de la părintele principal."
        ),
    )

    def _compute_shopfloor_order_reference(self):
        """Expose one customer/order reference for parent and child MOs.

        The production database stores the client-facing order number on the
        top-level MO in ``x_referinta_interna`` and copies it to child/reper MOs
        in ``x_parent_referinta_interna``.  Keep the computation defensive so
        the module can still load on databases where those Studio fields are
        absent, and fall back to walking ``x_parent_mo_id`` when needed.
        """
        for mo in self:
            reference = False

            if "x_referinta_interna" in mo._fields:
                reference = mo.x_referinta_interna or False

            if not reference and "x_parent_referinta_interna" in mo._fields:
                reference = mo.x_parent_referinta_interna or False

            if not reference and "x_parent_mo_id" in mo._fields:
                current = mo
                seen = set()
                while (
                    current
                    and current.id not in seen
                    and "x_parent_mo_id" in current._fields
                    and current.x_parent_mo_id
                ):
                    seen.add(current.id)
                    current = current.x_parent_mo_id

                if current and "x_referinta_interna" in current._fields:
                    reference = current.x_referinta_interna or False

            mo.shopfloor_order_reference = reference


    def _shopfloor_duration_scope_mos(self):
        """Return this MO plus every descendant MO, without double counting.

        Multi-BoM trees can be more than one level deep and older records may
        be linked through either stock/procurement relations or x_parent_mo_id.
        Reuse the same child resolver used by the close/cascade logic.
        """
        self.ensure_one()

        scope = self
        frontier = self
        while frontier:
            children = frontier._get_cascade_child_mos().exists() - scope
            if not children:
                break
            scope |= children
            frontier = children
        return scope

    @api.depends(
        "workorder_ids.duration",
        "workorder_ids.duration_expected",
        "x_child_mo_ids.workorder_ids.duration",
        "x_child_mo_ids.workorder_ids.duration_expected",
    )
    def _compute_shopfloor_total_durations(self):
        for mo in self:
            scope = mo._shopfloor_duration_scope_mos()
            workorders = scope.mapped("workorder_ids")
            mo.shopfloor_total_duration_real = sum(
                float(value or 0.0) for value in workorders.mapped("duration")
            )
            expected_total = 0.0
            for workorder in workorders:
                try:
                    if hasattr(workorder, "_shopfloor_expected_total_minutes"):
                        expected_total += float(
                            workorder._shopfloor_expected_total_minutes() or 0.0
                        )
                    else:
                        expected_total += float(workorder.duration_expected or 0.0)
                except Exception:
                    expected_total += float(workorder.duration_expected or 0.0)
            mo.shopfloor_total_duration_expected = expected_total

    @api.model
    def _shopfloor_format_block_qty(self, value):
        value = float(value or 0.0)
        text = ("%.6f" % value).rstrip("0").rstrip(".")
        return text or "0"

    def _shopfloor_consumption_warning_text(self):
        self.ensure_one()
        try:
            issues = self._get_consumption_issues()
        except Exception:
            return (
                _("Diferență de consum detectată de Odoo."),
                _("Odoo nu a putut furniza detaliile diferenței de consum."),
            )

        rows = []
        for _order, product, consumed, expected in issues:
            uom_name = product.uom_id.display_name if product.uom_id else ""
            consumed_text = self._shopfloor_format_block_qty(consumed)
            expected_text = self._shopfloor_format_block_qty(expected)
            rows.append(
                _("%(product)s: consum %(consumed)s %(uom)s / BoM actual %(expected)s %(uom)s")
                % {
                    "product": product.display_name,
                    "consumed": consumed_text,
                    "expected": expected_text,
                    "uom": uom_name,
                }
            )

        if not rows:
            return (
                _("Diferență de consum detectată de Odoo."),
                _("Odoo a raportat un avertisment de consum fără linii detaliate."),
            )

        summary = rows[0]
        details = False
        if len(rows) > 1:
            summary += _(" (+%(count)s alte diferențe)") % {"count": len(rows) - 1}
            # The first issue is already displayed in the summary. Keep only the
            # additional rows in the form details so the same warning is never
            # rendered twice.
            details = "\n".join(rows[1:])
        return summary, details

    def _shopfloor_open_child_producers(self):
        """Return every open child/reper MO known for this production.

        The admin dashboard's ``Copii MO`` relation also uses the custom
        ``x_parent_mo_id`` fallback.  The waiting marker must use the same
        relationship, otherwise an MO can visibly have open children while the
        warning field remains false.  Keep the stock/procurement links too for
        older records whose custom parent field was not populated.
        """
        self.ensure_one()

        child_mos = self._get_cascade_child_mos()
        for move in self.move_raw_ids.filtered(lambda m: m.state != "cancel"):
            if "created_production_id" in move._fields and move.created_production_id:
                child_mos |= move.created_production_id

            for origin_move in move.move_orig_ids:
                if "production_id" in origin_move._fields and origin_move.production_id:
                    child_mos |= origin_move.production_id

        child_mos = child_mos.exists() - self
        return child_mos.filtered(
            lambda child: child.state not in ("done", "cancel")
        )

    def _shopfloor_set_waiting_children(self, children=False):
        """Persist the normal 'waiting for child MOs' status for the UI."""
        for mo in self:
            waiting = children if len(self) == 1 and children is not False else False
            if waiting is False:
                waiting = mo._shopfloor_open_child_producers()

            names = ", ".join(waiting.mapped("name")) if waiting else False
            summary = (
                _("Așteaptă finalizarea: %(children)s") % {"children": names}
                if names
                else False
            )
            values = {
                "shopfloor_auto_close_waiting_children": bool(waiting),
                "shopfloor_auto_close_waiting_children_summary": summary,
            }
            if (
                mo.shopfloor_auto_close_waiting_children != values["shopfloor_auto_close_waiting_children"]
                or mo.shopfloor_auto_close_waiting_children_summary != summary
            ):
                mo.sudo().write(values)

    def _shopfloor_clear_waiting_children(self):
        for mo in self:
            if (
                mo.shopfloor_auto_close_waiting_children
                or mo.shopfloor_auto_close_waiting_children_summary
            ):
                mo.sudo().write({
                    "shopfloor_auto_close_waiting_children": False,
                    "shopfloor_auto_close_waiting_children_summary": False,
                })

    def _shopfloor_set_auto_close_block(
        self,
        reason,
        summary,
        details=False,
        auto_exclude=True,
    ):
        for mo in self:
            mo._shopfloor_clear_waiting_children()
            values = {
                "shopfloor_auto_close_blocked": True,
                "shopfloor_auto_close_block_reason": reason,
                "shopfloor_auto_close_blocked_at": fields.Datetime.now(),
                "shopfloor_auto_close_block_summary": summary or False,
                "shopfloor_auto_close_block_details": details or False,
            }
            mo.sudo().write(values)

            # All WOs are already closed, so there is nothing left to schedule on
            # this exact MO. Do not cascade this technical exclusion to child MOs:
            # an unfinished child may still need to remain in the planner.
            if (
                auto_exclude
                and "x_include_in_planner" in mo._fields
                and mo.x_include_in_planner
            ):
                mo.sudo().with_context(
                    skip_include_planner_cascade=True,
                ).write({"x_include_in_planner": False})


    def _shopfloor_clear_auto_close_block(self):
        for mo in self:
            if (
                mo.shopfloor_auto_close_blocked
                or mo.shopfloor_auto_close_block_reason
                or mo.shopfloor_auto_close_block_summary
                or mo.shopfloor_auto_close_block_details
            ):
                mo.sudo().write({
                    "shopfloor_auto_close_blocked": False,
                    "shopfloor_auto_close_block_reason": False,
                    "shopfloor_auto_close_blocked_at": False,
                    "shopfloor_auto_close_block_summary": False,
                    "shopfloor_auto_close_block_details": False,
                })

    def _get_cascade_child_mos(self):
        """
        Return the direct child/reper MOs.

        Uses:
        1. Odoo's standard stock/procurement relationship.
        2. The custom x_parent_mo_id relationship as a fallback.
        """
        Production = self.env["mrp.production"]
        children = Production

        for production in self:
            children |= production._get_children()

        if "x_parent_mo_id" in Production._fields:
            children |= Production.search([
                ("x_parent_mo_id", "in", self.ids),
            ])

        return children.exists() - self

    def _check_done_child_mos(self, children, operation):
        done_children = children.filtered(
            lambda production: production.state == "done"
        )

        if not done_children:
            return

        child_names = "\n".join(
            "- %s — %s"
            % (
                production.name,
                production.product_id.display_name,
            )
            for production in done_children
        )

        if operation == "delete":
            message = _(
                "Comanda nu poate fi ștearsă deoarece următoarele "
                "comenzi reper sunt deja finalizate:\n%s"
            )
        else:
            message = _(
                "Comanda nu poate fi anulată deoarece următoarele "
                "comenzi reper sunt deja finalizate:\n%s"
            )

        raise UserError(message % child_names)

    def action_cancel(self):
        children = self._get_cascade_child_mos()

        self._check_done_child_mos(
            children,
            operation="cancel",
        )

        children_to_cancel = children.filtered(
            lambda production: production.state != "cancel"
        )

        if children_to_cancel:
            children_to_cancel.with_context(
                skip_activity=True
            ).action_cancel()

        return super().action_cancel()

    def unlink(self):
        children = self._get_cascade_child_mos()

        self._check_done_child_mos(
            children,
            operation="delete",
        )

        if children:
            # Delete children first while their parent relationship still exists.
            # Child unlink() also applies this recursively.
            children.unlink()

        return super().unlink()


    def action_shopfloor_open_force_close_wizard(self):
        self.ensure_one()
        if self.state != "to_close":
            raise UserError(
                _(
                    "Comanda %(mo_name)s nu este în starea «De închis»."
                )
                % {"mo_name": self.name}
            )

        waiting_children = self._shopfloor_open_child_producers()
        if waiting_children:
            raise UserError(
                _(
                    "Comanda %(mo_name)s nu poate fi finalizată manual cât timp "
                    "așteaptă comenzile reper: %(children)s. Finalizați mai întâi "
                    "comenzile reper."
                )
                % {
                    "mo_name": self.name,
                    "children": ", ".join(waiting_children.mapped("name")),
                }
            )

        return {
            "type": "ir.actions.act_window",
            "name": _("Confirmare finalizare"),
            "res_model": "shopfloor.force.close.production.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {
                "default_production_id": self.id,
                "default_confirmation_message": _(
                    "Sunteți sigur că problema a fost verificată și doriți să "
                    "finalizați %(mo_name)s?"
                ) % {"mo_name": self.name},
            },
        }

    # ------------------------------------------------------------------
    # Defensive automatic MO closing
    # ------------------------------------------------------------------

    def _shopfloor_all_workorders_closed(self):
        self.ensure_one()
        return not self.workorder_ids.filtered(
            lambda wo: wo.state not in ("done", "cancel", "cancelled")
        )

    def _shopfloor_child_producers_done(self):
        """Return False while a raw component is still produced by an open child MO."""
        self.ensure_one()
        return not self._shopfloor_open_child_producers()

    def _shopfloor_raw_snapshot_is_fully_consumed(self):
        """Ensure actual consumption still matches this MO's own raw-move snapshot.

        This deliberately compares against the raw move created with the MO, not
        against the current BoM. It prevents the backstop from manufacturing a
        quantity that the MO itself did not actually consume.
        """
        self.ensure_one()

        for move in self.move_raw_ids.filtered(lambda m: m.state != "cancel"):
            product = move.product_id
            uom = move.product_uom or product.uom_id
            if not product or not uom:
                continue

            try:
                consumed = move._get_picked_quantity()
            except Exception:
                consumed = move.quantity if "quantity" in move._fields else 0.0

            demand = float(move.product_uom_qty or 0.0)
            if float_compare(
                float(consumed or 0.0),
                demand,
                precision_rounding=uom.rounding,
            ) != 0:
                return False

        return True

    def _shopfloor_finished_quantity_is_complete(self):
        self.ensure_one()

        target = float(self.product_qty or 0.0)
        if target <= 0.0:
            return False

        product_uom = self.product_uom_id or self.product_id.uom_id
        if not product_uom:
            return False

        # qty_producing is already synchronized by normal Odoo/Worker Hub flows
        # for a fully completed final work order.
        if "qty_producing" in self._fields:
            if float_compare(
                float(self.qty_producing or 0.0),
                target,
                precision_rounding=product_uom.rounding,
            ) >= 0:
                return True

        finished_qty = 0.0
        for move in self.move_finished_ids.filtered(
            lambda m: m.state != "cancel" and m.product_id == self.product_id
        ):
            move_uom = move.product_uom or product_uom
            qty = move.quantity if "quantity" in move._fields else move.product_uom_qty
            try:
                finished_qty += move_uom._compute_quantity(
                    qty,
                    product_uom,
                    round=False,
                )
            except Exception:
                finished_qty += float(qty or 0.0)

        return float_compare(
            finished_qty,
            target,
            precision_rounding=product_uom.rounding,
        ) >= 0

    def _shopfloor_has_consumption_warning(self):
        self.ensure_one()
        try:
            return bool(self._get_consumption_issues())
        except Exception:
            # If Odoo cannot evaluate its own consumption warning, do not force
            # closure. Leaving the MO visible in ``to_close`` is the safe state.
            _logger.exception(
                "SHOPFLOOR_MO_BACKSTOP: consumption issue check failed for mo=%s",
                self.name,
            )
            return True

    def _shopfloor_parent_productions(self):
        """Return parent/downstream MOs that may become closable after this MO."""
        self.ensure_one()
        parents = self.env["mrp.production"]

        if "x_parent_mo_id" in self._fields and self.x_parent_mo_id:
            parents |= self.x_parent_mo_id

        for finished_move in self.move_finished_ids:
            for dest_move in finished_move.move_dest_ids:
                if (
                    "raw_material_production_id" in dest_move._fields
                    and dest_move.raw_material_production_id
                ):
                    parents |= dest_move.raw_material_production_id

        return parents.exists() - self

    def _shopfloor_try_auto_close_ready_production(self):
        """Safely close fully completed MOs that are stuck in ``to_close``.

        The method is intentionally conservative:
        - all work orders must already be done/cancelled;
        - child/component MOs supplying this MO must already be done/cancelled;
        - actual raw consumption must match this MO's own raw-move snapshot;
        - the finished quantity must cover the MO target;
        - Odoo must report no current consumption warning.

        If ``button_mark_done`` returns any wizard/action or raises an exception,
        the MO stays in ``to_close``. No warning is automatically accepted.
        """
        results = []

        for mo in self.exists():
            visited = set(
                self.env.context.get("shopfloor_auto_close_visited_ids", ())
            )
            if mo.id in visited:
                continue
            visited.add(mo.id)

            result = {
                "mo_id": mo.id,
                "mo": mo.name,
                "closed": False,
                "reason": False,
            }

            mo.invalidate_recordset()

            if mo.state == "done":
                mo._shopfloor_clear_waiting_children()
                mo._shopfloor_clear_auto_close_block()
                result.update(closed=True, reason="already_done")
                results.append(result)
                continue

            if mo.state != "to_close":
                mo._shopfloor_clear_waiting_children()
                mo._shopfloor_clear_auto_close_block()
                result["reason"] = "not_to_close"
                results.append(result)
                continue

            if not mo._shopfloor_all_workorders_closed():
                mo._shopfloor_clear_waiting_children()
                mo._shopfloor_clear_auto_close_block()
                result["reason"] = "open_workorders"
                results.append(result)
                continue

            waiting_children = mo._shopfloor_open_child_producers()
            if waiting_children:
                # Waiting for a child/reper MO is a normal production dependency,
                # not an administrator intervention case. Persist the reason so
                # both kanban and form views can explain why this 100% MO stays in
                # ``to_close``.
                mo._shopfloor_clear_auto_close_block()
                mo._shopfloor_set_waiting_children(waiting_children)
                result["reason"] = "open_child_production"
                result["waiting_children"] = waiting_children.mapped("name")
                results.append(result)
                continue

            mo._shopfloor_clear_waiting_children()

            if not mo._shopfloor_raw_snapshot_is_fully_consumed():
                summary = _(
                    "Consumul realizat nu corespunde necesarului păstrat pe comandă."
                )
                details = _(
                    "Cel puțin o materie primă are o cantitate consumată diferită de "
                    "cantitatea cerută de raw move-ul acestei comenzi. Verifică manual "
                    "consumul înainte de finalizare."
                )
                mo._shopfloor_set_auto_close_block(
                    "raw_snapshot_not_fully_consumed",
                    summary,
                    details=details,
                )
                result["reason"] = "raw_snapshot_not_fully_consumed"
                results.append(result)
                continue

            if not mo._shopfloor_finished_quantity_is_complete():
                summary = _(
                    "Cantitatea produsului finit este mai mică decât cantitatea comenzii."
                )
                details = _(
                    "Toate operațiile sunt terminate, dar cantitatea produsă nu acoperă "
                    "cantitatea cerută de MO. Verifică manual cantitatea produsă."
                )
                mo._shopfloor_set_auto_close_block(
                    "finished_quantity_incomplete",
                    summary,
                    details=details,
                )
                result["reason"] = "finished_quantity_incomplete"
                results.append(result)
                continue

            if mo._shopfloor_has_consumption_warning():
                summary, details = mo._shopfloor_consumption_warning_text()
                mo._shopfloor_set_auto_close_block(
                    "consumption_warning",
                    summary,
                    details=details,
                )
                result["reason"] = "consumption_warning"
                results.append(result)
                _logger.warning(
                    "SHOPFLOOR_MO_BACKSTOP: leaving mo=%s in to_close because Odoo "
                    "reports a consumption warning; summary=%s",
                    mo.name,
                    summary,
                )
                continue

            try:
                button_result = mo.with_context(
                    skip_backorder=True,
                    skip_immediate=True,
                    no_start_next=True,
                    shopfloor_auto_close_visited_ids=tuple(visited),
                ).button_mark_done()
                mo.invalidate_recordset()

                if mo.state != "done":
                    action_name = False
                    if isinstance(button_result, dict):
                        action_name = button_result.get("name") or button_result.get("res_model")
                    summary = _(
                        "Odoo solicită o confirmare suplimentară pentru închiderea comenzii."
                    )
                    if action_name:
                        summary = _("Odoo solicită: %(action)s") % {"action": action_name}
                    mo._shopfloor_set_auto_close_block(
                        "button_mark_done_returned_action",
                        summary,
                        details=str(button_result),
                    )
                    result["reason"] = "button_mark_done_returned_action"
                    result["button_result"] = str(button_result)
                    _logger.warning(
                        "SHOPFLOOR_MO_BACKSTOP: button_mark_done did not close mo=%s; "
                        "result=%s state=%s",
                        mo.name,
                        button_result,
                        mo.state,
                    )
                    results.append(result)
                    continue

                mo._shopfloor_clear_auto_close_block()
                result.update(closed=True, reason="closed")
                results.append(result)
                _logger.warning(
                    "SHOPFLOOR_MO_BACKSTOP: auto-closed mo=%s after all work orders "
                    "and component prerequisites were completed",
                    mo.name,
                )

                # Completing a child MO posts its finished move and can make the
                # parent raw move assignable. If the parent work orders had already
                # been completed earlier, retry it now as well.
                parents = mo._shopfloor_parent_productions()
                if parents:
                    parents.with_context(
                        shopfloor_auto_close_visited_ids=tuple(visited),
                    )._shopfloor_try_auto_close_ready_production()

            except Exception as exc:
                mo._shopfloor_set_auto_close_block(
                    "button_mark_done_failed",
                    _("Eroare la închiderea automată a comenzii."),
                    details=str(exc),
                )
                result["reason"] = "button_mark_done_failed"
                result["error"] = str(exc)
                results.append(result)
                _logger.exception(
                    "SHOPFLOOR_MO_BACKSTOP: button_mark_done failed for mo=%s",
                    mo.name,
                )

        return results
