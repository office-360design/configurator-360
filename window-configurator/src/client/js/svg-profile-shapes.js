import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

function parseOpacity(value, fallback = 1) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const normalized = String(value).trim();
    if (normalized.endsWith('%')) {
        const percentage = Number(normalized.slice(0, -1));
        return Number.isFinite(percentage) ? percentage / 100 : fallback;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function hasTransparentColour(fillValue) {
    const fill = String(fillValue ?? '').trim().toLowerCase();

    if (fill === 'transparent') return true;

    const rgbaMatch = fill.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)$/);
    if (rgbaMatch && parseOpacity(rgbaMatch[1], 1) <= 0) {
        return true;
    }

    const hslaMatch = fill.match(/^hsla\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)$/);
    if (hslaMatch && parseOpacity(hslaMatch[1], 1) <= 0) {
        return true;
    }

    if (/^#[0-9a-f]{4}$/i.test(fill)) {
        return fill.slice(4, 5) === '0';
    }

    if (/^#[0-9a-f]{8}$/i.test(fill)) {
        return fill.slice(7, 9) === '00';
    }

    return false;
}

export function isVisibleFilledSvgPath(path) {
    const style = path?.userData?.style || {};
    const fill = String(style.fill ?? '#000').trim().toLowerCase();
    const fillOpacity = parseOpacity(style.fillOpacity, 1);
    const opacity = parseOpacity(style.opacity, 1);

    return fill !== 'none'
        && !hasTransparentColour(fill)
        && fillOpacity > 0
        && opacity > 0;
}

export function normalizeProfileShapes(shapeOrShapes) {
    if (!shapeOrShapes) return [];
    return Array.isArray(shapeOrShapes)
        ? shapeOrShapes.filter(Boolean)
        : [shapeOrShapes];
}

export function collapseProfileShapes(shapes) {
    const normalized = normalizeProfileShapes(shapes);
    if (normalized.length === 0) return null;
    return normalized.length === 1 ? normalized[0] : normalized;
}

export function extractFilledSvgShapes(data) {
    const shapes = [];

    for (const path of data?.paths || []) {
        if (!isVisibleFilledSvgPath(path)) continue;

        const pathShapes = SVGLoader.createShapes(path);
        for (const shape of pathShapes) {
            if (shape) shapes.push(shape);
        }
    }

    return shapes;
}

export function mapProfileShapes(shapeOrShapes, mapper) {
    return collapseProfileShapes(
        normalizeProfileShapes(shapeOrShapes).map(mapper).filter(Boolean)
    );
}

export function getProfileShapeBounds(shapeOrShapes, divisions = 64) {
    const shapes = normalizeProfileShapes(shapeOrShapes);
    if (!shapes.length) return null;

    const bounds = new THREE.Box2();
    let hasPoints = false;

    for (const shape of shapes) {
        const extracted = shape.extractPoints(divisions);
        const contours = [extracted.shape, ...(extracted.holes || [])];

        for (const points of contours) {
            if (!points?.length) continue;
            for (const point of points) {
                bounds.expandByPoint(point);
            }
            hasPoints = true;
        }
    }

    return hasPoints ? bounds : null;
}
