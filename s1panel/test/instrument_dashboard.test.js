'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('canvas');

const dashboard = require('../widgets/instrument_dashboard');
const fixture = require('./fixtures/instrument_status.json');

test('renders a complete 170x320 dashboard and reports metric changes', async () => {
    const canvas = createCanvas(170, 320);
    const context = canvas.getContext('2d');
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        ambientMotion: false
    };

    assert.equal(await dashboard.draw(context, fixture, 0, 0, config), true);
    assert.equal(await dashboard.draw(context, fixture, 0, 0, config), false);

    const image = context.getImageData(0, 0, 170, 320);
    assert.equal(image.width, 170);
    assert.equal(image.height, 320);
    assert.ok(canvas.toBuffer('image/png').length > 10000);
});

test('scales safely into a different preview rectangle', async () => {
    const canvas = createCanvas(340, 640);
    const context = canvas.getContext('2d');
    const config = { rect: { x: 0, y: 0, width: 340, height: 640 } };

    await dashboard.draw(context, fixture, 0, 0, config);
    assert.ok(canvas.toBuffer('image/png').length > 20000);
});

test('renders full warning and offline status badges', async () => {
    const canvas = createCanvas(170, 320);
    const context = canvas.getContext('2d');
    const config = { rect: { x: 0, y: 0, width: 170, height: 320 } };
    const warning = structuredClone(fixture);
    warning.metrics.healthLevel = 'warning';

    assert.equal(await dashboard.draw(context, warning, 0, 0, config), true);

    const offline = structuredClone(warning);
    offline.metrics.hostConnected = false;
    assert.equal(await dashboard.draw(context, offline, 0, 0, config), true);
    assert.ok(canvas.toBuffer('image/png').length > 20000);
});

test('updates values immediately, animates only gauge markers and keeps a smoothed five-minute history', async () => {
    const canvas = createCanvas(170, 320);
    const context = canvas.getContext('2d');
    let now = 10000;
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now,
        ambientMotion: false
    };

    await dashboard.draw(context, fixture, 0, 0, config);
    config._private.lastHistoryAt = 0;
    const changed = structuredClone(fixture);
    changed.metrics.cpuPercent = 66;
    changed.metrics.memoryPercent = 32;

    assert.equal(await dashboard.draw(context, changed, 0, 0, config), true);
    assert.equal(config._private.displayedMetrics.cpuPercent, 66);
    assert.equal(config._private.markerMetrics.cpuPercent, 6);
    assert.deepEqual(config._private.markerAnimation.phases.map(phase => phase.kind), [
        'move', 'settle', 'move', 'settle'
    ]);
    assert.ok(config._private.markerAnimation.phases[0].target > 66);
    now += 500;
    assert.equal(await dashboard.draw(context, changed, 0, 0, config), true);
    assert.equal(config._private.displayedMetrics.cpuPercent, 66);
    assert.ok(config._private.markerMetrics.cpuPercent > 6);
    assert.ok(config._private.markerMetrics.cpuPercent < 66);
    assert.equal(config._private.markerMetrics.memoryPercent, fixture.metrics.memoryPercent);
    assert.equal(config._private.history.cpu.length, 2);
    assert.equal(config._private.history.memory.length, 2);
    assert.ok(config._private.history.cpu[1].value < 66);

    now += 1000;
    assert.equal(await dashboard.draw(context, changed, 0, 0, config), true);
    assert.ok(config._private.markerMetrics.cpuPercent > 66);
    now += 180;
    assert.equal(await dashboard.draw(context, changed, 0, 0, config), true);
    assert.ok(config._private.markerMetrics.cpuPercent > 66);
    now += 180;
    assert.equal(await dashboard.draw(context, changed, 0, 0, config), true);
    assert.equal(config._private.displayedMetrics.cpuPercent, 66);
    assert.equal(config._private.markerMetrics.cpuPercent, 66);

    now += 1200;
    assert.equal(await dashboard.draw(context, changed, 0, 0, config), true);
    assert.ok(config._private.markerMetrics.memoryPercent > 32);
    now += 400;
    assert.equal(await dashboard.draw(context, changed, 0, 0, config), true);
    assert.equal(config._private.markerMetrics.memoryPercent, 32);
    assert.equal(await dashboard.draw(context, changed, 0, 0, config), false);
});

test('moves one large scanner between both gauges with a firmware rest', async () => {
    const canvas = createCanvas(170, 320);
    const context = canvas.getContext('2d');
    let now = 10000;
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now
    };

    assert.equal(await dashboard.draw(context, fixture, 0, 0, config), true);
    assert.equal(await dashboard.draw(context, fixture, 0, 0, config), false);

    for (let frame = 0; frame < 6; frame++) {
        now += 250;
        assert.equal(await dashboard.draw(context, fixture, 0, 0, config), true);
    }
    assert.equal(config._private.scannerAnimation.gauge, 'cpu');
    assert.ok(config._private.scannerAnimation.progress > 0);
    for (let frame = 0; frame < 6; frame++) {
        now += 250;
        assert.equal(await dashboard.draw(context, fixture, 0, 0, config), true);
    }
    assert.equal(config._private.scannerAnimation.progress, 1);

    for (let frame = 0; frame < 12; frame++) {
        now += 250;
        assert.equal(await dashboard.draw(context, fixture, 0, 0, config), true);
    }
    assert.equal(config._private.scannerAnimation.mode, 'rest');
    for (let frame = 0; frame < 3; frame++) {
        now += 225;
        assert.equal(await dashboard.draw(context, fixture, 0, 0, config), false);
    }
    now += 225;
    assert.equal(await dashboard.draw(context, fixture, 0, 0, config), true);
    assert.equal(config._private.scannerAnimation.gauge, 'memory');

    const changed = structuredClone(fixture);
    changed.metrics.cpuPercent = 44;
    assert.equal(await dashboard.draw(context, changed, 0, 0, config), true);
    assert.equal(config._private.scannerAnimation.gauge, 'memory');
});

test('does not overshoot routine one-percent changes', async () => {
    const canvas = createCanvas(170, 320);
    const context = canvas.getContext('2d');
    let now = 10000;
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now,
        ambientMotion: false
    };

    await dashboard.draw(context, fixture, 0, 0, config);
    const changed = structuredClone(fixture);
    changed.metrics.cpuPercent += 1;
    await dashboard.draw(context, changed, 0, 0, config);

    assert.equal(config._private.markerAnimation, null);
    assert.equal(config._private.markerMetrics.cpuPercent, changed.metrics.cpuPercent);
});
