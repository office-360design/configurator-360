import logging

from odoo import SUPERUSER_ID, api


_logger = logging.getLogger(__name__)


_TARGET_ACTIONS = (
    (1340, "Admin Dashboard - Modifica Planificarea"),
    (1428, "Admin Dashboard - Operatiuni planificate"),
)


def _patch_window_action_read(server_action):
    """Allow dashboard server actions to read only their target act_window.

    Normal production users must not receive generic read ACLs on
    ``ir.actions.act_window``.  These two dashboard actions only need to load the
    definition of an already-known window action and return it to the client, so
    elevate that narrow metadata read instead.
    """
    if not server_action or server_action.state != "code":
        return False

    code = server_action.code or ""

    if 'env["ir.actions.act_window"].sudo()' in code or "env['ir.actions.act_window'].sudo()" in code:
        return True

    replacements = (
        (
            'ActionWindow = env["ir.actions.act_window"]',
            'ActionWindow = env["ir.actions.act_window"].sudo()',
        ),
        (
            "ActionWindow = env['ir.actions.act_window']",
            "ActionWindow = env['ir.actions.act_window'].sudo()",
        ),
    )

    new_code = code
    for old, new in replacements:
        new_code = new_code.replace(old, new)

    if new_code == code:
        _logger.warning(
            "SHOPFLOOR_PLANNING_ACTION_ACCESS: no patch point found for server action id=%s name=%s",
            server_action.id,
            server_action.name,
        )
        return False

    server_action.write({"code": new_code})
    _logger.info(
        "SHOPFLOOR_PLANNING_ACTION_ACCESS: patched server action id=%s name=%s",
        server_action.id,
        server_action.name,
    )
    return True


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Server = env["ir.actions.server"].sudo()

    patched = 0
    failed = 0

    for action_id, expected_name in _TARGET_ACTIONS:
        action = Server.browse(action_id).exists()

        # Keep a name fallback for copied/restored databases where IDs differ.
        if not action or action.name != expected_name:
            action = Server.search([
                ("name", "=", expected_name),
                ("model_id.model", "=", "x_shopfloor_admin_dashboard"),
                ("state", "=", "code"),
            ], limit=1)

        if not action:
            failed += 1
            _logger.warning(
                "SHOPFLOOR_PLANNING_ACTION_ACCESS: server action not found id=%s name=%s",
                action_id,
                expected_name,
            )
            continue

        if _patch_window_action_read(action):
            patched += 1
        else:
            failed += 1

    _logger.info(
        "SHOPFLOOR_PLANNING_ACTION_ACCESS: patched=%s failed=%s",
        patched,
        failed,
    )
