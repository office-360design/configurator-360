import logging

from odoo import models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ShopfloorLiveDispatchService(models.AbstractModel):
    _name = "shopfloor.live.dispatch.service"
    _description = "Shopfloor Live Dispatch Service"

    def _common(self):
        return self.env["shopfloor.live.common.service"]

    def _has(self, rec, field_name):
        return self._common().has_field(rec, field_name)

    def _float_field(self, rec, field_name):
        return self._common().float_field(rec, field_name, 0.0)

    def _expected_total_minutes(self, wo):
        try:
            if wo and hasattr(wo, "_shopfloor_expected_total_minutes"):
                return max(0.0, float(wo._shopfloor_expected_total_minutes() or 0.0))
            if wo and self._has(wo, "duration_expected"):
                return max(0.0, float(wo.duration_expected or 0.0))
        except Exception:
            pass
        return 0.0

    def _get_operation_template(self, wo):
        try:
            if (
                wo
                and self._has(wo, "operation_id")
                and wo.operation_id
                and self._has(wo.operation_id, "x_operation_template_id")
                and wo.operation_id.x_operation_template_id
            ):
                return wo.operation_id.x_operation_template_id
        except Exception:
            pass
        return False

    # ------------------------------------------------------------
    # MAX ADDED - prioritize continuing an already-started part/MO
    # ------------------------------------------------------------
    def _wo_predecessors(self, wo):
        predecessors = self.env["mrp.workorder"]

        try:
            if self._has(wo, "blocked_by_workorder_ids") and wo.blocked_by_workorder_ids:
                predecessors |= wo.blocked_by_workorder_ids
        except Exception:
            pass

        try:
            if self._has(wo, "previous_workorder_id") and wo.previous_workorder_id:
                predecessors |= wo.previous_workorder_id
        except Exception:
            pass

        return predecessors

    def _wo_done_predecessor_depth(self, wo, seen_ids=None):
        if not wo:
            return 0

        if seen_ids is None:
            seen_ids = set()

        if wo.id in seen_ids:
            return 0

        seen_ids.add(wo.id)

        max_depth = 0

        predecessors = self._wo_predecessors(wo)

        for dep in predecessors:
            try:
                dep_state = dep.state if self._has(dep, "state") else False

                if dep_state in ("done", "cancel"):
                    depth = 1 + self._wo_done_predecessor_depth(dep, seen_ids)
                    if depth > max_depth:
                        max_depth = depth
            except Exception:
                pass

        # Fallback for routes where previous_workorder_id / blocked_by_workorder_ids
        # are not populated but sequence is reliable.
        if max_depth <= 0:
            try:
                mo = wo.production_id if self._has(wo, "production_id") else False
                seq = int(wo.sequence or 0) if self._has(wo, "sequence") else 0

                if mo and seq:
                    previous_done_count = self.env["mrp.workorder"].search_count([
                        ("production_id", "=", mo.id),
                        ("sequence", "<", seq),
                        ("state", "in", ["done", "cancel"]),
                    ])

                    if previous_done_count > max_depth:
                        max_depth = previous_done_count
            except Exception:
                pass

        return max_depth

    def _dependency_ready(self, wo):
        blockers = self.env["mrp.workorder"]

        try:
            if self._has(wo, "blocked_by_workorder_ids"):
                blockers |= wo.blocked_by_workorder_ids
        except Exception:
            pass

        try:
            if self._has(wo, "previous_workorder_id") and wo.previous_workorder_id:
                blockers |= wo.previous_workorder_id
        except Exception:
            pass

        for dep in blockers:
            try:
                dep_state = dep.state if self._has(dep, "state") else False
                if dep_state not in ("done", "cancel"):
                    return False
            except Exception:
                return False

        return True

    def _workorder_is_taken(self, wo):
        try:
            running_log = self.env["x_wo_time_log"].search(
                [
                    ("x_workorder_id", "=", wo.id),
                    ("x_state", "in", ["running", "pause"]),
                ],
                limit=1,
            )
            if running_log:
                return True
        except Exception:
            pass

        try:
            running_sess = self.env["x_shopfloor_session"].search(
                [
                    ("x_workorder_id", "=", wo.id),
                    ("x_state", "=", "active"),
                    ("x_ui_state", "=", "running"),
                ],
                limit=1,
            )
            if running_sess:
                return True
        except Exception:
            pass

        return False
    
    # ------------------------------------------------------------
    # MAX ADDED - only machine-block from WOs inside shopfloor plan
    # ------------------------------------------------------------
    def _wo_is_in_planification_scope(self, wo):
        if not wo:
            return False

        try:
            wo_state = wo.state if self._has(wo, "state") else False
            if wo_state in ("done", "cancel"):
                return False
        except Exception:
            pass

        mo = False

        try:
            mo = wo.production_id if self._has(wo, "production_id") else False
        except Exception:
            mo = False

        if not mo:
            return False

        try:
            mo_state = mo.state if self._has(mo, "state") else False
            if mo_state not in ("confirmed", "planned", "progress", "to_close"):
                return False
        except Exception:
            pass

        # This is the same shopfloor/planner availability flag used when
        # collecting candidate WOs.
        try:
            if self._has(mo, "x_include_in_planner"):
                return bool(mo.x_include_in_planner)
        except Exception:
            return False

        # If the field does not exist, do not block everything by accident.
        # Treat active MOs as in scope.
        return True


    def _workcenter_is_manual(self, workcenter):
        """
        The Manual workcenter is not a real capacity-limited machine.
        Multiple workers/operations may run on it at the same time.
        """
        if not workcenter:
            return False

        names = []

        for fname in [
            "name",
            "display_name",
            "x_name",
            "code",
            "x_code",
        ]:
            try:
                if self._has(workcenter, fname) and workcenter[fname]:
                    names.append(str(workcenter[fname]).strip().lower())
            except Exception:
                pass

        for value in names:
            if value == "manual":
                return True

        return False

    # ------------------------------------------------------------
    # MAX ADDED - block machine/workcenter if already occupied
    # ------------------------------------------------------------
    def _workcenter_is_occupied(self, wo):
        if not wo:
            return False

        workcenter = False

        try:
            if self._has(wo, "workcenter_id") and wo.workcenter_id:
                workcenter = wo.workcenter_id
        except Exception:
            workcenter = False

        if not workcenter:
            return False
        
        if self._workcenter_is_manual(workcenter):
            _logger.info(
                "[SHOPFLOOR_DISPATCH_SERVICE] skipping workcenter occupancy for Manual | "
                "candidate_wo=%s workcenter=%s",
                wo.id,
                workcenter.display_name,
            )
            return False

        # 1) Custom live logs: another running WO on the same workcenter.
        try:
            Log = self.env["x_wo_time_log"]

            running_logs = Log.search(
                [
                    ("x_state", "=", "running"),
                    ("x_end_dt", "=", False),
                    ("x_workorder_id", "!=", False),
                ],
                limit=200,
            )

            for lg in running_logs:
                try:
                    running_wo = lg.x_workorder_id
                    if not running_wo or running_wo.id == wo.id:
                        continue

                    if not self._wo_is_in_planification_scope(running_wo):
                        _logger.warning(
                            "[SHOPFLOOR_DISPATCH_SERVICE] ignoring occupied_by_wo outside planification | "
                            "candidate_wo=%s occupied_by_wo=%s",
                            wo.id,
                            running_wo.id,
                        )
                        continue

                    if (
                        self._has(running_wo, "workcenter_id")
                        and running_wo.workcenter_id
                        and running_wo.workcenter_id.id == workcenter.id
                    ):
                        _logger.warning(
                            "[SHOPFLOOR_DISPATCH_SERVICE] workcenter occupied by running log | "
                            "candidate_wo=%s workcenter=%s occupied_by_wo=%s employee=%s",
                            wo.id,
                            workcenter.display_name,
                            running_wo.id,
                            lg.x_employee_id.id if self._has(lg, "x_employee_id") and lg.x_employee_id else False,
                        )
                        return True
                except Exception:
                    pass

        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_DISPATCH_SERVICE] workcenter log occupancy check failed: %s",
                exc,
            )

        # 2) Running shopfloor sessions: another active session on same workcenter.
        try:
            Session = self.env["x_shopfloor_session"]

            running_sessions = Session.search(
                [
                    ("x_state", "=", "active"),
                    ("x_ui_state", "=", "running"),
                    ("x_workorder_id", "!=", False),
                ],
                limit=200,
            )

            for sess in running_sessions:
                try:
                    running_wo = sess.x_workorder_id
                    if not running_wo or running_wo.id == wo.id:
                        continue

                    if not self._wo_is_in_planification_scope(running_wo):
                        _logger.warning(
                            "[SHOPFLOOR_DISPATCH_SERVICE] ignoring occupied_by_session_wo outside planification | "
                            "candidate_wo=%s occupied_by_wo=%s session=%s",
                            wo.id,
                            running_wo.id,
                            sess.id,
                        )
                        continue

                    if (
                        self._has(running_wo, "workcenter_id")
                        and running_wo.workcenter_id
                        and running_wo.workcenter_id.id == workcenter.id
                    ):
                        return True
                except Exception:
                    pass

        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_DISPATCH_SERVICE] workcenter session occupancy check failed: %s",
                exc,
            )

        # 3) Native Odoo productivity fallback.
        try:
            Prod = self.env["mrp.workcenter.productivity"]

            open_prod = Prod.search(
                [
                    ("workcenter_id", "=", workcenter.id),
                    ("date_end", "=", False),
                    ("workorder_id", "!=", False),
                ],
                limit=20,
            )

            for prod in open_prod:
                try:
                    running_wo = prod.workorder_id
                    if not running_wo or running_wo.id == wo.id:
                        continue

                    if not self._wo_is_in_planification_scope(running_wo):
                        _logger.warning(
                            "[SHOPFLOOR_DISPATCH_SERVICE] ignoring occupied_by_productivity_wo outside planification | "
                            "candidate_wo=%s occupied_by_wo=%s",
                            wo.id,
                            running_wo.id,
                        )
                        continue

                    _logger.warning(
                        "[SHOPFLOOR_DISPATCH_SERVICE] workcenter occupied by open productivity | "
                        "candidate_wo=%s workcenter=%s occupied_by_wo=%s",
                        wo.id,
                        workcenter.display_name,
                        running_wo.id,
                    )
                    return True
                except Exception:
                    pass

        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_DISPATCH_SERVICE] workcenter productivity occupancy check failed: %s",
                exc,
            )

        return False

    def _employee_operation_ids(self, emp):
        allowed_ids = []
        best_ids = []

        try:
            if self._has(emp, "x_allowed_operations_id") and emp.x_allowed_operations_id:
                allowed_ids = emp.x_allowed_operations_id.ids
        except Exception:
            allowed_ids = []

        try:
            if self._has(emp, "x_best_operations_id") and emp.x_best_operations_id:
                best_ids = emp.x_best_operations_id.ids
        except Exception:
            best_ids = []

        return allowed_ids, best_ids

    def _target_qty(self, wo):
        # Prefer WO-level target if available.
        for fname in ["qty_production", "product_uom_qty", "x_qty_target"]:
            val = self._float_field(wo, fname)
            if val > 0.0:
                return val

        mo = wo.production_id if self._has(wo, "production_id") else False
        if mo:
            for fname in ["product_qty", "qty_production", "product_uom_qty"]:
                val = self._float_field(mo, fname)
                if val > 0.0:
                    return val

        return 0.0

    def _done_qty(self, wo):
        if not wo:
            return 0.0

        target = self._target_qty(wo)

        dispatch_done = self._float_field(
            wo,
            "x_dispatch_qty_done",
        )

        if dispatch_done > 0.0:
            if target > 0.0:
                dispatch_done = min(dispatch_done, target)

            return max(dispatch_done, 0.0)

        # Legacy fallback
        done = 0.0

        for fname in [
            "qty_produced",
            "x_qty_done",
            "qty_done",
        ]:
            val = self._float_field(wo, fname)

            if val > done:
                done = val

        if target > 0.0:
            done = min(done, target)

        return max(done, 0.0)

    def _remaining_qty(self, wo):
        target = self._target_qty(wo)
        done = self._done_qty(wo)

        remaining = target - done
        if remaining < 0.0:
            remaining = 0.0

        return remaining

    def _mo_target_qty(self, mo):
        if not mo:
            return 0.0

        for fname in [
            "product_qty",
            "qty_production",
            "product_uom_qty",
            "qty_to_produce",
        ]:
            val = self._float_field(mo, fname)

            if val > 0.0:
                return val

        return 0.0

    def _terminal_workorders_for_mo(self, mo):
        """
        Return the final workorder(s) of an MO.

        Normally there is one terminal WO. Multiple terminal WOs are
        supported by taking the lowest released quantity between them.
        """
        Workorder = self.env["mrp.workorder"]

        if not mo:
            return Workorder.browse([])

        workorders = Workorder.search([
            ("production_id", "=", mo.id),
            ("state", "not in", ["cancel", "cancelled"]),
        ])

        if not workorders:
            return workorders

        terminal_workorders = Workorder.browse([])

        try:
            if self._field_exists(
                Workorder,
                "blocked_by_workorder_ids",
            ):
                successors = Workorder.search([
                    ("production_id", "=", mo.id),
                    (
                        "blocked_by_workorder_ids",
                        "in",
                        workorders.ids,
                    ),
                ])

                predecessor_ids = set()

                for successor in successors:
                    predecessor_ids.update(
                        successor.blocked_by_workorder_ids.ids
                    )

                terminal_workorders = workorders.filtered(
                    lambda candidate:
                    candidate.id not in predecessor_ids
                )
        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_DISPATCH_SERVICE] terminal WO lookup failed | "
                "mo=%s error=%s",
                mo.id,
                exc,
            )

        if terminal_workorders:
            return terminal_workorders

        # Fallback for routes where dependency relations are missing.
        max_sequence = 0

        for workorder in workorders:
            try:
                sequence = int(workorder.sequence or 0)

                if sequence > max_sequence:
                    max_sequence = sequence
            except Exception:
                pass

        if max_sequence:
            terminal_workorders = workorders.filtered(
                lambda candidate:
                int(candidate.sequence or 0) == max_sequence
            )

        return terminal_workorders or workorders[-1:]

    def _released_qty_from_child_mo(self, child_mo):
        """
        Quantity of completed child parts available to the parent.

        Primary source:
            quantity actually posted through the child MO's
            finished-product stock moves.

        Legacy fallback:
            cumulative progress from the final child workorder.
        """
        if not child_mo:
            return 0.0

        target_qty = self._mo_target_qty(
            child_mo
        )

        posted_qty = self._float_field(
            child_mo,
            "qty_produced",
        )

        posted_qty = max(
            posted_qty,
            0.0,
        )

        if target_qty > 0.0:
            posted_qty = min(
                posted_qty,
                target_qty,
            )

        # Once anything has been posted, Odoo stock becomes
        # the source of truth.
        if posted_qty > 0.0:
            return posted_qty

        try:
            if child_mo.state == "done":
                return max(
                    target_qty,
                    0.0,
                )
        except Exception:
            pass

        # Legacy fallback for MOs that accumulated dispatch
        # progress before partial stock posting was installed.
        terminal_workorders = (
            self._terminal_workorders_for_mo(
                child_mo
            )
        )

        if not terminal_workorders:
            return 0.0

        released_quantities = []

        for terminal_wo in terminal_workorders:
            released_qty = self._done_qty(
                terminal_wo
            )

            try:
                if (
                    released_qty <= 0.0
                    and terminal_wo.state == "done"
                ):
                    released_qty = (
                        self._target_qty(
                            terminal_wo
                        )
                    )
            except Exception:
                pass

            released_quantities.append(
                max(
                    released_qty,
                    0.0,
                )
            )

        if not released_quantities:
            return 0.0

        released_qty = min(
            released_quantities
        )

        if target_qty > 0.0:
            released_qty = min(
                released_qty,
                target_qty,
            )

        return max(
            released_qty,
            0.0,
        )

    def _parent_component_capacity_qty(self, parent_mo):
        """
        Return:
            has_child_gate
            parent units currently supported by completed child parts

        Example:
            Parent target: 250
            Part 1 released: 150 / 250
            Part 2 released: 250 / 250
            Part 3 released: 250 / 250

            Parent capacity: 150
        """
        if not parent_mo:
            return False, 0.0

        children = self.env["mrp.production"].browse([])

        try:
            children = (
                parent_mo._get_cascade_child_mos()
            )
        except Exception as exc:
            _logger.warning(
                "[SHOPFLOOR_DISPATCH_SERVICE] child MO lookup failed | "
                "parent_mo=%s error=%s",
                parent_mo.id,
                exc,
            )

        children = children.exists() - parent_mo

        if not children:
            return False, 0.0

        parent_target_qty = self._mo_target_qty(
            parent_mo
        )

        if parent_target_qty <= 0.0:
            return True, 0.0

        # Group child MOs by component product. This supports split child
        # MOs for the same component.
        component_groups = {}

        for child_mo in children:
            product_id = False

            try:
                if child_mo.product_id:
                    product_id = child_mo.product_id.id
            except Exception:
                product_id = False

            group_key = (
                product_id
                if product_id
                else "mo_%s" % child_mo.id
            )

            group = component_groups.setdefault(
                group_key,
                {
                    "target_qty": 0.0,
                    "released_qty": 0.0,
                    "mo_ids": [],
                },
            )

            group["target_qty"] += self._mo_target_qty(
                child_mo
            )

            group["released_qty"] += (
                self._released_qty_from_child_mo(
                    child_mo
                )
            )

            group["mo_ids"].append(child_mo.id)

        component_capacities = []

        for group in component_groups.values():
            child_target_qty = group["target_qty"]
            released_qty = group["released_qty"]

            if child_target_qty <= 0.0:
                component_capacities.append(0.0)
                continue

            # Example:
            # 500 child pieces for 250 parent pieces means
            # 2 child pieces are required per parent piece.
            child_per_parent = (
                child_target_qty / parent_target_qty
            )

            if child_per_parent <= 0.0:
                component_capacities.append(0.0)
                continue

            parent_capacity = (
                released_qty / child_per_parent
            )

            component_capacities.append(
                max(parent_capacity, 0.0)
            )

        if not component_capacities:
            return True, 0.0

        available_parent_qty = min(
            component_capacities
        )

        available_parent_qty = min(
            available_parent_qty,
            parent_target_qty,
        )

        _logger.info(
            "[SHOPFLOOR_DISPATCH_SERVICE] parent component capacity | "
            "parent_mo=%s target=%s capacity=%s groups=%s",
            parent_mo.id,
            parent_target_qty,
            available_parent_qty,
            component_groups,
        )

        return True, max(
            available_parent_qty,
            0.0,
        )

    def _available_qty_for_workorder(self, wo):
        """
        Quantity that may be processed now.

        First WO:
            total remaining quantity, provided it is ready or resumable.

        Downstream WO:
            upstream completed quantity minus this WO's completed quantity.
        """
        if not wo:
            return 0.0

        state = (
            wo.state
            if self._has(wo, "state")
            else False
        )

        if state in ("done", "cancel", "cancelled"):
            return 0.0

        target = self._target_qty(wo)
        done = self._done_qty(wo)
        remaining = max(0.0, target - done)

        if remaining <= 0.0:
            return 0.0

        predecessors = self._wo_predecessors(wo)

        if not predecessors:
            mo = (
                wo.production_id
                if self._has(wo, "production_id")
                else False
            )

            flow_service = self.env[
                "shopfloor.component.flow.service"
            ]

            if (
                mo
                and flow_service.is_entry_workorder(wo)
            ):
                has_child_gate, free_parent_qty = (
                    flow_service.available_parent_qty(
                        mo,
                        sync=False,
                    )
                )

                if not has_child_gate:
                    has_child_gate, free_parent_qty = (
                        self._parent_component_capacity_qty(
                            mo
                        )
                    )

                if has_child_gate:
                    free_parent_qty = (
                        flow_service.round_parent_qty_down(
                            mo,
                            free_parent_qty,
                        )
                    )

                    return max(
                        0.0,
                        min(
                            remaining,
                            free_parent_qty,
                        ),
                    )

            # Ordinary MO without child/reper MOs.
            if (
                state == "ready"
                or self._is_resumable_partial_wo(wo)
            ):
                return remaining

            return 0.0

        upstream_quantities = []

        for predecessor in predecessors:
            predecessor_done = self._done_qty(predecessor)

            # Legacy completed predecessor with no stored quantity.
            predecessor_state = (
                predecessor.state
                if self._has(predecessor, "state")
                else False
            )

            if (
                predecessor_done <= 0.0
                and predecessor_state in ("done", "cancel")
            ):
                predecessor_done = self._target_qty(predecessor)

            upstream_quantities.append(predecessor_done)

        if not upstream_quantities:
            return 0.0

        upstream_released = min(upstream_quantities)

        available = upstream_released - done

        return max(
            0.0,
            min(remaining, available),
        )

    def _wo_has_accumulated_progress(self, wo):
        if not wo:
            return False

        try:
            if self._done_qty(wo) > 0.0:
                return True
        except Exception:
            pass

        try:
            state = wo.state if self._has(wo, "state") else False
            if state in ("progress", "done"):
                return True
        except Exception:
            pass

        return False

    def _mo_progress_priority(self, mo):
        """
        Returns:
          1 = MO/part has at least one WO with progress/done quantity/state
          0 = MO/part looks not started
        """
        if not mo:
            return 0

        try:
            workorders = self.env["mrp.workorder"].search([
                ("production_id", "=", mo.id),
                ("state", "!=", "cancel"),
            ])

            for other_wo in workorders:
                if self._wo_has_accumulated_progress(other_wo):
                    return 1

        except Exception:
            pass

        return 0

    def _is_resumable_partial_wo(self, wo):
        """
        Odoo can recompute a partially completed WO back to `waiting`,
        even after we try to force it to `ready`.

        For the live dispatcher, a WO is resumable if:
        - it still has remaining quantity
        - it already has accumulated progress
        - it is not done/cancelled
        """
        if not wo:
            return False

        try:
            wo_state = wo.state if self._has(wo, "state") else False

            if wo_state in ("done", "cancel", "cancelled"):
                return False
        except Exception:
            pass

        try:
            remaining_qty = self._remaining_qty(wo)

            if remaining_qty <= 0.0:
                return False
        except Exception:
            return False

        try:
            if not self._wo_has_accumulated_progress(wo):
                return False
        except Exception:
            return False

        return True

    def _wo_partial_priority(self, wo):
        """
        Returns:
          1 = this WO is partially completed and still has remaining qty
          0 = this WO looks not started or already complete
        """
        if not wo:
            return 0

        try:
            target = self._target_qty(wo)
            remaining = self._remaining_qty(wo)
            done = self._done_qty(wo)

            if target > 0.0 and remaining > 0.0 and remaining < target:
                return 1

            if done > 0.0 and remaining > 0.0:
                return 1

        except Exception:
            pass

        return 0

    def _get_candidates(self, emp, limit=None):
        allowed_ids, best_ids = self._employee_operation_ids(emp)

        _logger.warning(
            "[SHOPFLOOR_DISPATCH_SERVICE] emp=%s allowed=%s best=%s",
            emp.id,
            allowed_ids,
            best_ids,
        )

        # Do not cap the raw workorder pool. A limit here can hide perfectly
        # eligible operations simply because unrelated ready workorders have
        # smaller database IDs. If a caller explicitly asks for a limit, apply
        # it only after all eligibility filters and ranking have been evaluated.
        workorders = self.env["mrp.workorder"].search(
            [
                ("state", "in", ["ready", "waiting", "pending"]),
                ("production_id.state", "in", ["confirmed", "planned", "progress", "to_close"]),
            ],
            order="id asc",
        )

        candidates = []

        for wo in workorders:
            try:
                mo = wo.production_id if self._has(wo, "production_id") else False
                if not mo:
                    continue

                wo_state = wo.state if self._has(wo, "state") else False

                available_qty = self._available_qty_for_workorder(wo)

                if available_qty <= 0.0:
                    continue

                if self._has(mo, "x_include_in_planner") and not mo.x_include_in_planner:
                    continue

                if self._workorder_is_taken(wo):
                    continue

                if self._workcenter_is_occupied(wo):
                    continue

                op_template = self._get_operation_template(wo)
                op_template_id = op_template.id if op_template else False

                if allowed_ids and op_template_id and op_template_id not in allowed_ids:
                    continue

                score = 0
                if op_template_id and op_template_id in best_ids:
                    score += 1000
                if op_template_id and op_template_id in allowed_ids:
                    score += 100

                seq = 0
                try:
                    if self._has(wo, "sequence"):
                        seq = int(wo.sequence or 0)
                except Exception:
                    seq = 0

                deadline_str = "9999-12-31 23:59:59"
                try:
                    if self._has(mo, "date_deadline") and mo.date_deadline:
                        deadline_str = str(mo.date_deadline)
                    elif self._has(mo, "date_start") and mo.date_start:
                        deadline_str = str(mo.date_start)
                except Exception:
                    pass

                continuation_depth = self._wo_done_predecessor_depth(wo)
                continuation_priority = 1 if continuation_depth > 0 else 0

                wo_partial_priority = self._wo_partial_priority(wo)
                mo_progress_priority = self._mo_progress_priority(mo)

                # Sort rule:
                # 1. higher skill score
                # 2. furthest-ready operation in the route/chain first
                # 3. partially completed WO before untouched WO, but only within same stage
                # 4. partially started MO/part before not-started MO/part
                # 5. earlier deadline/start date
                # 6. later routing sequence as fallback
                # 7. WO id
                sort_key = (
                    -score,
                    -continuation_depth,
                    -continuation_priority,
                    -wo_partial_priority,
                    -mo_progress_priority,
                    deadline_str,
                    # -seq,
                    wo.id,
                )

                candidates.append({
                    "sort_key": sort_key,
                    "workorder": wo,
                    "operation_template": op_template,
                    "score": score,
                    "available_qty": available_qty,
                    "wo_partial_priority": wo_partial_priority,
                    "mo_progress_priority": mo_progress_priority,
                    "continuation_depth": continuation_depth,
                    "continuation_priority": continuation_priority,
                })

            except Exception as exc:
                _logger.warning(
                    "[SHOPFLOOR_DISPATCH_SERVICE] candidate skipped wo=%s error=%s",
                    wo.id if wo else False,
                    exc,
                )

        candidates.sort(key=lambda row: row["sort_key"])

        if limit:
            try:
                limit_value = int(limit)
            except Exception:
                limit_value = 0

            if limit_value > 0:
                return candidates[:limit_value]

        return candidates

    def _assign_workorder_to_session(self, sess, wo, op_template=False):
        emp = (
            sess.x_employee_id
            if self._has(sess, "x_employee_id")
            else False
        )

        mo = (
            wo.production_id
            if self._has(wo, "production_id")
            else False
        )

        available_qty = self._available_qty_for_workorder(
            wo
        )

        if available_qty <= 0.0:
            raise UserError(
                "Nu există momentan cantitate disponibilă "
                "pentru această operație."
            )

        # For the first WO of a parent MO, this creates the component
        # reservations and returns the quantity actually reserved.
        # For all other WOs, it returns the requested quantity unchanged.
        reserved_qty = self.env[
            "shopfloor.component.flow.service"
        ].reserve_for_session(
            sess=sess,
            wo=wo,
            requested_parent_qty=available_qty,
        )

        if reserved_qty <= 0.0:
            raise UserError(
                "Componentele necesare nu mai sunt disponibile."
            )

        realized_qty = self._done_qty(wo)
        total_qty = self._target_qty(wo)

        if total_qty > 0.0:
            realized_qty = min(
                realized_qty,
                total_qty,
            )

        realized_qty = max(
            realized_qty,
            0.0,
        )

        vals = {}

        if self._has(sess, "x_workorder_id"):
            vals["x_workorder_id"] = wo.id

        if self._has(sess, "x_operation_template_id"):
            vals["x_operation_template_id"] = op_template.id if op_template else False

        if self._has(sess, "x_ui_state"):
            vals["x_ui_state"] = "not_started"

        if self._has(sess, "x_current_slot_id"):
            vals["x_current_slot_id"] = False

        if self._has(sess, "x_actual_duration_min"):
            vals["x_actual_duration_min"] = 0.0

        if self._has(sess, "x_employee_text") and emp:
            vals["x_employee_text"] = emp.display_name or emp.name or ""

        if self._has(sess, "x_operation_template_text"):
            vals["x_operation_template_text"] = (
                op_template.display_name if op_template else (wo.name or "")
            )

        if self._has(sess, "x_wc_text"):
            vals["x_wc_text"] = (
                wo.workcenter_id.display_name
                if self._has(wo, "workcenter_id") and wo.workcenter_id
                else ""
            )

        if self._has(sess, "x_quantity_text"):
            vals["x_quantity_text"] = self._fmt_qty(
                realized_qty
            )

        # ------------------------------------------------------------
        # MAX ADDED - populate MO fields used by computed display fields
        # ------------------------------------------------------------
        if self._has(sess, "x_mo_id"):
            vals["x_mo_id"] = mo.id if mo else False

        if self._has(sess, "x_mo_number"):
            # Always preserve the complete MO number: WH/MO/00555
            vals["x_mo_number"] = mo.name if mo else ""

        if self._has(sess, "x_product_text"):
            product_text = ""

            if (
                mo
                and self._has(mo, "product_id")
                and mo.product_id
            ):
                product_text = (
                    mo.product_id.product_tmpl_id.name
                    or mo.product_id.display_name
                    or ""
                )

            vals["x_product_text"] = product_text

        # Do not write x_product_mo_text here.
        # It is computed from:
        # x_parent_product_name, x_product_text, x_mo_number
        # ------------------------------------------------------------
        # MAX ADDITION ENDED

        if self._has(sess, "x_qty_planned"):
            vals["x_qty_planned"] = reserved_qty

        if self._has(sess, "x_expected_duration_min"):
            expected = self._expected_total_minutes(wo)

            if expected <= 0.0:
                try:
                    if self._has(wo, "duration"):
                        expected = float(wo.duration or 0.0)
                except Exception:
                    expected = 0.0

            total_qty = self._target_qty(wo)

            vals["x_expected_duration_min"] = (
                expected * reserved_qty / total_qty
                if total_qty > 0.0
                else expected
            )

        sess.write(vals)

        _logger.warning(
            "[SHOPFLOOR_DISPATCH_SERVICE] assigned session=%s wo=%s vals=%s",
            sess.id,
            wo.id,
            vals,
        )

    def _open_session_action(self, sess):
        return self._common().open_record_action(
            name="Production session",
            res_model="x_shopfloor_session",
            res_id=sess.id,
            view_mode="form",
            target="current",
        )

    # ------------------------------------------------------------
    # MAX ADDED - generic model-field helper
    # ------------------------------------------------------------
    def _field_exists(self, model_rec, field_name):
        return self._common().field_exists(model_rec, field_name)

    # ------------------------------------------------------------
    # MAX ADDED - find hub for session
    # ------------------------------------------------------------
    def _find_hub_for_session(self, sess):
        return self._common().find_hub_for_session(sess)

    # ------------------------------------------------------------
    # MAX ADDED - friendly no-operation popup
    # ------------------------------------------------------------
    def _open_no_operation_popup(self, sess, emp=False):
        _logger.warning(
            "[SHOPFLOOR_DISPATCH_SERVICE] no eligible live operations found session=%s emp=%s",
            sess.id,
            emp.id if emp else False,
        )

        hub = self._find_hub_for_session(sess)

        Popup = self.env["x_popup_session"]

        popup_vals = {
            "x_message": """
                <div style="text-align:center; padding: 24px 12px;">
                    <div style="font-size: 34px; font-weight: 700; margin-bottom: 12px;">
                        Nu există operații disponibile
                    </div>
                    <div style="font-size: 22px; color: #4b5563;">
                        Nu există operații eligibile pentru angajatul curent.
                    </div>
                    <div style="font-size: 20px; margin-top: 10px;">
                        Apasă OK pentru a reveni în hub.
                    </div>
                </div>
            """,
        }

        if self._field_exists(Popup, "x_hub_id"):
            popup_vals["x_hub_id"] = hub.id if hub else False

        if self._field_exists(Popup, "x_shopfloor_session_id"):
            popup_vals["x_shopfloor_session_id"] = sess.id

        if self._field_exists(Popup, "x_ok_behavior"):
            popup_vals["x_ok_behavior"] = "close"

        popup = Popup.create(popup_vals)

        return {
            "type": "ir.actions.act_window",
            "name": "Mesaj",
            "res_model": "x_popup_session",
            "view_mode": "form",
            "views": [(False, "form")],
            "res_id": popup.id,
            "target": "new",
        }

    # ------------------------------------------------------------
    # MAX ADDED - picker formatting helpers
    # ------------------------------------------------------------
    def _fmt_qty(self, value):
        return self._common().fmt_qty_display(value)

    # ------------------------------------------------------------
    # MAX ADDED - find parent manufacturing order
    # ------------------------------------------------------------
    def _parent_mo_for_mo(self, mo):
        if not mo:
            return False

        parent_mo = False

        # Prefer the direct parent relation.
        for fname in [
            "x_parent_mo_id",
            "x_parent_production_id",
            "x_parent_manufacturing_order_id",
        ]:
            try:
                if self._has(mo, fname) and mo[fname]:
                    parent_mo = mo[fname]
                    break
            except Exception:
                pass

        # Fallback for older child MOs linked only through origin.
        if not parent_mo:
            try:
                if self._has(mo, "origin") and mo.origin:
                    parent_mo = self.env["mrp.production"].search(
                        [
                            ("name", "=", mo.origin),
                        ],
                        limit=1,
                    )
            except Exception:
                parent_mo = False

        return parent_mo

    def _candidate_line_vals(self, picker, sess, emp, candidate, sort_index):
        wo = candidate["workorder"]
        op_template = candidate["operation_template"]
        score = candidate.get("score", 0)

        mo = wo.production_id if self._has(wo, "production_id") else False

        product = False
        if mo and self._has(mo, "product_id") and mo.product_id:
            product = mo.product_id

        workcenter = False
        if self._has(wo, "workcenter_id") and wo.workcenter_id:
            workcenter = wo.workcenter_id

        operation_name = ""
        if op_template:
            operation_name = op_template.display_name or op_template.name or ""
        if not operation_name:
            operation_name = wo.display_name or wo.name or "Operație"

        mo_name = ""
        product_name = ""

        if mo:
            mo_name = mo.display_name or mo.name or ""

        if product:
            product_name = product.display_name or product.name or ""

        if mo_name and product_name:
            mo_product_text = "%s - %s" % (mo_name, product_name)
        else:
            mo_product_text = mo_name or product_name or ""

        qty_remaining = float(
            candidate.get("available_qty")
            or self._available_qty_for_workorder(wo)
            or 0.0
        )
        qty_total = self._target_qty(wo)

        qty_done = self._done_qty(wo)

        if qty_total > 0.0:
            qty_done = min(
                qty_done,
                qty_total,
            )

        qty_done = max(
            qty_done,
            0.0,
        )

        qty_text = "%s / %s" % (
            self._fmt_qty(qty_remaining),
            self._fmt_qty(qty_total),
        )

        expected = self._expected_total_minutes(wo)
        if expected <= 0.0:
            try:
                if self._has(wo, "duration"):
                    expected = float(wo.duration or 0.0)
            except Exception:
                expected = 0.0

        adjusted_expected = (
            expected * qty_remaining / qty_total
            if qty_total > 0.0
            else expected
        )

        duration_text = "%s min" % self._fmt_qty(adjusted_expected)

        deadline_text = ""
        try:
            if mo and self._has(mo, "date_deadline") and mo.date_deadline:
                deadline_text = "Deadline: %s" % mo.date_deadline
            elif mo and self._has(mo, "date_start") and mo.date_start:
                deadline_text = "Start: %s" % mo.date_start
        except Exception:
            deadline_text = ""

        badge_text = "Recomandată" if score >= 1000 else "Eligibilă"

        parent_mo = self._parent_mo_for_mo(mo)

        parent_product_name = ""
        parent_referinta_interna = ""

        if parent_mo:
            try:
                if (
                    self._has(parent_mo, "product_id")
                    and parent_mo.product_id
                ):
                    parent_product = parent_mo.product_id

                    parent_product_name = (
                        parent_product.product_tmpl_id.name
                        or parent_product.name
                        or parent_product.display_name
                        or ""
                    )
            except Exception:
                parent_product_name = ""

            try:
                if self._has(parent_mo, "x_referinta_interna"):
                    parent_referinta_interna = (
                        parent_mo.x_referinta_interna or ""
                    )
            except Exception:
                parent_referinta_interna = ""

        return {
            "x_pick_id": picker.id,
            "x_session_id": sess.id,
            "x_employee_id": emp.id,
            "x_workorder_id": wo.id,
            "x_operation_template_id": op_template.id if op_template else False,
            "x_production_id": mo.id if mo else False,
            "x_product_id": product.id if product else False,
            "x_workcenter_id": workcenter.id if workcenter else False,
            "x_operation_name": operation_name,
            "x_mo_product_text": mo_product_text,
            "x_parent_mo_id": parent_mo.id if parent_mo else False,
            "x_parent_product_name": parent_product_name,
            "x_parent_referinta_interna": parent_referinta_interna,
            "x_workcenter_name": workcenter.display_name if workcenter else "",
            "x_qty_remaining": qty_remaining,
            "x_qty_total": qty_total,
            "x_qty_done": qty_done,
            "x_qty_text": qty_text,
            "x_expected_duration_min": adjusted_expected,
            "x_duration_text": duration_text,
            "x_score": score,
            "x_is_best": score >= 1000,
            "x_badge_text": badge_text,
            "x_deadline_text": deadline_text,
            "x_sort_index": sort_index,
        }

    # ------------------------------------------------------------
    # MAX ADDED - open operation picker
    # ------------------------------------------------------------
    def _open_operation_picker(self, sess, emp, candidates):
        Picker = self.env["shopfloor.live.dispatch.pick"]
        Line = self.env["shopfloor.live.dispatch.pick.line"]

        visible_candidates = candidates

        picker = Picker.create({
            "x_session_id": sess.id,
            "x_employee_id": emp.id,
            "x_message": """
                <div style="text-align:center; padding:18px 12px;">
                    <div style="font-size:34px; font-weight:800; margin-bottom:8px; color:#111827;">
                        Alege operația
                    </div>
                    <div style="font-size:22px; color:#4b5563;">
                        Selectează una dintre operațiile disponibile.
                    </div>
                </div>
            """,
        })

        sort_index = 1
        for candidate in visible_candidates:
            Line.create(
                self._candidate_line_vals(
                    picker=picker,
                    sess=sess,
                    emp=emp,
                    candidate=candidate,
                    sort_index=sort_index,
                )
            )
            sort_index += 1

        view = self.env.ref(
            "shopfloor_live_dispatch.view_shopfloor_live_dispatch_pick_form",
            raise_if_not_found=False,
        )

        views = [(False, "form")]
        if view:
            views = [(view.id, "form")]

        action = self._common().open_record_action(
            name="Alege operația",
            res_model="shopfloor.live.dispatch.pick",
            res_id=picker.id,
            view_mode="form",
            target="current",
        )

        action["views"] = views
        action["context"] = {
            "from_operation_pick": True,
        }

        return action

    # ------------------------------------------------------------
    # MAX ADDED - choose line from picker
    # ------------------------------------------------------------
    def choose_candidate_from_picker(self, line):
        line.ensure_one()

        sess = line.x_session_id
        wo = line.x_workorder_id
        op_template = line.x_operation_template_id

        if not sess:
            raise UserError("Missing shopfloor session.")

        if not wo:
            raise UserError("Missing work order.")


        wo_state = (
            wo.state
            if self._has(wo, "state")
            else False
        )

        if wo_state in ("done", "cancel", "cancelled"):
            raise UserError(
                "Operația este deja finalizată sau anulată."
            )
        # Revalidate because upstream released quantity or availability
        # may have changed while the picker was open.
        available_qty = self._available_qty_for_workorder(wo)

        if available_qty <= 0.0:
            raise UserError(
                "Operația nu mai are cantitate disponibilă. "
                "Reîncarcă lista de operații."
            )

        if self._workorder_is_taken(wo):
            raise UserError(
                "Operația a fost deja preluată de alt angajat."
            )

        if self._workcenter_is_occupied(wo):
            raise UserError(
                "Mașina este deja ocupată de altă operație în lucru. "
                "Alege altă operație sau revino mai târziu."
            )

        self._assign_workorder_to_session(
            sess,
            wo,
            op_template,
        )

        return self._open_session_action(sess)

    def choose_operation(self, sessions):
        if not sessions:
            raise UserError("No session found.")

        sess = sessions[:1]
        sess.ensure_one()

        _logger.warning(
            "[SHOPFLOOR_DISPATCH_SERVICE] choose_operation hit session=%s",
            sess.id,
        )

        if not self._has(sess, "x_employee_id") or not sess.x_employee_id:
            raise UserError("Select an employee first.")

        emp = sess.x_employee_id

        vals_reset = {}

        if self._has(sess, "x_is_helper_mode"):
            vals_reset["x_is_helper_mode"] = False

        if self._has(sess, "x_helped_employee_id"):
            vals_reset["x_helped_employee_id"] = False

        if vals_reset:
            sess.write(vals_reset)

        candidates = self._get_candidates(emp)

        if not candidates:
            return self._open_no_operation_popup(sess, emp)

        return self._open_operation_picker(sess, emp, candidates)
