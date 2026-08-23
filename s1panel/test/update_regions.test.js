'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCanvas } = require('canvas');

const dashboard = require('../widgets/instrument_dashboard');
const fixture = require('./fixtures/instrument_status.json');
const {
    MAX_REPORT_DIMENSION,
    MAX_REPORT_PIXELS,
    compactRegions,
    findDirtyRegions,
    planUpdates,
    splitRegion
} = require('../lib/update_regions');

function frame(width, height, fill = 0) {
    return { data: new Uint16Array(width * height).fill(fill) };
}

function applyChunks(previous, current, width, height, chunks) {
    const channels = current.data.length / (width * height);
    const restored = new current.data.constructor(previous.data);

    for (const rect of chunks) {
        for (let y = rect.y; y < rect.y + rect.height; y++) {
            const start = (y * width + rect.x) * channels;
            const end = start + rect.width * channels;
            restored.set(current.data.subarray(start, end), start);
        }
    }
    return restored;
}

async function drawPhysicalInstrument(context, value, config) {
    context.resetTransform();
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.translate(0, 170);
    context.rotate(-Math.PI / 2);
    await dashboard.draw(context, value, 0, 0, config);
}

test('returns no regions for identical frames and one tile for a single changed pixel', () => {
    const previous = frame(32, 32);
    const current = frame(32, 32);
    assert.deepEqual(findDirtyRegions(previous, current, 32, 32), []);

    current.data[17 * 32 + 18] = 42;
    assert.deepEqual(findDirtyRegions(previous, current, 32, 32), [
        { x: 16, y: 16, width: 8, height: 8 }
    ]);
});

test('splits every update into valid HID refresh reports', () => {
    const chunks = splitRegion({ x: 0, y: 0, width: 320, height: 170 });
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
        assert.ok(chunk.width <= MAX_REPORT_DIMENSION);
        assert.ok(chunk.height <= MAX_REPORT_DIMENSION);
        assert.ok(chunk.width * chunk.height <= MAX_REPORT_PIXELS);
    }
});

test('compacts overlapping curved-motion tiles within the safe HID limit', () => {
    const regions = compactRegions([
        { x: 16, y: 32, width: 32, height: 16 },
        { x: 32, y: 48, width: 32, height: 16 },
        { x: 48, y: 48, width: 16, height: 16 }
    ]);

    assert.deepEqual(regions, [
        { x: 16, y: 32, width: 32, height: 16 },
        { x: 32, y: 48, width: 32, height: 16 }
    ]);
    assert.ok(regions.every(region => region.width * region.height <= MAX_REPORT_PIXELS));
});

test('falls back to a full redraw when partial updates would not save reports', () => {
    const previous = frame(320, 170);
    const current = frame(320, 170, 1);
    const plan = planUpdates(previous, current, 320, 170);

    assert.equal(plan.type, 'redraw');
    assert.ok(plan.chunks.length >= 27);
});

test('instrument animation can be reconstructed exactly from planned updates', async () => {
    const width = 170;
    const height = 320;
    const previousCanvas = createCanvas(width, height);
    const currentCanvas = createCanvas(width, height);
    let now = 10000;
    const config = { rect: { x: 0, y: 0, width, height }, now: () => now };

    await dashboard.draw(previousCanvas.getContext('2d'), fixture, 0, 0, config);
    const changed = structuredClone(fixture);
    changed.metrics.cpuPercent = 66;
    changed.metrics.memoryPercent = 32;
    await dashboard.draw(currentCanvas.getContext('2d'), changed, 0, 0, config);
    now += 500;
    await dashboard.draw(currentCanvas.getContext('2d'), changed, 0, 0, config);

    const previous = previousCanvas.getContext('2d').getImageData(0, 0, width, height);
    const current = currentCanvas.getContext('2d').getImageData(0, 0, width, height);
    const plan = planUpdates(previous, current, width, height);
    assert.equal(plan.type, 'update');
    assert.ok(plan.chunks.length > 0);
    assert.ok(plan.chunks.length < 27);

    const restored = applyChunks(previous, current, width, height, plan.chunks);
    assert.deepEqual(restored, current.data);
});

test('physical RGB565 animation stays exact and below a full redraw', async () => {
    const width = 320;
    const height = 170;
    const previousCanvas = createCanvas(width, height);
    const currentCanvas = createCanvas(width, height);
    const previousContext = previousCanvas.getContext('2d', { pixelFormat: 'RGB16_565' });
    const currentContext = currentCanvas.getContext('2d', { pixelFormat: 'RGB16_565' });
    let now = 20000;
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now
    };
    const changed = structuredClone(fixture);
    changed.metrics.cpuPercent = 66;
    changed.metrics.cpuTemperatureC = 58;
    changed.metrics.memoryPercent = 32;
    changed.metrics.storagePercent = 18;

    await drawPhysicalInstrument(previousContext, fixture, config);
    await drawPhysicalInstrument(currentContext, changed, config);

    for (let frameIndex = 0; frameIndex < 9; frameIndex++) {
        now += 160;
        await drawPhysicalInstrument(currentContext, changed, config);

        const previous = previousContext.getImageData(0, 0, width, height);
        const current = currentContext.getImageData(0, 0, width, height);
        const plan = planUpdates(previous, current, width, height);

        assert.equal(plan.type, 'update');
        assert.ok(plan.chunks.length > 0);
        assert.ok(plan.chunks.length < 27);
        assert.deepEqual(applyChunks(previous, current, width, height, plan.chunks), current.data);

        previousContext.resetTransform();
        previousContext.putImageData(current, 0, 0);
    }
});

test('one marker animation step needs at most three small HID reports', async () => {
    const width = 320;
    const height = 170;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d', { pixelFormat: 'RGB16_565' });
    let now = 30000;
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now
    };

    await drawPhysicalInstrument(context, fixture, config);
    const changed = structuredClone(fixture);
    changed.metrics.cpuPercent = 66;
    changed.metrics.memoryPercent = 32;
    await drawPhysicalInstrument(context, changed, config);
    const previous = context.getImageData(0, 0, width, height);

    now += 160;
    await drawPhysicalInstrument(context, changed, config);
    const current = context.getImageData(0, 0, width, height);
    const plan = planUpdates(previous, current, width, height);
    const pixels = plan.chunks.reduce((sum, rect) => sum + rect.width * rect.height, 0);

    assert.equal(plan.type, 'update');
    assert.ok(plan.chunks.length > 0);
    assert.ok(plan.chunks.length <= 3);
    assert.ok(pixels <= 2048);
    assert.deepEqual(applyChunks(previous, current, width, height, plan.chunks), current.data);
});

test('one scanner step stays a small partial update', async () => {
    const width = 320;
    const height = 170;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d', { pixelFormat: 'RGB16_565' });
    let now = 40000;
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now
    };

    await drawPhysicalInstrument(context, fixture, config);
    const previous = context.getImageData(0, 0, width, height);

    now += 100;
    await drawPhysicalInstrument(context, fixture, config);
    const current = context.getImageData(0, 0, width, height);
    const plan = planUpdates(previous, current, width, height);
    const pixels = plan.chunks.reduce((sum, rect) => sum + rect.width * rect.height, 0);

    assert.equal(plan.type, 'update');
    assert.ok(plan.chunks.length > 0);
    assert.ok(plan.chunks.length <= 4);
    assert.ok(pixels <= 3072);
    assert.deepEqual(applyChunks(previous, current, width, height, plan.chunks), current.data);
});

test('a complete scanner cycle stays close to one HID report per visible frame', async () => {
    const width = 320;
    const height = 170;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d', { pixelFormat: 'RGB16_565' });
    let now = 50000;
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now
    };
    const reports = [];

    await drawPhysicalInstrument(context, fixture, config);
    let previous = context.getImageData(0, 0, width, height);
    for (let frameIndex = 0; frameIndex < 69; frameIndex++) {
        now += 100;
        await drawPhysicalInstrument(context, fixture, config);
        const current = context.getImageData(0, 0, width, height);
        const plan = planUpdates(previous, current, width, height);
        if (plan.chunks.length) {
            assert.equal(plan.type, 'update');
            reports.push(plan.chunks.length);
            assert.deepEqual(applyChunks(previous, current, width, height, plan.chunks), current.data);
        }
        previous = current;
    }

    const average = reports.reduce((sum, count) => sum + count, 0) / reports.length;
    assert.ok(reports.length >= 55);
    const maximum = Math.max(...reports);
    assert.ok(maximum <= 3, `maximum=${maximum}, average=${average.toFixed(2)}, reports=${reports.join(',')}`);
    assert.ok(average <= 1.35, `average=${average.toFixed(2)}`);
});
