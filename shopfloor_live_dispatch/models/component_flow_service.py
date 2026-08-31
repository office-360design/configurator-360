import logging
import math

from odoo import fields, models
from odoo.exceptions import UserError
from odoo.tools.float_utils import float_round

_logger = logging.getLogger(__name__)


class ShopfloorComponentFlowService(models.AbstractModel):
    _name = "shopfloor.component.flow.service"
    _description = "Shopfloor Component Flow Service"

    EPSILON = 0.0001

    def _dispatch(self):
        return self.env["shopfloor.live.dispatch.service"]

    def round_parent_qty_down(
        self,
        parent_mo,
        qty,
    ):
        """
        Live-dispatch production quantities are whole pieces.

        Do not use product_uom_id.rounding here because Odoo's
        Units/Buc UoM may allow decimal precision such as 0.01.
        """
        try:
            qty = float(qty or 0.0)
        except Exception:
            qty = 0.0

        qty = max(
            0.0,
            qty,
        )

        return float(
            math.floor(
                qty + self.EPSILON
            )
        )

    def _lock_parent(self, parent_mo):
        if not parent_mo:
            return

        self.env.cr.execute(
            """
            SELECT id
              FROM mrp_production
             WHERE id = %s
             FOR UPDATE
            """,
            [parent_mo.id],
        )

    def _parent_target_qty(self, parent_mo):
        if not parent_mo:
            return 0.0

        for fname in [
            "product_qty",
            "qty_production",
            "product_uom_qty",
            "qty_to_produce",
        ]:
            try:
                if fname in parent_mo._fields:
                    value = float(parent_mo[fname] or 0.0)

                    if value > 0.0:
                        return value
            except Exception:
                pass

        return 0.0

    def _child_mos(self, parent_mo):
        Production = self.env["mrp.production"]

        if not parent_mo:
            return Production.browse([])

        try:
            children = parent_mo._get_cascade_child_mos()
        except Exception:
            children = Production.browse([])

            if "x_parent_mo_id" in Production._fields:
                children |= Production.search([
                    ("x_parent_mo_id", "=", parent_mo.id),
                ])

        return children.filtered(
            lambda child: child.state not in (
                "cancel",
                "cancelled",
            )
        )

    def _entry_workorder(self, parent_mo):
        Workorder = self.env["mrp.workorder"]

        if not parent_mo:
            return Workorder.browse([])

        workorders = Workorder.search([
            ("production_id", "=", parent_mo.id),
            ("state", "not in", ["cancel", "cancelled"]),
        ])

        if not workorders:
            return workorders

        roots = Workorder.browse([])

        for wo in workorders:
            try:
                predecessors = (
                    self._dispatch()._wo_predecessors(wo)
                    & workorders
                )

                if not predecessors:
                    roots |= wo
            except Exception:
                pass

        if roots:
            return roots.sorted(
                key=lambda rec: (
                    int(rec.sequence or 0)
                    if "sequence" in rec._fields
                    else 0,
                    rec.id,
                )
            )[:1]

        return workorders.sorted(
            key=lambda rec: (
                int(rec.sequence or 0)
                if "sequence" in rec._fields
                else 0,
                rec.id,
            )
        )[:1]

    def is_entry_workorder(self, wo):
        if not wo or not wo.production_id:
            return False

        entry_wo = self._entry_workorder(
            wo.production_id
        )

        return bool(
            entry_wo
            and entry_wo.id == wo.id
        )

    def _flow_for_group(
        self,
        parent_mo,
        product,
    ):
        Flow = self.env["shopfloor.component.flow"]

        flow = Flow.with_context(
            active_test=False,
        ).search([
            ("x_parent_mo_id", "=", parent_mo.id),
            ("x_product_id", "=", product.id),
        ], limit=1)

        if flow:
            return flow

        try:
            with self.env.cr.savepoint():
                return Flow.create({
                    "x_parent_mo_id": parent_mo.id,
                    "x_product_id": product.id,
                    "x_child_qty_per_parent": 1.0,
                })

        except Exception:
            flow = Flow.with_context(
                active_test=False,
            ).search([
                ("x_parent_mo_id", "=", parent_mo.id),
                ("x_product_id", "=", product.id),
            ], limit=1)

            if not flow:
                raise

            return flow

    def sync_parent_flows(
        self,
        parent_mo,
        lock_parent=False,
    ):
        Flow = self.env["shopfloor.component.flow"]
        Reservation = self.env[
            "shopfloor.component.reservation"
        ]

        if not parent_mo:
            return Flow.browse([])

        if lock_parent:
            self._lock_parent(parent_mo)

        children = self._child_mos(parent_mo)

        if not children:
            return Flow.browse([])

        parent_target = self._parent_target_qty(
            parent_mo
        )

        if parent_target <= 0.0:
            return Flow.browse([])

        entry_wo = self._entry_workorder(
            parent_mo
        )

        parent_done = 0.0

        if entry_wo:
            parent_done = self._dispatch()._done_qty(
                entry_wo
            )

        groups = {}

        for child in children:
            product = child.product_id

            if not product:
                continue

            group = groups.setdefault(
                product.id,
                {
                    "product": product,
                    "child_ids": [],
                    "target_qty": 0.0,
                    "released_qty": 0.0,
                },
            )

            child_target = self._parent_target_qty(
                child
            )

            child_released = (
                self._dispatch()
                ._released_qty_from_child_mo(child)
            )

            group["child_ids"].append(
                child.id
            )

            group["target_qty"] += max(
                child_target,
                0.0,
            )

            group["released_qty"] += max(
                child_released,
                0.0,
            )

        synced_flows = Flow.browse([])

        for group in groups.values():
            ratio = (
                group["target_qty"] / parent_target
                if parent_target > 0.0
                else 0.0
            )

            if ratio <= 0.0:
                continue

            flow = self._flow_for_group(
                parent_mo,
                group["product"],
            )

            active_reservations = Reservation.search([
                ("x_flow_id", "=", flow.id),
                ("x_state", "=", "reserved"),
            ])

            reserved_qty = sum(
                active_reservations.mapped(
                    "x_child_qty_reserved"
                )
            )

            consumed_qty = parent_done * ratio

            consumed_qty = min(
                consumed_qty,
                group["released_qty"],
            )

            flow.write({
                "active": True,
                "x_child_mo_ids": [
                    (
                        6,
                        0,
                        group["child_ids"],
                    )
                ],
                "x_child_qty_per_parent": ratio,
                "x_released_qty": group["released_qty"],
                "x_reserved_qty": reserved_qty,
                "x_consumed_qty": consumed_qty,
            })

            synced_flows |= flow

        old_flows = Flow.search([
            ("x_parent_mo_id", "=", parent_mo.id),
            ("id", "not in", synced_flows.ids or [0]),
            ("active", "=", True),
        ])

        for flow in old_flows:
            active_reservation = Reservation.search([
                ("x_flow_id", "=", flow.id),
                ("x_state", "=", "reserved"),
            ], limit=1)

            if not active_reservation:
                flow.write({
                    "active": False,
                    "x_released_qty": 0.0,
                    "x_reserved_qty": 0.0,
                    "x_consumed_qty": 0.0,
                })

        return synced_flows

    def sync_parents_for_child_mo(self, child_mo):
        Production = self.env["mrp.production"]

        if not child_mo:
            return Production.browse([])

        parents = Production.browse([])

        for fname in [
            "x_parent_mo_id",
            "x_parent_production_id",
            "x_parent_manufacturing_order_id",
        ]:
            try:
                if (
                    fname in child_mo._fields
                    and child_mo[fname]
                ):
                    parents |= child_mo[fname]
            except Exception:
                pass

        # Legacy fallback used by older linked child MOs.
        if not parents:
            try:
                if child_mo.origin:
                    parents |= Production.search([
                        ("name", "=", child_mo.origin),
                    ])
            except Exception:
                pass

        parents = parents.exists()

        for parent_mo in parents:
            self.sync_parent_flows(
                parent_mo,
                lock_parent=False,
            )

        return parents

    def available_parent_qty(
        self,
        parent_mo,
        lock_parent=False,
        sync=True,
    ):
        Flow = self.env[
            "shopfloor.component.flow"
        ]

        if not parent_mo:
            return False, 0.0

        if lock_parent:
            self._lock_parent(parent_mo)

        if sync:
            flows = self.sync_parent_flows(
                parent_mo,
                lock_parent=False,
            )
        else:
            # Read-only path used while generating the operation picker.
            flows = Flow.search([
                ("x_parent_mo_id", "=", parent_mo.id),
                ("active", "=", True),
            ])

        if not flows:
            return False, 0.0

        capacities = []

        for flow in flows:
            ratio = float(
                flow.x_child_qty_per_parent or 0.0
            )

            if ratio <= 0.0:
                capacities.append(0.0)
                continue

            capacities.append(
                max(
                    0.0,
                    float(flow.x_available_qty or 0.0)
                    / ratio,
                )
            )

        if not capacities:
            return True, 0.0

        parent_target = self._parent_target_qty(
            parent_mo
        )

        capacity = min(capacities)

        if parent_target > 0.0:
            capacity = min(
                capacity,
                parent_target,
            )

        capacity = self.round_parent_qty_down(
            parent_mo,
            capacity,
        )

        return True, capacity

    def _refresh_reserved_quantities(self, flows):
        """
        Fast balance refresh.

        Does not rescan child MOs or terminal work orders.
        Released quantity is preserved from the last full synchronization.
        """
        Reservation = self.env[
            "shopfloor.component.reservation"
        ]

        dispatch_service = self._dispatch()
        flows = flows.exists()

        parent_done_cache = {}

        for flow in flows:
            active_lines = Reservation.search([
                ("x_flow_id", "=", flow.id),
                ("x_state", "=", "reserved"),
            ])

            reserved_qty = sum(
                float(
                    line.x_child_qty_reserved or 0.0
                )
                for line in active_lines
            )

            parent_mo = flow.x_parent_mo_id
            parent_done = 0.0

            if parent_mo:
                if parent_mo.id not in parent_done_cache:
                    entry_wo = self._entry_workorder(
                        parent_mo
                    )

                    if entry_wo:
                        parent_done_cache[parent_mo.id] = (
                            dispatch_service._done_qty(
                                entry_wo
                            )
                        )
                    else:
                        parent_done_cache[parent_mo.id] = 0.0

                parent_done = parent_done_cache[
                    parent_mo.id
                ]

            ratio = float(
                flow.x_child_qty_per_parent or 0.0
            )

            consumed_qty = max(
                0.0,
                parent_done * ratio,
            )

            released_qty = float(
                flow.x_released_qty or 0.0
            )

            if released_qty > 0.0:
                consumed_qty = min(
                    consumed_qty,
                    released_qty,
                )

            vals = {}

            if (
                abs(
                    float(flow.x_reserved_qty or 0.0)
                    - reserved_qty
                )
                > self.EPSILON
            ):
                vals["x_reserved_qty"] = reserved_qty

            if (
                abs(
                    float(flow.x_consumed_qty or 0.0)
                    - consumed_qty
                )
                > self.EPSILON
            ):
                vals["x_consumed_qty"] = consumed_qty

            if vals:
                flow.write(vals)

        return flows

    def reserve_for_session(
        self,
        sess,
        wo,
        requested_parent_qty,
    ):
        Reservation = self.env[
            "shopfloor.component.reservation"
        ]

        if not sess or not wo:
            return float(
                requested_parent_qty or 0.0
            )

        try:
            if (
                "x_is_helper_mode" in sess._fields
                and sess.x_is_helper_mode
            ):
                return float(
                    requested_parent_qty or 0.0
                )
        except Exception:
            pass

        # Components are reserved only when entering the parent routing.
        if not self.is_entry_workorder(wo):
            return float(
                requested_parent_qty or 0.0
            )

        parent_mo = wo.production_id

        self._lock_parent(parent_mo)

        existing = Reservation.search([
            ("x_session_id", "=", sess.id),
            ("x_workorder_id", "=", wo.id),
            ("x_state", "=", "reserved"),
        ])

        if existing:
            existing_quantities = existing.mapped(
                "x_parent_qty_reserved"
            )

            return min(
                existing_quantities
            ) if existing_quantities else 0.0

        has_gate, free_parent_qty = (
            self.available_parent_qty(
                parent_mo,
                lock_parent=False,
                sync=True,
            )
        )

        requested_parent_qty = max(
            0.0,
            float(requested_parent_qty or 0.0),
        )

        if not has_gate:
            return requested_parent_qty

        reserved_parent_qty = min(
            requested_parent_qty,
            free_parent_qty,
        )

        requested_parent_qty = self.round_parent_qty_down(
            parent_mo,
            requested_parent_qty,
        )

        free_parent_qty = self.round_parent_qty_down(
            parent_mo,
            free_parent_qty,
        )

        reserved_parent_qty = self.round_parent_qty_down(
            parent_mo,
            min(
                requested_parent_qty,
                free_parent_qty,
            ),
        )

        if reserved_parent_qty <= self.EPSILON:
            raise UserError(
                "Componentele necesare nu mai sunt disponibile. "
                "Reîncarcă lista de operații."
            )

        flows = self.env[
            "shopfloor.component.flow"
        ].search([
            ("x_parent_mo_id", "=", parent_mo.id),
            ("active", "=", True),
        ])

        for flow in flows:
            ratio = float(
                flow.x_child_qty_per_parent or 0.0
            )

            Reservation.create({
                "x_session_id": sess.id,
                "x_workorder_id": wo.id,
                "x_parent_mo_id": parent_mo.id,
                "x_flow_id": flow.id,
                "x_parent_qty_reserved": reserved_parent_qty,
                "x_child_qty_reserved": (
                    reserved_parent_qty * ratio
                ),
                "x_state": "reserved",
            })

        created_lines = Reservation.search([
            ("x_session_id", "=", sess.id),
            ("x_workorder_id", "=", wo.id),
            ("x_state", "=", "reserved"),
        ])

        self._refresh_reserved_quantities(
            created_lines.mapped("x_flow_id")
        )

        _logger.warning(
            "[COMPONENT_FLOW] reserved session=%s wo=%s "
            "parent_mo=%s parent_qty=%s",
            sess.id,
            wo.id,
            parent_mo.id,
            reserved_parent_qty,
        )

        return reserved_parent_qty

    def settle_session(
        self,
        sess,
        wo,
        parent_qty_done,
    ):
        Reservation = self.env[
            "shopfloor.component.reservation"
        ]

        result = {
            "line_count": 0,
            "parent_qty_done": 0.0,
        }

        if not sess or not wo:
            return result

        lines = Reservation.search([
            ("x_session_id", "=", sess.id),
            ("x_workorder_id", "=", wo.id),
            ("x_state", "=", "reserved"),
        ])

        if not lines:
            return result

        parent_mo = wo.production_id

        self._lock_parent(parent_mo)

        qty_done = max(
            0.0,
            float(parent_qty_done or 0.0),
        )

        for line in lines:
            parent_reserved = float(
                line.x_parent_qty_reserved or 0.0
            )

            parent_consumed = min(
                qty_done,
                parent_reserved,
            )

            if parent_reserved > self.EPSILON:
                ratio = (
                    float(line.x_child_qty_reserved or 0.0)
                    / parent_reserved
                )
            else:
                ratio = float(
                    line.x_flow_id.x_child_qty_per_parent
                    or 0.0
                )

            child_consumed = (
                parent_consumed * ratio
            )

            line.write({
                "x_parent_qty_consumed": parent_consumed,
                "x_child_qty_consumed": child_consumed,
                "x_state": (
                    "settled"
                    if parent_consumed > self.EPSILON
                    else "released"
                ),
                "x_release_reason": (
                    "finish_confirm"
                    if parent_consumed > self.EPSILON
                    else "zero_quantity"
                ),
                "x_settled_at": fields.Datetime.now(),
            })

        affected_flows = lines.mapped(
            "x_flow_id"
        )

        self._refresh_reserved_quantities(
            affected_flows
        )
        result["line_count"] = len(lines)
        result["parent_qty_done"] = qty_done

        _logger.warning(
            "[COMPONENT_FLOW] settled session=%s wo=%s "
            "qty_done=%s lines=%s",
            sess.id,
            wo.id,
            qty_done,
            len(lines),
        )

        return result

    def release_session(
        self,
        sess,
        reason="session_cancelled",
    ):
        Reservation = self.env[
            "shopfloor.component.reservation"
        ]

        if not sess:
            return 0

        lines = Reservation.search([
            ("x_session_id", "=", sess.id),
            ("x_state", "=", "reserved"),
        ])

        if not lines:
            return 0

        parent_mos = lines.mapped(
            "x_parent_mo_id"
        )

        # Serialize reservation changes for each parent MO.
        for parent_mo in parent_mos:
            self._lock_parent(parent_mo)

        affected_flows = lines.mapped(
            "x_flow_id"
        )

        lines.write({
            "x_state": "released",
            "x_release_reason": reason,
            "x_settled_at": fields.Datetime.now(),
        })

        # Fast refresh only. Do not rescan child MOs during Cancel.
        self._refresh_reserved_quantities(
            affected_flows
        )

        _logger.warning(
            "[COMPONENT_FLOW] released session=%s "
            "reason=%s lines=%s",
            sess.id,
            reason,
            len(lines),
        )

        return len(lines)
