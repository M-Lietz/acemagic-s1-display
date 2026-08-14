'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const DEFAULT_TILE_SIZE = 16;
const MAX_REPORT_PIXELS = 2048;
const MAX_REPORT_DIMENSION = 255;
const FULL_REDRAW_CHUNKS = 27;

function assertFrame(image, width, height) {
    if (!image || !image.data || !Number.isInteger(width) || !Number.isInteger(height)
        || width <= 0 || height <= 0) {
        throw new TypeError('Ungültiger Bildpuffer');
    }

    const pixels = width * height;
    if (image.data.length < pixels || image.data.length % pixels !== 0) {
        throw new RangeError('Bildpuffer passt nicht zur Auflösung');
    }

    return image.data.length / pixels;
}

function pixelChanged(previous, current, pixel, channels) {
    const offset = pixel * channels;
    for (let channel = 0; channel < channels; channel++) {
        if (previous[offset + channel] !== current[offset + channel]) return true;
    }
    return false;
}

function dirtyTileRuns(previousImage, currentImage, width, height, tileSize) {
    const channels = assertFrame(previousImage, width, height);
    const currentChannels = assertFrame(currentImage, width, height);
    if (channels !== currentChannels) throw new RangeError('Bildpuffer verwenden verschiedene Pixelformate');

    const columns = Math.ceil(width / tileSize);
    const rows = Math.ceil(height / tileSize);
    const dirty = Array.from({ length: rows }, () => Array(columns).fill(false));

    for (let tileY = 0; tileY < rows; tileY++) {
        const startY = tileY * tileSize;
        const endY = Math.min(height, startY + tileSize);
        for (let tileX = 0; tileX < columns; tileX++) {
            const startX = tileX * tileSize;
            const endX = Math.min(width, startX + tileSize);
            let changed = false;
            for (let y = startY; y < endY && !changed; y++) {
                for (let x = startX; x < endX; x++) {
                    if (pixelChanged(previousImage.data, currentImage.data, y * width + x, channels)) {
                        changed = true;
                        break;
                    }
                }
            }
            dirty[tileY][tileX] = changed;
        }
    }

    const runs = [];
    for (let tileY = 0; tileY < rows; tileY++) {
        let tileX = 0;
        while (tileX < columns) {
            if (!dirty[tileY][tileX]) {
                tileX++;
                continue;
            }
            const first = tileX;
            while (tileX + 1 < columns && dirty[tileY][tileX + 1]) tileX++;
            const x = first * tileSize;
            runs.push({
                x,
                y: tileY * tileSize,
                width: Math.min(width, (tileX + 1) * tileSize) - x,
                height: Math.min(tileSize, height - tileY * tileSize)
            });
            tileX++;
        }
    }
    return runs;
}

function mergeVerticalRuns(runs) {
    const regions = [];
    let active = new Map();
    const rows = Map.groupBy(runs, run => run.y);

    for (const rowRuns of rows.values()) {
        const nextActive = new Map();
        for (const run of rowRuns) {
            const key = `${run.x}:${run.width}`;
            const previous = active.get(key);
            if (previous && previous.y + previous.height === run.y) {
                previous.height += run.height;
                nextActive.set(key, previous);
            }
            else {
                const region = { ...run };
                regions.push(region);
                nextActive.set(key, region);
            }
        }
        active = nextActive;
    }
    return regions;
}

function findDirtyRegions(previousImage, currentImage, width, height, options = {}) {
    const tileSize = Math.max(4, Math.min(64, Number(options.tileSize) || DEFAULT_TILE_SIZE));
    return mergeVerticalRuns(dirtyTileRuns(previousImage, currentImage, width, height, tileSize));
}

function splitRegion(rect, options = {}) {
    const maxPixels = Math.max(1, Number(options.maxPixels) || MAX_REPORT_PIXELS);
    const maxDimension = Math.max(1, Number(options.maxDimension) || MAX_REPORT_DIMENSION);
    const chunks = [];

    for (let y = rect.y; y < rect.y + rect.height;) {
        const height = Math.min(maxDimension, rect.y + rect.height - y);
        const maxWidthForHeight = Math.max(1, Math.floor(maxPixels / height));
        const stepWidth = Math.min(maxDimension, maxWidthForHeight);
        for (let x = rect.x; x < rect.x + rect.width; x += stepWidth) {
            chunks.push({
                x,
                y,
                width: Math.min(stepWidth, rect.x + rect.width - x),
                height
            });
        }
        y += height;
    }
    return chunks;
}

function planUpdates(previousImage, currentImage, width, height, options = {}) {
    const regions = findDirtyRegions(previousImage, currentImage, width, height, options);
    const chunks = regions.flatMap(region => splitRegion(region, options));
    const redrawAt = Math.max(1, Number(options.redrawAt) || FULL_REDRAW_CHUNKS);

    return {
        type: chunks.length >= redrawAt ? 'redraw' : 'update',
        regions,
        chunks
    };
}

module.exports = {
    DEFAULT_TILE_SIZE,
    MAX_REPORT_PIXELS,
    MAX_REPORT_DIMENSION,
    FULL_REDRAW_CHUNKS,
    findDirtyRegions,
    splitRegion,
    planUpdates
};
