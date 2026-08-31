import logging

from odoo import models
from odoo.exceptions import UserError
from odoo.tools import float_compare


_logger = logging.getLogger(__name__)


class ShopfloorStockPostingService(models.AbstractModel):
    _name = "shopfloor.stock.posting.service"
    _description = "Shopfloor Partial Stock Posting Service"

    EPSILON = 0.0001

    def _dispatch(self):
        return self.env[
            "shopfloor.live.dispatch.service"
        ]

    def _snapshot_full_expected_durations(self, production):
        """Snapshot the full WO norms before changing qty_producing."""
        snapshot = {}
        if not production:
            return snapshot

        for workorder in production.workorder_ids:
            try:
                if hasattr(workorder, "_shopfloor_expected_total_minutes"):
                    minutes = float(
                        workorder._shopfloor_expected_total_minutes() or 0.0
                    )
                else:
                    minutes = float(workorder.duration_expected or 0.0)
            except Exception:
                minutes = 0.0

            if minutes > 0.0:
                snapshot[workorder.id] = minutes

        return snapshot

    def _restore_full_expected_durations(self, production, snapshot):
        if not production or not snapshot:
            return

        for workorder in production.workorder_ids:
            expected = snapshot.get(workorder.id)
            if not expected:
                continue

            try:
                current = float(workorder.duration_expected or 0.0)
            except Exception:
                current = 0.0

            if abs(current - expected) <= 0.005:
                continue

            workorder.with_context(
                bypass_duration_calculation=True,
                shopfloor_restore_full_expected=True,
            ).write({
                "duration_expected": expected,
            })

            _logger.warning(
                "[SHOPFLOOR_STOCK] restored full expected duration | "
                "wo=%s old=%s restored=%s qty_producing=%s qty_total=%s",
                workorder.id,
                current,
                expected,
                workorder.qty_producing,
                workorder.qty_production,
            )

    def _lock_production(self, production):
        if not production:
            return

        self.env.cr.execute(
            """
            SELECT id
              FROM mrp_production
             WHERE id = %s
             FOR UPDATE
            """,
            [production.id],
        )

    def _invalidate_production(self, production):
        if not production:
            return

        try:
            production.invalidate_recordset([
                "qty_produced",
                "qty_producing",
                "state",
                "move_raw_ids",
                "move_finished_ids",
            ])
        except Exception:
            pass

        try:
            production.move_raw_ids.invalidate_recordset([
                "state",
                "picked",
                "quantity",
                "product_uom_qty",
            ])
        except Exception:
            pass

        try:
            production.move_finished_ids.invalidate_recordset([
                "state",
                "picked",
                "quantity",
                "product_uom_qty",
            ])
        except Exception:
            pass

    def is_terminal_workorder(self, wo):
        if not wo or not wo.production_id:
            return False

        terminal_workorders = (
            self._dispatch()
            ._terminal_workorders_for_mo(
                wo.production_id
            )
        )

        return bool(
            terminal_workorders
            and wo.id in terminal_workorders.ids
        )

    def post_terminal_progress(self, wo):
        """
        Post cumulative dispatch progress into Odoo inventory.

        Only the final WO of an MO produces stock.

        Idempotency:
            desired cumulative quantity
            minus already posted MO quantity
            equals the quantity posted now.
        """
        result = {
            "is_terminal": False,
            "posted": False,
            "production_id": False,
            "production_name": False,
            "desired_qty": 0.0,
            "posted_before": 0.0,
            "posted_after": 0.0,
            "posted_delta": 0.0,
            "skipped_reason": False,
        }

        if not wo or not wo.production_id:
            result["skipped_reason"] = (
                "missing_workorder_or_production"
            )
            return result

        production = wo.production_id

        result["production_id"] = production.id
        result["production_name"] = production.name

        if not self.is_terminal_workorder(wo):
            result["skipped_reason"] = (
                "not_terminal_workorder"
            )
            return result

        result["is_terminal"] = True

        # Serialize partial stock postings for this MO.
        self._lock_production(production)
        self._invalidate_production(production)

        try:
            wo.invalidate_recordset([
                "x_dispatch_qty_done",
                "qty_produced",
                "qty_producing",
                "state",
            ])
        except Exception:
            pass

        target_qty = max(
            0.0,
            float(
                production.product_qty or 0.0
            ),
        )

        desired_qty = max(
            0.0,
            float(
                self._dispatch()._done_qty(wo)
                or 0.0
            ),
        )

        if target_qty > 0.0:
            desired_qty = min(
                desired_qty,
                target_qty,
            )

        posted_before = max(
            0.0,
            float(
                production.qty_produced or 0.0
            ),
        )

        result["desired_qty"] = desired_qty
        result["posted_before"] = posted_before
        result["posted_after"] = posted_before

        rounding = 0.01

        try:
            if (
                production.product_uom_id
                and production.product_uom_id.rounding
            ):
                rounding = float(
                    production.product_uom_id.rounding
                )
        except Exception:
            rounding = 0.01

        # Already posted, including retry/idempotency cases.
        if (
            float_compare(
                desired_qty,
                posted_before,
                precision_rounding=rounding,
            )
            <= 0
        ):
            result["skipped_reason"] = (
                "already_posted"
            )

            _logger.info(
                "[SHOPFLOOR_STOCK] already posted | "
                "wo=%s mo=%s desired=%s posted=%s",
                wo.id,
                production.id,
                desired_qty,
                posted_before,
            )

            return result

        if production.state in (
            "draft",
            "cancel",
            "cancelled",
        ):
            raise UserError(
                "Comanda de producție %s nu permite "
                "înregistrarea stocului în starea curentă."
                % production.display_name
            )

        if production.state == "done":
            raise UserError(
                "Comanda de producție %s este deja închisă, "
                "dar cantitatea din stoc este mai mică decât "
                "progresul operației."
                % production.display_name
            )

        # Lot/serial handling needs a dedicated UI flow.
        if (
            production.product_id
            and production.product_id.tracking
            != "none"
        ):
            raise UserError(
                "Înregistrarea parțială automată nu este încă "
                "activată pentru produse urmărite prin lot "
                "sau număr de serie: %s."
                % production.product_id.display_name
            )

        open_finished_move = (
            production.move_finished_ids.filtered(
                lambda move:
                move.product_id == production.product_id
                and move.state not in (
                    "done",
                    "cancel",
                )
            )
        )

        if not open_finished_move:
            raise UserError(
                "Nu există o mișcare de produs finit deschisă "
                "pentru comanda %s."
                % production.display_name
            )

        # Cumulative quantity. Odoo will calculate only:
        #
        # qty_producing - qty_produced
        #
        # as the new stock delta. Snapshot full expected durations first because
        # native MRP recomputes duration_expected for the partial qty_producing.
        expected_duration_snapshot = self._snapshot_full_expected_durations(
            production
        )

        production.write({
            "qty_producing": desired_qty,
        })

        production._set_qty_producing()
        self._restore_full_expected_durations(
            production,
            expected_duration_snapshot,
        )

        _logger.warning(
            "[SHOPFLOOR_STOCK] posting inventory | "
            "wo=%s mo=%s desired=%s "
            "posted_before=%s delta=%s",
            wo.id,
            production.id,
            desired_qty,
            posted_before,
            desired_qty - posted_before,
        )

        production._post_inventory(
            cancel_backorder=False,
        )

        # Inventory posting can touch production quantities again; keep the same
        # full-duration snapshot after the complete transaction too.
        self._restore_full_expected_durations(
            production,
            expected_duration_snapshot,
        )

        self._invalidate_production(production)

        posted_after = max(
            0.0,
            float(
                production.qty_produced or 0.0
            ),
        )

        result["posted_after"] = posted_after
        result["posted_delta"] = max(
            0.0,
            posted_after - posted_before,
        )
        result["posted"] = (
            result["posted_delta"] > self.EPSILON
        )

        if (
            float_compare(
                posted_after,
                desired_qty,
                precision_rounding=rounding,
            )
            < 0
        ):
            raise UserError(
                "Stocul comenzii %s nu a fost actualizat "
                "complet. Așteptat: %s, înregistrat: %s."
                % (
                    production.display_name,
                    desired_qty,
                    posted_after,
                )
            )

        _logger.warning(
            "[SHOPFLOOR_STOCK] inventory posted | "
            "wo=%s mo=%s desired=%s "
            "posted_before=%s posted_after=%s "
            "posted_delta=%s",
            wo.id,
            production.id,
            desired_qty,
            posted_before,
            posted_after,
            result["posted_delta"],
        )

        return result
