import { HOUSE_HEIGHT_SWITCH_M, HOUSE_WIDTH_SWITCH_M } from './config.js';

const SMALL_HOUSE_DIMENSIONS = Object.freeze({
    width: 2.0,
    wallHeight: 2.1,
    depth: 1.6,
    wallThickness: 0.1,
    gableHeight: 0.5,
});

const LARGE_HOUSE_DIMENSIONS = Object.freeze({
    width: 3.0,
    wallHeight: 2.8,
    depth: 2.2,
    wallThickness: 0.1,
    gableHeight: 0.7,
});

export function usesSmallHouse(width, height) {
    return width <= HOUSE_WIDTH_SWITCH_M && height <= HOUSE_HEIGHT_SWITCH_M;
}

export function getHouseDimensions(width, height) {
    return usesSmallHouse(width, height)
        ? SMALL_HOUSE_DIMENSIONS
        : LARGE_HOUSE_DIMENSIONS;
}
