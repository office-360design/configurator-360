import logging

from odoo import SUPERUSER_ID, api


_logger = logging.getLogger(__name__)

_SERVER_ACTION_XMLID = "shopfloor_live_dispatch.action_server_correct_reporting_slot"
_VIEW_XMLID = "shopfloor_live_dispatch.view_x_wo_emp_slot_reporting_correction"
_WIZARD_ACTION_XMLID = "shopfloor_live_dispatch.action_shopfloor_reporting_correction_wizard"


def _xmlid_record(env, xmlid):
    try:
        return env.ref(xmlid).sudo()
    except Exception:
        return False


def _ensure_xmlid(env, module, name, model, res_id):
    data = env["ir.model.data"].sudo().search([
        ("module", "=", module),
        ("name", "=", name),
    ], limit=1)
    vals = {
        "module": module,
        "name": name,
        "model": model,
        "res_id": res_id,
        "noupdate": True,
    }
    if data:
        data.write(vals)
    else:
        env["ir.model.data"].sudo().create(vals)


def _ensure_server_action(env, slot_model):
    Server = env["ir.actions.server"].sudo()
    existing = _xmlid_record(env, _SERVER_ACTION_XMLID)

    code = '''if not records:\n    raise UserError("Selectați un interval de producție.")\nslot = records[:1]\naction = env.ref("%s").sudo().read()[0]\naction["context"] = {"default_slot_id": slot.id}\n''' % _WIZARD_ACTION_XMLID

    vals = {
        "name": "Corectează raportarea",
        "model_id": slot_model.id,
        "state": "code",
        "code": code,
        "binding_model_id": slot_model.id,
        "binding_type": "action",
        "binding_view_types": "list,form",
    }

    if existing and existing._name == "ir.actions.server":
        existing.write(vals)
        return existing

    action = Server.create(vals)
    _ensure_xmlid(
        env,
        "shopfloor_live_dispatch",
        "action_server_correct_reporting_slot",
        "ir.actions.server",
        action.id,
    )
    return action


def _find_target_form_view(env):
    View = env["ir.ui.view"].sudo()
    views = View.search([
        ("model", "=", "x_wo_emp_slot"),
        ("type", "=", "form"),
        ("active", "=", True),
    ], order="priority desc, id desc")

    candidates = []
    for view in views:
        arch = str(view.arch_db or "")
        if 'name="x_interval_qty_done"' not in arch and "name='x_interval_qty_done'" not in arch:
            continue
        candidates.append(view)

    if not candidates:
        return False

    primary = [view for view in candidates if getattr(view, "mode", False) == "primary"]
    return (primary or candidates)[0]


def _ensure_form_extension(env, target_view, server_action):
    View = env["ir.ui.view"].sudo()
    existing = _xmlid_record(env, _VIEW_XMLID)

    arch = '''<data>
        <xpath expr="//field[@name='x_interval_qty_done']" position="attributes">
            <attribute name="readonly">1</attribute>
        </xpath>
        <xpath expr="//field[@name='x_interval_qty_done']" position="after">
            <button name="%s"
                    type="action"
                    string="Corectează raportarea"
                    class="btn-secondary"
                    groups="mrp.group_mrp_manager"
                    invisible="x_state != 'done' or not x_workorder_id or x_interval_qty_done &lt;= 0"/>
        </xpath>
    </data>''' % server_action.id

    vals = {
        "name": "x_wo_emp_slot.form.reporting.correction",
        "model": "x_wo_emp_slot",
        "type": "form",
        "inherit_id": target_view.id,
        "priority": 200,
        "arch_db": arch,
        "active": True,
    }

    if existing and existing._name == "ir.ui.view":
        existing.write(vals)
        return existing

    view = View.create(vals)
    _ensure_xmlid(
        env,
        "shopfloor_live_dispatch",
        "view_x_wo_emp_slot_reporting_correction",
        "ir.ui.view",
        view.id,
    )
    return view


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    slot_model = env["ir.model"].sudo().search([
        ("model", "=", "x_wo_emp_slot"),
    ], limit=1)

    if not slot_model:
        _logger.warning(
            "SHOPFLOOR_REPORTING_CORRECTION: x_wo_emp_slot model not found; UI binding skipped"
        )
        return

    server_action = _ensure_server_action(env, slot_model)
    target_view = _find_target_form_view(env)

    if not target_view:
        _logger.warning(
            "SHOPFLOOR_REPORTING_CORRECTION: form view containing x_interval_qty_done not found; "
            "server action remains available through the Actions menu"
        )
        return

    view = _ensure_form_extension(env, target_view, server_action)
    _logger.info(
        "SHOPFLOOR_REPORTING_CORRECTION: installed server_action=%s target_view=%s extension_view=%s",
        server_action.id,
        target_view.id,
        view.id,
    )
