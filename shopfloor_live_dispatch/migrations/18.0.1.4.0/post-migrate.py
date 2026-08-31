import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Production = env["mrp.production"].sudo()

    candidates = Production.search([
        ("state", "=", "to_close"),
    ])

    if not candidates:
        return

    results = candidates._shopfloor_try_auto_close_ready_production()
    closed = [row for row in results if row.get("closed")]

    _logger.warning(
        "SHOPFLOOR_MO_BACKSTOP migration: candidates=%s closed=%s",
        len(candidates),
        len(closed),
    )
