import logging

from odoo import SUPERUSER_ID, api


_logger = logging.getLogger(__name__)


_ACTION_ID = 1441
_ACTION_NAME = "Admin Dashboard - Comenzi Productie Finalizate"
_VIEW_XMLID = "shopfloor_live_dispatch.view_mrp_production_completed_shopfloor_list"
_MARKER = "SHOPFLOOR_COMPLETED_ORDER_REFERENCE_V1514"


def _find_action(env):
    Server = env["ir.actions.server"].sudo()
    action = Server.browse(_ACTION_ID).exists()
    if action and action.name == _ACTION_NAME and action.state == "code":
        return action
    return Server.search([
        ("name", "=", _ACTION_NAME),
        ("model_id.model", "=", "x_shopfloor_admin_dashboard"),
        ("state", "=", "code"),
    ], limit=1)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    action = _find_action(env)

    if not action:
        _logger.warning(
            "SHOPFLOOR_COMPLETED_ORDER_REFERENCE: completed-MO dashboard action not found"
        )
        return

    try:
        env.ref(_VIEW_XMLID)
    except Exception:
        _logger.warning(
            "SHOPFLOOR_COMPLETED_ORDER_REFERENCE: dedicated list view %s not found",
            _VIEW_XMLID,
        )
        return

    code = action.code or ""
    if _MARKER in code:
        _logger.info(
            "SHOPFLOOR_COMPLETED_ORDER_REFERENCE: action already patched id=%s",
            action.id,
        )
        return

    patch = '''\n\n# %s\n# Use the dedicated completed-production list so the customer/order reference\n# is visible for both finished parent MOs and finished child/reper MOs.\ntry:\n    _shopfloor_completed_list_view = env.ref(%r)\nexcept Exception:\n    _shopfloor_completed_list_view = False\n\nif action and _shopfloor_completed_list_view:\n    action["views"] = [\n        (_shopfloor_completed_list_view.id, "list"),\n        (False, "kanban"),\n        (False, "form"),\n    ]\n''' % (_MARKER, _VIEW_XMLID)

    action.write({"code": code.rstrip() + patch + "\n"})
    _logger.info(
        "SHOPFLOOR_COMPLETED_ORDER_REFERENCE: patched action id=%s name=%s",
        action.id,
        action.name,
    )
