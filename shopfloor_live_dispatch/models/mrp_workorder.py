import logging

from odoo import fields, models
from odoo.tools import float_round

_logger = logging.getLogger(__name__)


class MrpWorkorder(models.Model):
    _inherit = "mrp.workorder"

    def _shopfloor_standard_expected_minutes_for_qty(self, quantity):
        """Return Odoo's routing-based expected duration for ``quantity``.

        ``mrp.workorder.duration_expected`` is a stored computed field whose value
        can legitimately shrink when ``qty_producing`` is changed. Worker Hub,
        however, uses the field as the full operation norm and scales it itself
        for the remaining quantity. This helper reproduces the standard routing
        calculation while explicitly using the requested quantity, so callers can
        recover the full norm without mutating ``qty_producing``.
        """
        self.ensure_one()

        try:
            quantity = max(0.0, float(quantity or 0.0))
        except Exception:
            quantity = 0.0

        if quantity <= 0.0 or not self.workcenter_id or not self.operation_id:
            return 0.0

        workcenter = self.workcenter_id
        operation = self.operation_id

        try:
            time_cycle = float(operation.time_cycle or 0.0)
        except Exception:
            time_cycle = 0.0

        if time_cycle <= 0.0:
            try:
                if (
                    "x_time_cycle_seconds" in operation._fields
                    and operation.x_time_cycle_seconds
                ):
                    time_cycle = float(operation.x_time_cycle_seconds or 0.0) / 60.0
            except Exception:
                time_cycle = 0.0

        if time_cycle <= 0.0:
            return 0.0

        capacity = 1.0
        setup = 0.0
        cleanup = 0.0

        try:
            bom_qty = 1.0
            if "production_bom_id" in self._fields and self.production_bom_id:
                bom_qty = float(self.production_bom_id.product_qty or 1.0)
            elif self.production_id and self.production_id.bom_id:
                bom_qty = float(self.production_id.bom_id.product_qty or 1.0)

            capacity, setup, cleanup = workcenter._get_capacity(
                self.product_id,
                self.product_uom_id,
                bom_qty or 1.0,
            )
        except TypeError:
            try:
                capacity, setup, cleanup = workcenter._get_capacity(
                    self.product_id,
                    self.product_uom_id,
                )
            except Exception:
                capacity = 1.0
                setup = float(getattr(workcenter, "time_start", 0.0) or 0.0)
                cleanup = float(getattr(workcenter, "time_stop", 0.0) or 0.0)
        except Exception:
            capacity = 1.0
            setup = float(getattr(workcenter, "time_start", 0.0) or 0.0)
            cleanup = float(getattr(workcenter, "time_stop", 0.0) or 0.0)

        try:
            capacity = max(float(capacity or 0.0), 0.000001)
            setup = max(float(setup or 0.0), 0.0)
            cleanup = max(float(cleanup or 0.0), 0.0)
            efficiency = float(workcenter.time_efficiency or 100.0)
            if efficiency <= 0.0:
                efficiency = 100.0
        except Exception:
            return 0.0

        cycle_number = float_round(
            quantity / capacity,
            precision_digits=0,
            rounding_method="UP",
        )
        return max(
            0.0,
            setup + cleanup + cycle_number * time_cycle * 100.0 / efficiency,
        )

    def _shopfloor_expected_total_minutes(self):
        """Return the stable full-operation expected duration in minutes.

        Odoo recomputes ``duration_expected`` for ``qty_producing``. A terminal
        partial stock posting therefore turns a full norm (for example 16.67 min
        for 50 pieces) into the partial norm (3.33 min for 10 pieces). The custom
        production stack treats this field as the full norm and applies its own
        quantity scaling, so persisting the partial value causes double scaling.

        Only values that match Odoo's routing-based partial calculation are
        expanded back to the routing-based full duration. Explicit/manual values
        are preserved.
        """
        self.ensure_one()

        try:
            current = max(0.0, float(self.duration_expected or 0.0))
        except Exception:
            current = 0.0

        try:
            target_qty = max(0.0, float(self.qty_production or 0.0))
        except Exception:
            target_qty = 0.0

        try:
            producing_qty = max(0.0, float(self.qty_producing or 0.0))
        except Exception:
            producing_qty = 0.0

        full_standard = self._shopfloor_standard_expected_minutes_for_qty(target_qty)
        if full_standard <= 0.0:
            return current

        if 0.0 < producing_qty < target_qty:
            partial_standard = self._shopfloor_standard_expected_minutes_for_qty(
                producing_qty
            )
            tolerance = max(0.02, abs(partial_standard) * 0.01)
            if partial_standard > 0.0 and abs(current - partial_standard) <= tolerance:
                return full_standard

        return current if current > 0.0 else full_standard

    def _shopfloor_expected_remaining_minutes(self, remaining_qty=None):
        """Return expected minutes for the remaining live-dispatch quantity."""
        self.ensure_one()

        total_expected = self._shopfloor_expected_total_minutes()
        try:
            target_qty = max(0.0, float(self.qty_production or 0.0))
        except Exception:
            target_qty = 0.0

        if target_qty <= 0.0:
            return total_expected

        if remaining_qty is None:
            done_qty = 0.0
            try:
                if "x_dispatch_qty_done" in self._fields:
                    done_qty = max(done_qty, float(self.x_dispatch_qty_done or 0.0))
            except Exception:
                pass
            try:
                done_qty = max(done_qty, float(self.qty_produced or 0.0))
            except Exception:
                pass
            remaining_qty = max(0.0, target_qty - done_qty)
        else:
            try:
                remaining_qty = max(0.0, float(remaining_qty or 0.0))
            except Exception:
                remaining_qty = 0.0

        remaining_qty = min(remaining_qty, target_qty)
        return total_expected * remaining_qty / target_qty

    def _should_start_timer(self):
        """Let Worker Hub own employee productivity attribution.

        The factory uses shared Odoo logins while Worker Hub explicitly knows
        the selected ``hr.employee``. Native ``button_start`` timer creation can
        therefore fail or attribute time to the login user. START calls native
        Odoo logic with ``shopfloor_skip_native_timer`` and creates the correctly
        attributed productivity row afterwards in ``start_service``.
        """
        if self.env.context.get("shopfloor_skip_native_timer"):
            return False

        return super()._should_start_timer()

    def _shopfloor_auto_close_productions_after_finish(self):
        """Backstop MO closing after a WO becomes done.

        ``finish_service`` already tries to close the MO, but work orders may
        also be finished through other Odoo/Enterprise paths. Keeping the
        backstop at model level guarantees the same behavior regardless of the
        caller. The production helper itself performs all safety checks and
        leaves the MO in ``to_close`` whenever Odoo reports a consumption issue
        or another prerequisite is not satisfied.
        """
        productions = self.mapped("production_id").exists()
        if not productions:
            return

        try:
            productions.sudo()._shopfloor_try_auto_close_ready_production()
        except Exception:
            # Finishing the WO must never be rolled back by the defensive
            # backstop. The production remains visible as ``to_close`` and can
            # be investigated safely.
            _logger.exception(
                "SHOPFLOOR_MO_BACKSTOP: unexpected auto-close failure after WO finish; "
                "wo_ids=%s production_ids=%s",
                self.ids,
                productions.ids,
            )

    def button_finish(self, *args, **kwargs):
        result = super().button_finish(*args, **kwargs)
        self._shopfloor_auto_close_productions_after_finish()
        return result

    def button_done(self, *args, **kwargs):
        result = super().button_done(*args, **kwargs)
        self._shopfloor_auto_close_productions_after_finish()
        return result

    x_dispatch_qty_done = fields.Float(
        string="Live Dispatch Quantity Done",
        default=0.0,
        copy=False,
        help=(
            "Cumulative good quantity completed on this exact work order "
            "through the live shopfloor dispatcher."
        ),
    )
