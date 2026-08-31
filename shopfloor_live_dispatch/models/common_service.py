import logging

from odoo import models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ShopfloorLiveCommonService(models.AbstractModel):
    _name = "shopfloor.live.common.service"
    _description = "Shopfloor Live Common Helpers"

    def has_field(self, rec, field_name):
        try:
            return bool(rec) and field_name in rec._fields
        except Exception:
            return False

    def field_exists(self, model_or_rec, field_name):
        try:
            return field_name in model_or_rec._fields
        except Exception:
            return False

    def float_field(self, rec, field_name, default=0.0):
        try:
            if rec and self.has_field(rec, field_name):
                return float(rec[field_name] or default)
        except Exception:
            pass

        return default

    def now(self):
        now = False

        try:
            now = self.env.cr.now()
        except Exception:
            now = False

        if not now:
            raise UserError("Could not determine current time.")

        return now

    def minutes_between(self, start_dt, end_dt):
        if not start_dt or not end_dt:
            return 0.0

        try:
            if end_dt <= start_dt:
                return 0.0

            delta = end_dt - start_dt

            return max(
                0.0,
                (
                    delta.days * 86400
                    + delta.seconds
                    + delta.microseconds / 1000000.0
                ) / 60.0,
            )

        except Exception:
            return 0.0

    def html_escape(self, value):
        txt = str(value or "")

        txt = txt.replace("&", "&amp;")
        txt = txt.replace("<", "&lt;")
        txt = txt.replace(">", "&gt;")
        txt = txt.replace('"', "&quot;")
        txt = txt.replace("'", "&#x27;")

        return txt

    def fmt_qty_display(self, qty):
        try:
            qty = float(qty or 0.0)

            if abs(qty - int(qty)) < 0.0001:
                return str(int(qty))

            return str(round(qty, 2))

        except Exception:
            return str(qty or 0)

    def close_action(self):
        return {
            "type": "ir.actions.act_window_close",
        }

    def open_shopfloor_session_action(
        self,
        sess,
        name="Shopfloor session",
        target="current",
    ):
        if not sess:
            raise UserError("Missing shopfloor session.")

        return self.open_record_action(
            name=name,
            res_model="x_shopfloor_session",
            res_id=sess.id,
            view_mode="form",
            target=target,
        )

    def open_record_action(
        self,
        name,
        res_model,
        res_id,
        view_mode="form",
        target="current",
    ):
        return {
            "type": "ir.actions.act_window",
            "name": name,
            "res_model": res_model,
            "view_mode": view_mode,
            "res_id": res_id,
            "target": target,
        }

    def find_hub_for_session(self, sess):
        if not sess:
            return False

        Hub = self.env["x_worker_hub"]
        hub = False

        terminal_name = False
        zone = False

        try:
            if self.has_field(sess, "x_terminal_name") and sess.x_terminal_name:
                terminal_name = sess.x_terminal_name
        except Exception:
            terminal_name = False

        try:
            if self.has_field(sess, "x_zone_id") and sess.x_zone_id:
                zone = sess.x_zone_id
        except Exception:
            zone = False

        try:
            domain = []

            if terminal_name:
                domain.append(("x_device_name", "=", terminal_name))

            if zone:
                domain.append(("x_zone_id", "=", zone.id))

            if domain:
                hub = Hub.search(domain, limit=1)

            if not hub and terminal_name:
                hub = Hub.search(
                    [("x_device_name", "=", terminal_name)],
                    limit=1,
                )

            if not hub and zone:
                hub = Hub.search(
                    [("x_zone_id", "=", zone.id)],
                    limit=1,
                )

        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_COMMON] hub lookup failed session=%s err=%s",
                sess.id if sess else False,
                exc,
            )
            hub = False

        return hub

    def find_hub_for_popup(self, popup):
        if not popup:
            return False

        try:
            if self.has_field(popup, "x_hub_id") and popup.x_hub_id:
                return popup.x_hub_id
        except Exception:
            pass

        try:
            if self.has_field(popup, "x_session_id") and popup.x_session_id:
                return self.find_hub_for_session(popup.x_session_id)
        except Exception:
            pass

        return False

    def open_hub_action(self, hub):
        if not hub:
            return self.close_action()

        return self.open_record_action(
            name="Worker hub",
            res_model="x_worker_hub",
            res_id=hub.id,
            view_mode="form",
            target="current",
        )
