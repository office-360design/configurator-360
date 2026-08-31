import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Production = env["mrp.production"].sudo()

    # Existing intervention warnings were stored before the form stopped
    # repeating the first consumption issue in both summary and details.
    # Normalize only those records; do not accept warnings or force-close MOs.
    warnings = Production.search([
        ("state", "=", "to_close"),
        ("shopfloor_auto_close_blocked", "=", True),
        ("shopfloor_auto_close_block_reason", "=", "consumption_warning"),
    ])

    updated = 0
    errors = 0

    for mo in warnings:
        try:
            with cr.savepoint():
                summary, details = mo._shopfloor_consumption_warning_text()
                mo.write({
                    "shopfloor_auto_close_block_summary": summary or False,
                    "shopfloor_auto_close_block_details": details or False,
                })
                updated += 1
        except Exception:
            errors += 1
            _logger.exception(
                "SHOPFLOOR_MO_WARNING_UI migration: failed for mo=%s",
                mo.name,
            )

    _logger.warning(
        "SHOPFLOOR_MO_WARNING_UI migration: candidates=%s updated=%s errors=%s",
        len(warnings),
        updated,
        errors,
    )
