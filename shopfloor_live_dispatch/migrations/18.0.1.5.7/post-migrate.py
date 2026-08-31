import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)

_GROUP_MARKER = "# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V157"


def _ensure_total_duration_view(env):
    """Create the form extension against the Studio view that owns Progress (%)."""
    View = env["ir.ui.view"].sudo()

    studio_view = View.browse(4200).exists()
    if not (
        studio_view
        and studio_view.model == "mrp.production"
        and studio_view.type == "form"
        and studio_view.inherit_id
        and 'name="x_progress_pct"' in (studio_view.arch_db or "")
    ):
        studio_view = False
        candidates = View.search([
            ("model", "=", "mrp.production"),
            ("type", "=", "form"),
            ("arch_db", "ilike", "x_progress_pct"),
        ], order="priority desc, id desc")
        for candidate in candidates:
            if candidate.inherit_id and 'name="x_progress_pct"' in (candidate.arch_db or ""):
                studio_view = candidate
                break

    if not studio_view:
        _logger.warning(
            "SHOPFLOOR_TOTAL_DURATIONS v1.5.7: Studio view containing x_progress_pct not found"
        )
        return False

    arch = """
<xpath expr="//field[@name='x_progress_pct']" position="after">
    <field name="shopfloor_total_duration_real" widget="float_time" readonly="1"/>
    <field name="shopfloor_total_duration_expected" widget="float_time" readonly="1"/>
</xpath>
""".strip()

    # Reuse any view left by a previous attempt, regardless of XML-ID state.
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
        "SHOPFLOOR_TOTAL_DURATIONS v1.5.7: view=%s inherits Studio view=%s",
        view.id,
        studio_view.id,
    )
    return True


def _patch_finalized_dashboard_grouping(env):
    """Force the standard Product group-by filter on the dashboard result action."""
    Generic = env["ir.actions.actions"].sudo()
    generic = Generic.browse(1441).exists()
    if not generic:
        _logger.warning("SHOPFLOOR_FINALIZED_GROUPING v1.5.7: action 1441 not found")
        return False

    if generic.type == "ir.actions.act_window":
        action = env["ir.actions.act_window"].sudo().browse(1441).exists()
        if not action:
            return False
        context_text = (action.context or "{}").strip()
        if "search_default_product" in context_text:
            return True
        if context_text.startswith("{") and context_text.endswith("}"):
            inner = context_text[1:-1].strip()
            if inner and not inner.endswith(","):
                inner += ","
            new_context = "{%s%s'search_default_product': 1}" % (
                inner,
                " " if inner else "",
            )
            action.write({"context": new_context})
            return True
        _logger.warning(
            "SHOPFLOOR_FINALIZED_GROUPING v1.5.7: unsupported act_window context=%s",
            context_text,
        )
        return False

    if generic.type != "ir.actions.server":
        _logger.warning(
            "SHOPFLOOR_FINALIZED_GROUPING v1.5.7: action 1441 type=%s unsupported",
            generic.type,
        )
        return False

    server = env["ir.actions.server"].sudo().browse(1441).exists()
    if not server or server.state != "code":
        _logger.warning(
            "SHOPFLOOR_FINALIZED_GROUPING v1.5.7: server action missing or state=%s",
            server.state if server else False,
        )
        return False

    code = server.code or ""
    # Remove previous experimental patches so only one deterministic block remains.
    for old_marker in (
        "# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V155",
        "# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V156",
        _GROUP_MARKER,
    ):
        if old_marker in code:
            code = code.split(old_marker, 1)[0].rstrip()

    patch = r'''

# SHOPFLOOR_DEFAULT_PRODUCT_GROUPING_V157
# Keep the normal mrp.production Product group-by active when this dashboard
# server action returns its window action.
if action:
    _shopfloor_ctx = action.get("context") or {}
    try:
        _shopfloor_ctx.update({"search_default_product": 1})
    except Exception:
        _shopfloor_ctx = {"search_default_product": 1}
    action["context"] = _shopfloor_ctx
'''
    server.write({"code": code.rstrip() + patch})
    _logger.warning(
        "SHOPFLOOR_FINALIZED_GROUPING v1.5.7: patched server action id=%s name=%s",
        server.id,
        server.name,
    )
    return True


def _normalize_consumption_warnings(env):
    Production = env["mrp.production"].sudo()
    warnings = Production.search([
        ("shopfloor_auto_close_blocked", "=", True),
        ("shopfloor_auto_close_block_reason", "=", "consumption_warning"),
    ])
    changed = 0
    for mo in warnings:
        try:
            with env.cr.savepoint():
                summary, details = mo._shopfloor_consumption_warning_text()
                vals = {}
                if mo.shopfloor_auto_close_block_summary != (summary or False):
                    vals["shopfloor_auto_close_block_summary"] = summary or False
                if mo.shopfloor_auto_close_block_details != (details or False):
                    vals["shopfloor_auto_close_block_details"] = details or False
                if vals:
                    mo.write(vals)
                    changed += 1
        except Exception:
            _logger.exception(
                "SHOPFLOOR_MO_WARNING_UI v1.5.7: failed for mo=%s", mo.name
            )
    return changed


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    duration_ok = _ensure_total_duration_view(env)
    grouping_ok = _patch_finalized_dashboard_grouping(env)
    warnings_changed = _normalize_consumption_warnings(env)
    _logger.warning(
        "SHOPFLOOR v1.5.7 migration: duration_ok=%s grouping_ok=%s warnings_changed=%s",
        duration_ok,
        grouping_ok,
        warnings_changed,
    )
