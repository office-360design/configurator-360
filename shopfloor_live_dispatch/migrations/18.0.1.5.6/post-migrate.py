import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)

_V155_MARKER = "# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V155"
_V156_MARKER = "# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V156"


def _ensure_total_duration_view(env):
    """Attach the duration fields to the Studio form that owns x_progress_pct.

    x_progress_pct is added by an Odoo Studio inherited view in this database,
    not by the base mrp.production form. A static view inheriting the base form
    therefore cannot xpath that field during registry loading. Create/update the
    small extension only after the registry is loaded and inherit the Studio view
    that actually contains x_progress_pct.
    """
    View = env["ir.ui.view"].sudo()

    candidates = View.search([
        ("model", "=", "mrp.production"),
        ("type", "=", "form"),
        ("arch_db", "ilike", "x_progress_pct"),
    ], order="priority desc, id desc")

    studio_view = False
    for candidate in candidates:
        arch = candidate.arch_db or ""
        if candidate.inherit_id and 'name="x_progress_pct"' in arch:
            studio_view = candidate
            break

    if not studio_view:
        _logger.warning(
            "SHOPFLOOR_TOTAL_DURATIONS: no inherited mrp.production form containing x_progress_pct was found"
        )
        return False

    arch = """
<xpath expr="//field[@name='x_progress_pct']" position="after">
    <field name="shopfloor_total_duration_real" widget="float_time" readonly="1"/>
    <field name="shopfloor_total_duration_expected" widget="float_time" readonly="1"/>
</xpath>
""".strip()

    view = View.search([
        ("name", "=", "mrp.production.form.total.durations"),
        ("model", "=", "mrp.production"),
    ], limit=1)

    vals = {
        "name": "mrp.production.form.total.durations",
        "model": "mrp.production",
        "type": "form",
        "inherit_id": studio_view.id,
        "priority": 900,
        "arch_db": arch,
        "active": True,
    }

    if view:
        view.write(vals)
    else:
        view = View.create(vals)

    # Keep ownership under this module so uninstall/update lifecycle remains sane.
    ModelData = env["ir.model.data"].sudo()
    xmlid = ModelData.search([
        ("module", "=", "shopfloor_live_dispatch"),
        ("name", "=", "view_mrp_production_form_total_durations"),
    ], limit=1)
    if xmlid:
        if xmlid.model != "ir.ui.view" or xmlid.res_id != view.id:
            xmlid.write({"model": "ir.ui.view", "res_id": view.id})
    else:
        ModelData.create({
            "module": "shopfloor_live_dispatch",
            "name": "view_mrp_production_form_total_durations",
            "model": "ir.ui.view",
            "res_id": view.id,
            "noupdate": True,
        })

    _logger.warning(
        "SHOPFLOOR_TOTAL_DURATIONS: view id=%s now inherits Studio view id=%s (%s)",
        view.id,
        studio_view.id,
        studio_view.name,
    )
    return True


def _ensure_default_product_grouping(env):
    """Keep Group By > Product active when the dashboard action opens."""
    Actions = env["ir.actions.actions"].sudo()
    generic = Actions.browse(1441).exists()
    if not generic:
        _logger.warning("SHOPFLOOR_FINALIZED_GROUPING: action 1441 not found")
        return False

    if generic.type == "ir.actions.act_window":
        action = env["ir.actions.act_window"].sudo().browse(1441).exists()
        if not action:
            return False
        context_text = (action.context or "{}").strip()
        if context_text in ("", "{}"):
            action.write({"context": "{'search_default_product': 1}"})
            return True
        if "search_default_product" not in context_text and context_text.startswith("{") and context_text.endswith("}"):
            inner = context_text[1:-1].strip()
            comma = ", " if inner and not inner.endswith(",") else " "
            action.write({"context": "{%s%s'search_default_product': 1}" % (inner, comma)})
        return True

    if generic.type != "ir.actions.server":
        _logger.warning(
            "SHOPFLOOR_FINALIZED_GROUPING: action 1441 unsupported type=%s",
            generic.type,
        )
        return False

    server = env["ir.actions.server"].sudo().browse(1441).exists()
    if not server or server.state != "code":
        return False

    code = server.code or ""
    # v1.5.5 appended its block at the end. Replace it with a simpler block that
    # does not depend on isinstance being available in safe_eval.
    if _V155_MARKER in code:
        code = code.split(_V155_MARKER, 1)[0].rstrip()
    if _V156_MARKER in code:
        return True

    patch = r'''

# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V156
# Activate the standard mrp.production search filter named "product".
if action:
    _shopfloor_ctx = action.get("context") or {}
    try:
        _shopfloor_ctx["search_default_product"] = 1
    except Exception:
        _shopfloor_ctx = {"search_default_product": 1}
    action["context"] = _shopfloor_ctx
'''
    server.write({"code": code.rstrip() + patch})
    _logger.warning(
        "SHOPFLOOR_FINALIZED_GROUPING: server action id=%s patched for default Product grouping",
        server.id,
    )
    return True


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    duration_view_ok = _ensure_total_duration_view(env)
    grouping_ok = _ensure_default_product_grouping(env)
    _logger.warning(
        "SHOPFLOOR v1.5.6 migration: duration_view_ok=%s grouping_ok=%s",
        duration_view_ok,
        grouping_ok,
    )
