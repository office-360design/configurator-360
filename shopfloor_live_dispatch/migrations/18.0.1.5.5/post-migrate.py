import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


_SERVER_ACTION_MARKER = "# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V155"


def _set_product_grouping_on_window_action(action):
    """Activate the existing search filter named `product` by default."""
    context_text = (action.context or "{}").strip()
    if not context_text:
        context_text = "{}"

    if not (context_text.startswith("{") and context_text.endswith("}")):
        _logger.warning(
            "SHOPFLOOR_FINALIZED_GROUPING: unsupported act_window context id=%s: %s",
            action.id,
            context_text,
        )
        return False

    inner = context_text[1:-1].strip()
    # Remove the previous migration's direct group_by when it is the only key.
    # For any richer context, simply add the search default; the named filter is
    # the same one the user selects manually from Group By > Product.
    if inner in (
        "'group_by': ['product_id']",
        '"group_by": ["product_id"]',
        "'group_by': 'product_id'",
        '"group_by": "product_id"',
    ):
        inner = ""

    if "'search_default_product'" in inner or '"search_default_product"' in inner:
        return True

    if not inner:
        new_context = "{'search_default_product': 1}"
    else:
        suffix = " " if inner.endswith(",") else ", "
        new_context = "{%s%s'search_default_product': 1}" % (inner, suffix)

    action.write({"context": new_context})
    _logger.warning(
        "SHOPFLOOR_FINALIZED_GROUPING: act_window id=%s updated context=%s",
        action.id,
        new_context,
    )
    return True


def _patch_server_action_grouping(server):
    """Post-process the dashboard server action's returned window action.

    The Studio dashboard button uses action id 1441, which is not an
    ir.actions.act_window in this database.  Appending this small post-processing
    block keeps the original server action intact and only activates the existing
    `product` search filter on the returned action.
    """
    if not server or server.state != "code":
        return False

    code = server.code or ""
    if _SERVER_ACTION_MARKER in code:
        return True

    patch = r'''

# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V155
# The dashboard's "Comenzi Produse Finalizate" button returns an act_window
# dictionary. Activate the standard mrp.production search filter named
# "product" exactly as when Group By > Product is selected manually.
if action and isinstance(action, dict):
    _shopfloor_action_context = action.get("context") or {}
    if isinstance(_shopfloor_action_context, dict):
        _shopfloor_action_context = dict(_shopfloor_action_context)
        _shopfloor_action_context["search_default_product"] = 1
        # Remove the old direct group_by override if this server action happened
        # to return it; search_default_product is the reliable Odoo mechanism.
        if _shopfloor_action_context.get("group_by") in (
            "product_id",
            ["product_id"],
        ):
            _shopfloor_action_context.pop("group_by", None)
        action["context"] = _shopfloor_action_context
    else:
        # Returned actions normally carry a dict context. If a Studio action
        # returns a textual context instead, preserve the current execution
        # context and still apply the requested default grouping.
        action["context"] = dict(env.context, search_default_product=1)
'''
    server.write({"code": code.rstrip() + patch})
    _logger.warning(
        "SHOPFLOOR_FINALIZED_GROUPING: patched server action id=%s name=%s",
        server.id,
        server.name,
    )
    return True


def _fix_default_product_grouping(env):
    """Handle the real dashboard action type instead of assuming act_window."""
    Actions = env["ir.actions.actions"].sudo()
    generic = Actions.browse(1441).exists()

    if generic:
        if generic.type == "ir.actions.act_window":
            window = env["ir.actions.act_window"].sudo().browse(1441).exists()
            return bool(window and _set_product_grouping_on_window_action(window))

        if generic.type == "ir.actions.server":
            server = env["ir.actions.server"].sudo().browse(1441).exists()
            return bool(server and _patch_server_action_grouping(server))

        _logger.warning(
            "SHOPFLOOR_FINALIZED_GROUPING: action 1441 has unsupported type=%s",
            generic.type,
        )

    # Fallback for database copies where IDs changed: first try a real window
    # action with the expected name.
    Window = env["ir.actions.act_window"].sudo()
    for name in (
        "Comenzi Produse Finalizate",
        "Comenzi finalizate",
        "Comenzi Finalizate",
    ):
        window = Window.search([
            ("res_model", "=", "mrp.production"),
            ("name", "=", name),
        ], limit=1)
        if window:
            return _set_product_grouping_on_window_action(window)

    return False


def _normalize_consumption_warnings(env):
    """Remove the duplicated first line from every stored warning, even DONE MOs."""
    Production = env["mrp.production"].sudo()
    warnings = Production.search([
        ("shopfloor_auto_close_blocked", "=", True),
        ("shopfloor_auto_close_block_reason", "=", "consumption_warning"),
    ])

    updated = 0
    errors = 0
    for mo in warnings:
        try:
            with env.cr.savepoint():
                summary, details = mo._shopfloor_consumption_warning_text()
                if (
                    mo.shopfloor_auto_close_block_summary != (summary or False)
                    or mo.shopfloor_auto_close_block_details != (details or False)
                ):
                    mo.write({
                        "shopfloor_auto_close_block_summary": summary or False,
                        "shopfloor_auto_close_block_details": details or False,
                    })
                    updated += 1
        except Exception:
            errors += 1
            _logger.exception(
                "SHOPFLOOR_MO_WARNING_UI v1.5.5: failed for mo=%s",
                mo.name,
            )

    return len(warnings), updated, errors


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})

    grouping_updated = _fix_default_product_grouping(env)
    warning_count, warning_updated, warning_errors = _normalize_consumption_warnings(env)

    _logger.warning(
        "SHOPFLOOR v1.5.5 migration: grouping_updated=%s warnings=%s updated=%s errors=%s",
        grouping_updated,
        warning_count,
        warning_updated,
        warning_errors,
    )
