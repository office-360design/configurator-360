import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Production = env["mrp.production"].sudo()

    # 1.5.0/1.5.1 attempted to create administrator activities for these
    # warnings. The feature is intentionally removed; keep only the visual
    # marker and clean any activities left by a previous test database.
    Activity = env["mail.activity"].sudo()
    old_activities = Activity.search([
        ("res_model", "=", "mrp.production"),
        ("summary", "=", "Comandă de producție necesită intervenție"),
    ])
    if old_activities:
        old_activities.unlink()

    # A previous test build could have written the now-removed informational
    # marker. Waiting for a child/reper MO is normal and must not be shown as
    # an intervention warning.
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

    candidates = Production.search([("state", "=", "to_close")])
    closed = 0
    blocked = 0
    errors = 0

    for mo in candidates:
        try:
            with cr.savepoint():
                results = mo._shopfloor_try_auto_close_ready_production()
                if any(row.get("closed") for row in results):
                    closed += 1
                mo.invalidate_recordset()
                if mo.state == "to_close" and mo.shopfloor_auto_close_blocked:
                    blocked += 1
        except Exception:
            errors += 1
            _logger.exception(
                "SHOPFLOOR_MO_INTERVENTION migration: failed for mo=%s",
                mo.name,
            )

    _logger.warning(
        "SHOPFLOOR_MO_INTERVENTION migration: candidates=%s closed=%s blocked=%s errors=%s",
        len(candidates),
        closed,
        blocked,
        errors,
    )
