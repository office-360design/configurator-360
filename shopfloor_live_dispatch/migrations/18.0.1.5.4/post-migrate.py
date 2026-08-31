import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def _set_default_product_grouping(env):
    """Make the dashboard's finalized-products action group by product by default."""
    Action = env["ir.actions.act_window"].sudo()

    # The Studio dashboard button currently points to action 1441 in this DB.
    # Keep name-based fallbacks so the migration remains usable if the numeric ID
    # changes after a database copy/import.
    action = Action.browse(1441).exists()
    if action and action.res_model != "mrp.production":
        action = Action.browse()

    if not action:
        for name in (
            "Comenzi Produse Finalizate",
            "Comenzi finalizate",
            "Comenzi Finalizate",
        ):
            action = Action.search([
                ("res_model", "=", "mrp.production"),
                ("name", "=", name),
            ], limit=1)
            if action:
                break

    if not action:
        _logger.warning(
            "SHOPFLOOR_FINALIZED_GROUPING migration: finalized-products action not found"
        )
        return False

    context_text = (action.context or "{}").strip()
    if not context_text:
        context_text = "{}"

    # Preserve any Studio expressions already present in the context. Appending
    # the key at the end of a dict literal also intentionally overrides an older
    # group_by value without evaluating dynamic context expressions.
    if context_text.startswith("{") and context_text.endswith("}"):
        inner = context_text[1:-1].strip()
        if not inner:
            suffix = ""
        elif inner.endswith(","):
            suffix = " "
        else:
            suffix = ", "
        new_context = "{%s%s'group_by': ['product_id']}" % (inner, suffix)
        action.write({"context": new_context})
        _logger.warning(
            "SHOPFLOOR_FINALIZED_GROUPING migration: action=%s id=%s context=%s",
            action.name,
            action.id,
            new_context,
        )
        return True

    _logger.warning(
        "SHOPFLOOR_FINALIZED_GROUPING migration: unsupported context on action=%s id=%s: %s",
        action.name,
        action.id,
        context_text,
    )
    return False


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Production = env["mrp.production"].sudo()

    # Backfill the waiting marker for MOs such as WH/MO/00756 that were already
    # sitting in to_close before this field became persistent.
    candidates = Production.search([("state", "=", "to_close")])
    waiting_count = 0
    cleared_count = 0
    errors = 0

    for mo in candidates:
        try:
            with cr.savepoint():
                if mo._shopfloor_all_workorders_closed():
                    waiting = mo._shopfloor_open_child_producers()
                else:
                    waiting = Production.browse()

                if waiting:
                    mo._shopfloor_clear_auto_close_block()
                    mo._shopfloor_set_waiting_children(waiting)
                    waiting_count += 1
                else:
                    mo._shopfloor_clear_waiting_children()
                    cleared_count += 1
        except Exception:
            errors += 1
            _logger.exception(
                "SHOPFLOOR_WAITING_CHILDREN migration: failed for mo=%s",
                mo.name,
            )

    grouping_updated = _set_default_product_grouping(env)

    _logger.warning(
        "SHOPFLOOR_WAITING_CHILDREN migration: candidates=%s waiting=%s cleared=%s errors=%s grouping_updated=%s",
        len(candidates),
        waiting_count,
        cleared_count,
        errors,
        grouping_updated,
    )
