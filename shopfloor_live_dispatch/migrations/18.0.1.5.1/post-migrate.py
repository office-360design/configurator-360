import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Production = env["mrp.production"].sudo()

    # If 1.5.0 was ever tested on another database, clear its now-removed
    # informational "waiting for child" marker. Waiting for a child MO is normal.
    stale_waiting = Production.search([
        ("shopfloor_auto_close_block_reason", "=", "open_child_production"),
    ])
    if stale_waiting:
        stale_waiting.write({
            "shopfloor_auto_close_blocked": False,
            "shopfloor_auto_close_block_reason": False,
            "shopfloor_auto_close_blocked_at": False,
            "shopfloor_auto_close_block_summary": False,
            "shopfloor_auto_close_block_details": False,
        })

    candidates = Production.search([
        ("state", "=", "to_close"),
    ])

    closed = 0
    errors = 0

    # A data-specific problem must never make a module upgrade fail. Each MO is
    # evaluated independently and failures are logged for later inspection.
    for mo in candidates:
        try:
            with cr.savepoint():
                results = mo._shopfloor_try_auto_close_ready_production()
                if any(row.get("closed") for row in results):
                    closed += 1
        except Exception:
            errors += 1
            _logger.exception(
                "SHOPFLOOR_MO_INTERVENTION migration: failed for mo=%s",
                mo.name,
            )

    blocked = Production.search_count([
        ("state", "=", "to_close"),
        ("shopfloor_auto_close_blocked", "=", True),
    ])

    _logger.warning(
        "SHOPFLOOR_MO_INTERVENTION migration: candidates=%s closed=%s blocked=%s errors=%s",
        len(candidates),
        closed,
        blocked,
        errors,
    )
