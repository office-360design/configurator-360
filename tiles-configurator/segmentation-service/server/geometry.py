"""Fit a metric ground plane from MoGe-2 geometry.

Camera estimation does not require a semantic class such as grass.  Semantic
segmentation is only an optional hint.  If it is absent or wrong, the backend
finds a large coherent plane from MoGe's metric 3D points, preferring a plane
that occupies the lower/central part of the photograph.

Coordinates: OpenCV camera frame (x right, y down, z forward), metres.
The oriented plane equation is n @ X = h with ||n|| = 1 and h > 0.
Height means perpendicular camera-to-plane distance, NOT gravity height on slopes.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage


class GeometryError(ValueError):
    """The image/model outputs do not support a usable single-plane estimate."""


def encode_rle(mask: np.ndarray) -> list[int]:
    flat = np.asarray(mask, dtype=bool).ravel()
    if not flat.size:
        return [0]
    edges = np.flatnonzero(flat[1:] != flat[:-1]) + 1
    counts = np.diff(np.r_[0, edges, flat.size]).tolist()
    return ([0] if flat[0] else []) + counts


def _prepare_scene(points: np.ndarray, valid: np.ndarray, intrinsics: np.ndarray):
    points = np.asarray(points, dtype=np.float64)
    if points.ndim != 3 or points.shape[2] != 3:
        raise GeometryError('Modelul nu a returnat o hartă 3D compatibilă.')
    H, W = points.shape[:2]
    valid = np.asarray(valid, dtype=bool)
    if valid.shape != (H, W):
        raise GeometryError('Masca de validitate și geometria nu corespund aceleiași rezoluții.')
    K_norm = np.asarray(intrinsics, dtype=np.float64)
    if (K_norm.shape != (3, 3) or not np.isfinite(K_norm).all()
            or not np.allclose(K_norm[2], [0, 0, 1], atol=1e-6)
            or K_norm[0, 0] <= 0 or K_norm[1, 1] <= 0):
        raise GeometryError('Camera estimată de model are intrinseci invalide.')
    K = np.diag([W, H, 1.0]) @ K_norm
    if np.linalg.cond(K) > 1e9:
        raise GeometryError('Intrinsecii camerei sunt instabili.')
    valid = valid & np.isfinite(points).all(axis=2) & (points[..., 2] > 0)
    if int(valid.sum()) < 128:
        raise GeometryError('Modelul nu a furnizat suficientă geometrie 3D validă.')
    return points, valid, K, H, W


def detect_ground_plane_mask(points: np.ndarray, valid: np.ndarray, intrinsics: np.ndarray,
                             semantic_hint: np.ndarray | None = None) -> tuple[np.ndarray, dict]:
    """Find a likely visible ground plane from MoGe geometry alone.

    The semantic hint is optional and only nudges candidate ranking. Dirt,
    concrete, existing paving and grass are geometrically equivalent here.

    Candidate planes are scored on a bounded sample first. Only the best few
    are expanded to the full-resolution map and connected-component labelled.
    The previous implementation labelled the whole image on every RANSAC
    iteration, which was needlessly expensive on CPU for megapixel photos.
    """
    points, valid, _K, H, W = _prepare_scene(points, valid, intrinsics)
    yy, xx = np.mgrid[:H, :W]
    hint = np.zeros((H, W), dtype=bool)
    if semantic_hint is not None:
        candidate_hint = np.asarray(semantic_hint, dtype=bool)
        if candidate_hint.shape == (H, W):
            hint = candidate_hint & valid

    pool = valid & (yy >= int(0.35 * H)) & (xx >= int(0.03 * W)) & (xx < int(0.97 * W))
    pool_pixels = np.flatnonzero(pool)
    if pool_pixels.size < 128:
        raise GeometryError('Nu există suficientă geometrie 3D validă în partea inferioară a fotografiei.')

    rng = np.random.default_rng(20260929)
    max_samples = 5500
    if pool_pixels.size > max_samples:
        pool_pixels = np.sort(rng.choice(pool_pixels, max_samples, replace=False))
    samples = points.reshape(-1, 3)[pool_pixels]
    sample_y = pool_pixels // W
    sample_x = pool_pixels % W
    sample_hint = hint.reshape(-1)[pool_pixels]
    scene_scale = float(np.median(np.linalg.norm(samples, axis=1)))
    if not np.isfinite(scene_scale) or scene_scale <= 1e-5:
        raise GeometryError('Scara metrică a modelului este invalidă.')
    threshold = max(scene_scale * 0.008, 1e-4)

    seed_region = ((yy >= int(0.72 * H)) & (yy < int(0.99 * H))
                   & (xx >= int(0.18 * W)) & (xx < int(0.82 * W)))
    bottom_region = yy >= int(0.82 * H)
    sample_seed = ((sample_y >= int(0.72 * H)) & (sample_y < int(0.99 * H))
                   & (sample_x >= int(0.18 * W)) & (sample_x < int(0.82 * W)))
    sample_bottom = sample_y >= int(0.82 * H)
    min_component = max(128, int(H * W * 0.002))

    # Cheap sampled RANSAC. Keep only a small set of promising plane equations.
    shortlist: list[tuple[float, np.ndarray, float]] = []
    iterations = 180
    for _ in range(iterations):
        a, b, c = samples[rng.choice(len(samples), 3, replace=False)]
        normal = np.cross(b - a, c - a)
        length = float(np.linalg.norm(normal))
        if length < scene_scale ** 2 * 1e-8:
            continue
        normal /= length
        offset = float(normal @ a)
        if offset < 0:
            normal = -normal
            offset = -offset
        residual = np.abs(samples @ normal - offset)
        support = residual < threshold
        count = int(support.sum())
        if count < max(60, int(0.015 * len(samples))):
            continue
        sx = sample_x[support]
        sy = sample_y[support]
        width_coverage = float(np.ptp(sx) / max(1, W - 1)) if len(sx) else 0.0
        height_coverage = float(np.ptp(sy) / max(1, H - 1)) if len(sy) else 0.0
        if width_coverage < 0.06 or height_coverage < 0.025:
            continue
        seed_overlap = float((support & sample_seed).sum() / max(1, sample_seed.sum()))
        bottom_overlap = float((support & sample_bottom).sum() / max(1, sample_bottom.sum()))
        lower_fraction = float((sy >= 0.55 * H).mean()) if len(sy) else 0.0
        hint_overlap = float((support & sample_hint).sum() / max(1, sample_hint.sum())) if sample_hint.any() else 0.0
        area_term = min(1.0, count / max(1.0, len(samples) * 0.25))
        orientation_term = max(0.0, float(normal[1])) + 0.25 * max(0.0, float(normal[2]))
        score = (2.5 * seed_overlap + 1.0 * bottom_overlap + 0.7 * lower_fraction
                 + 0.4 * width_coverage + 0.25 * height_coverage + 0.8 * hint_overlap
                 + 0.15 * orientation_term + 0.15 * area_term)
        shortlist.append((score, normal.copy(), offset))

    if not shortlist:
        raise GeometryError('MoGe-2 nu a găsit automat un plan de sol suficient de mare și coerent în partea inferioară a imaginii.')
    shortlist.sort(key=lambda item: item[0], reverse=True)
    # Avoid spending full-image connected-component passes on nearly identical planes.
    unique: list[tuple[float, np.ndarray, float]] = []
    for item in shortlist:
        _, normal, offset = item
        duplicate = False
        for _, old_normal, old_offset in unique:
            alignment = abs(float(normal @ old_normal))
            if alignment > 0.9995 and abs(offset - old_offset) < threshold * 1.5:
                duplicate = True
                break
        if not duplicate:
            unique.append(item)
        if len(unique) >= 10:
            break

    best_mask = None
    best_score = -np.inf
    best_meta = None
    flat_points = points.reshape(-1, 3)
    valid_pixels = np.flatnonzero(valid)
    valid_points = flat_points[valid_pixels]
    distance_flat = np.full(H * W, np.inf, dtype=np.float32)

    for _sample_score, normal, offset in unique:
        distance_flat.fill(np.inf)
        distance_flat[valid_pixels] = np.abs(valid_points @ normal - offset).astype(np.float32, copy=False)
        support = valid & (distance_flat.reshape(H, W) < threshold)
        components, count = ndimage.label(support)
        if not count:
            continue
        sizes = np.bincount(components.ravel())
        sizes[0] = 0
        candidate_ids = np.argsort(sizes)[-min(5, count):]
        for component_id in candidate_ids:
            if component_id == 0 or sizes[component_id] < min_component:
                continue
            component = components == int(component_id)
            ys, xs = np.nonzero(component)
            if len(xs) < min_component:
                continue
            width_coverage = float(np.ptp(xs) / max(1, W - 1))
            height_coverage = float(np.ptp(ys) / max(1, H - 1))
            if width_coverage < 0.08 or height_coverage < 0.04:
                continue
            seed_overlap = float((component & seed_region).sum() / max(1, seed_region.sum()))
            bottom_overlap = float((component & bottom_region).sum() / max(1, bottom_region.sum()))
            if seed_overlap < 0.005 and bottom_overlap < 0.02:
                continue
            lower_fraction = float((ys >= 0.55 * H).mean())
            hint_overlap = float((component & hint).sum() / max(1, hint.sum())) if hint.any() else 0.0
            area_term = min(1.0, len(xs) / max(1.0, H * W * 0.25))
            orientation_term = max(0.0, float(normal[1])) + 0.25 * max(0.0, float(normal[2]))
            score = (2.5 * seed_overlap + 1.0 * bottom_overlap + 0.7 * lower_fraction
                     + 0.4 * width_coverage + 0.25 * height_coverage + 0.8 * hint_overlap
                     + 0.15 * orientation_term + 0.15 * area_term)
            if score > best_score:
                best_score = score
                best_mask = component
                best_meta = {
                    'score': score,
                    'seed_overlap': seed_overlap,
                    'bottom_overlap': bottom_overlap,
                    'lower_fraction': lower_fraction,
                    'width_coverage': width_coverage,
                    'height_coverage': height_coverage,
                    'semantic_hint_overlap': hint_overlap,
                    'candidate_pixels': int(component.sum()),
                    'detection_threshold_m': threshold,
                    'sample_ransac_iterations': iterations,
                    'full_resolution_candidates': len(unique),
                }

    if best_mask is None:
        raise GeometryError('MoGe-2 nu a găsit automat un plan de sol suficient de mare și coerent în partea inferioară a imaginii.')

    cleaned = ndimage.binary_closing(best_mask, iterations=1)
    cleaned &= valid
    if int(cleaned.sum()) < 128:
        cleaned = best_mask
    best_meta['selected_pixels'] = int(cleaned.sum())
    best_meta['source'] = 'moge_geometric_plane'
    return cleaned, best_meta


def fit_camera(points: np.ndarray, valid: np.ndarray, intrinsics: np.ndarray,
               ground_mask: np.ndarray) -> dict:
    """Return JSON-safe camera/plane data from COMPLETED MoGe-2 inference.

    intrinsics uses normalized image coordinates, as returned by model.infer().
    points must already include focal/shift recovery AND the learned metric scale.
    Synthetic regression tests validate geometry, not learned-model accuracy.
    """
    points, valid, K, H, W = _prepare_scene(points, valid, intrinsics)
    ground_mask = np.asarray(ground_mask, dtype=bool)
    if ground_mask.shape != (H, W):
        raise GeometryError('Masca și geometria nu corespund aceleiași rezoluții.')
    usable = valid & ground_mask
    labels, count = ndimage.label(usable)
    if not count:
        raise GeometryError('Nu există suficient sol valid în fotografia analizată.')
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    component = labels == int(sizes.argmax())
    interior = ndimage.binary_erosion(component, iterations=2, border_value=0)
    pixels = np.flatnonzero(interior)
    if pixels.size < 128:
        raise GeometryError('Zona de sol este prea mică sau îngustă pentru estimarea camerei.')
    rng = np.random.default_rng(20260928)
    if pixels.size > 5000:
        pixels = np.sort(rng.choice(pixels, 5000, replace=False))
    xy = np.column_stack((pixels % W, pixels // W)) / [W, H]
    if np.any(np.ptp(xy, axis=0) < 0.04) or np.linalg.det(np.cov(xy.T)) < 1e-8:
        raise GeometryError('Solul vizibil nu oferă suficientă acoperire pentru un plan stabil.')
    samples = points.reshape(-1, 3)[pixels]
    # Check pixel-centre convention and normalized K against reprojected output.
    q = samples @ K.T
    projected = q[:, :2] / q[:, 2:]
    expected = np.column_stack((pixels % W + 0.5, pixels // W + 0.5))
    projection_error = np.linalg.norm(projected - expected, axis=1)
    if float(np.quantile(projection_error, 0.95)) > 1.5:
        raise GeometryError('Punctele 3D nu corespund camerei: verifică adaptorul modelului.')
    scene_scale = float(np.median(np.linalg.norm(samples, axis=1)))
    if not np.isfinite(scene_scale) or scene_scale <= 1e-5:
        raise GeometryError('Scara metrică a modelului este invalidă.')
    # Relative to predicted scene scale, NOT an assumed human camera height.
    threshold = scene_scale * 0.006
    best = None; best_count = 0
    for _ in range(400):
        a, b, c = samples[rng.choice(len(samples), 3, replace=False)]
        normal = np.cross(b - a, c - a)
        length = float(np.linalg.norm(normal))
        if length < scene_scale**2 * 1e-8:
            continue
        normal /= length
        offset = float(normal @ a)
        residual = np.abs(samples @ normal - offset)
        inliers = residual < threshold
        n_inliers = int(inliers.sum())
        if n_inliers > best_count:
            best = inliers; best_count = n_inliers
    if best is None or best_count < max(100, 0.70 * len(samples)):
        raise GeometryError('Solul nu formează un plan suficient de coerent; nu se inventează o cameră implicită.')
    for _ in range(3):
        cloud = samples[best]
        centre = cloud.mean(axis=0)
        _, singular, basis = np.linalg.svd(cloud - centre, full_matrices=False)
        if singular[1] < max(singular[0] * 1e-4, 1e-8):
            raise GeometryError('Punctele de sol sunt aproape coliniare.')
        normal = basis[-1]
        offset = float(normal @ centre)
        residual = np.abs(samples @ normal - offset)
        best = residual < threshold
        if best.sum() < max(100, 0.70 * len(samples)):
            raise GeometryError('Ajustarea planului este instabilă.')
    if offset < 0:
        normal = -normal; offset = -offset
    if offset < scene_scale * 1e-5:
        raise GeometryError('Planul estimat trece prea aproape de centrul camerei.')
    # Validate the WHOLE selected ground, including other connected components.
    # Do not extrapolate a dominant lawn plane across separate steps/terraces.
    distance = np.full((H, W), np.inf, dtype=np.float64)
    distance[valid] = np.abs(points[valid] @ normal - offset)
    support = valid & (distance < threshold * 3)
    supported_fraction = float(support[usable].mean())
    if supported_fraction < 0.75:
        raise GeometryError('Selecția conține suprafețe incompatibile cu un singur plan. Restrânge zona și reestimează camera.')
    # Choose a visible point as origin, rather than an assumed point at the image bottom.
    origin = samples[best].mean(axis=0)
    origin += normal * (offset - float(normal @ origin))
    forward = np.array([0.0, 0.0, 1.0]) - normal * normal[2]
    if np.linalg.norm(forward) < 1e-6:
        # A straight-down view is valid; use image-up as the in-plane direction.
        forward = np.array([0.0, -1.0, 0.0]) + normal * normal[1]
    forward /= np.linalg.norm(forward)
    right = np.cross(normal, forward); right /= np.linalg.norm(right)
    Hm = K @ np.column_stack((right, forward, origin))
    try:
        Hinv = np.linalg.inv(Hm)
    except np.linalg.LinAlgError as error:
        raise GeometryError('Perspectiva estimată este singulară.') from error
    if not np.isfinite(Hinv).all() or np.linalg.cond(Hm) > 1e10:
        raise GeometryError('Perspectiva estimată este instabilă.')
    pitch = float(np.degrees(np.arcsin(np.clip(normal[2], -1, 1))))
    roll = float(np.degrees(np.arctan2(normal[0], normal[1]))) if np.hypot(*normal[:2]) > 1e-6 else None
    hfov = float(np.degrees(np.arctan(K[0, 2] / K[0, 0]) + np.arctan((W - K[0, 2]) / K[0, 0])))
    warnings = [
        'Înălțimea, unghiurile și scara sunt estimate din imagine; acuratețea fizică nu este verificată.',
        'Înălțimea este distanța perpendiculară la planul selectat; pitch/roll sunt relative la acel plan, nu la gravitație pe o pantă.',
    ]
    if roll is None:
        warnings.append('Vedere aproape perpendiculară pe sol: roll relativ la orizont este nedefinit.')
    if supported_fraction < 0.95:
        warnings.append('Porțiunile care nu susțin planul estimat sunt excluse din pavaj și suprafață.')
    return {
        'camera': {
            'height_m': offset, 'height_reference': 'perpendicular_to_selected_ground_plane',
            'pitch_deg': pitch, 'roll_deg': roll, 'yaw_deg': None,
            'pitch_convention': 'positive_looking_down_relative_to_ground_plane',
            'orientation_reference': 'selected_ground_plane_not_gravity',
            'hfov_deg': hfov, 'focal_px': float(K[0, 0]),
            'intrinsics_px': K.tolist(), 'intrinsics_source': 'metric_model_image_estimate',
            'ground_normal': normal.tolist(), 'source': 'metric_model',
            'accuracy_verified': False,
        },
        'ground_plane': {
            'normal_camera': normal.tolist(), 'distance_m': offset,
            'origin_camera_m': origin.tolist(), 'axis_x_camera': right.tolist(),
            'axis_z_camera': forward.tolist(), 'equation': 'n_dot_X_equals_distance_m',
        },
        'homography_ground_m_to_image_px': Hm.tolist(),
        'homography_image_px_to_ground_m': Hinv.tolist(),
        'ground_support': {'encoding': 'binary_rle_zero_first_row_major', 'counts': encode_rle(support)},
        'diagnostics': {
            'kind': 'metric_point_plane', 'inlier_ratio': float(best.mean()),
            'plane_rmse_m': float(np.sqrt(np.mean(residual[best]**2))),
            'threshold_m': threshold, 'sample_count': int(len(samples)),
            'component_pixels': int(component.sum()),
            'selected_support_fraction': supported_fraction,
            'reprojection_p95_px': float(np.quantile(projection_error, 0.95)),
            'meaning': 'fit_consistency_not_metric_accuracy',
        },
        'warnings': warnings,
    }


def fit_camera_auto(points: np.ndarray, valid: np.ndarray, intrinsics: np.ndarray,
                    semantic_hint: np.ndarray | None = None) -> dict:
    """Fit camera from geometry; semantics are a hint, never a prerequisite."""
    semantic_error = None
    if semantic_hint is not None:
        hint = np.asarray(semantic_hint, dtype=bool)
        if hint.shape == np.asarray(valid).shape and int((hint & np.asarray(valid, dtype=bool)).sum()) >= 128:
            try:
                result = fit_camera(points, valid, intrinsics, hint)
                result['diagnostics']['ground_selection_source'] = 'semantic_hint'
                result['diagnostics']['semantic_hint_pixels'] = int(hint.sum())
                return result
            except GeometryError as error:
                semantic_error = str(error)

    auto_mask, selection = detect_ground_plane_mask(points, valid, intrinsics, semantic_hint)
    result = fit_camera(points, valid, intrinsics, auto_mask)
    result['diagnostics']['ground_selection_source'] = 'moge_geometric_plane'
    result['diagnostics']['semantic_hint_pixels'] = int(np.asarray(semantic_hint, dtype=bool).sum()) if semantic_hint is not None and np.asarray(semantic_hint).shape == auto_mask.shape else 0
    result['diagnostics']['auto_ground'] = selection
    result['warnings'].append('Planul solului a fost ales geometric din MoGe-2; segmentarea semantică nu este necesară pentru estimarea camerei.')
    if semantic_error:
        result['warnings'].append('Indiciul semantic de sol nu a fost suficient de stabil și a fost ignorat pentru cameră.')
    return result
