import logging

from odoo import SUPERUSER_ID, api


_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Workorder = env["mrp.workorder"].sudo()

    # Repair only live-dispatch partial WOs. This avoids touching unrelated
    # standard-MRP work orders or intentional manual expected-duration edits.
    candidates = Workorder.search([
        ("state", "not in", ["done", "cancel"]),
        ("x_dispatch_qty_done", ">", 0.0),
        ("operation_id", "!=", False),
        ("workcenter_id", "!=", False),
    ])

    repaired = Workorder.browse([])

    for wo in candidates:
        try:
            target_qty = float(wo.qty_production or 0.0)
            producing_qty = float(wo.qty_producing or 0.0)
            dispatch_done = float(wo.x_dispatch_qty_done or 0.0)
        except Exception:
            continue

        if not (
            target_qty > 0.0
            and 0.0 < dispatch_done < target_qty
            and 0.0 < producing_qty < target_qty
        ):
            continue

        try:
            full_expected = float(wo._shopfloor_expected_total_minutes() or 0.0)
            current_expected = float(wo.duration_expected or 0.0)
        except Exception:
            continue

        if full_expected <= 0.0 or full_expected <= current_expected + 0.005:
            continue

        wo.with_context(
            bypass_duration_calculation=True,
            shopfloor_migration_restore_full_expected=True,
        ).write({
            "duration_expected": full_expected,
        })
        repaired |= wo

        _logger.warning(
            "SHOPFLOOR_DURATION_MIGRATION: restored WO %s (%s) expected "
            "duration from %s to %s minutes; qty_producing=%s/%s dispatch_done=%s",
            wo.id,
            wo.display_name,
            current_expected,
            full_expected,
            producing_qty,
            target_qty,
            dispatch_done,
        )

    # x_wo_emp_slot.x_duration_expected is a stored related field, so the WO
    # write above also restores the slot's full Tp. Refresh open sessions as well
    # so operators already on the screen see the corrected remaining estimate.
    if repaired and "x_shopfloor_session" in env:
        Session = env["x_shopfloor_session"].sudo()
        sessions = Session.search([
            ("x_workorder_id", "in", repaired.ids),
        ])

        for session in sessions:
            wo = session.x_workorder_id
            if not wo:
                continue

            try:
                expected_remaining = float(
                    wo._shopfloor_expected_remaining_minutes() or 0.0
                )
            except Exception:
                continue

            if "x_expected_duration_min" in session._fields:
                session.write({
                    "x_expected_duration_min": expected_remaining,
                })

    _logger.info(
        "SHOPFLOOR_DURATION_MIGRATION: repaired %s live-dispatch partial WO(s)",
        len(repaired),
    )
