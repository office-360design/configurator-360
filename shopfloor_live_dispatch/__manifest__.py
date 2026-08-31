{
    "name": "Shopfloor Live Dispatch",
    "version": "18.0.1.5.15",
    "category": "Manufacturing",
    "summary": "Moves shopfloor dispatch server-action logic into Python module methods.",
    "depends": [
        "base",
        "hr",
        "mrp",
        "mrp_workorder",
    ],
    "data": [
        "security/ir.model.access.csv",
        "views/dispatch_picker_views.xml",
        "views/help_picker_views.xml",
        "views/other_picker_views.xml",
        "views/mrp_production_auto_close_views.xml",
        "views/force_close_wizard_views.xml",
        "views/reporting_correction_wizard_views.xml",
        "data/nightly_auto_stop_cron.xml",
    ],
    "installable": True,
    "application": False,
    "license": "LGPL-3",
    "assets": {
        "web.assets_backend": [
            "shopfloor_live_dispatch/static/src/scss/gantt_colors.scss",
        ],
    },
}
