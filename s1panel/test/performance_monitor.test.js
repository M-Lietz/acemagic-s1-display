'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const assert = require('node:assert/strict');
const test = require('node:test');

const { PerformanceMonitor } = require('../lib/performance_monitor');

test('summarizes active USB transfers and busy render cycles', () => {
    let now = 10000;
    const monitor = new PerformanceMonitor({ windowMs: 10000, now: () => now });

    monitor.recordCycle(false);
    now += 160;
    monitor.recordCycle(true);
    monitor.recordTransfer({ type: 'update', durationMs: 44, reports: 3, pixels: 1536 });
    monitor.recordError('update');
    now += 200;
    monitor.recordCycle(false);
    monitor.recordTransfer({ type: 'update', durationMs: 56, reports: 5, pixels: 2560 });

    const result = monitor.snapshot();
    assert.equal(result.render_cycles, 3);
    assert.equal(result.busy_cycles, 1);
    assert.equal(result.completed_transfers, 2);
    assert.equal(result.partial_transfers, 2);
    assert.equal(result.operation_errors, 1);
    assert.equal(result.update_errors, 1);
    assert.equal(result.redraw_errors, 0);
    assert.equal(result.animation_fps, 5);
    assert.equal(result.average_transfer_ms, 50);
    assert.equal(result.average_partial_reports, 4);
    assert.equal(result.average_partial_pixels, 2048);
    assert.deepEqual(result.last_transfer, {
        type: 'update', age_ms: 0, duration_ms: 56, reports: 5, pixels: 2560
    });
});

test('removes measurements outside the rolling window', () => {
    let now = 0;
    const monitor = new PerformanceMonitor({ windowMs: 5000, now: () => now });
    monitor.recordCycle(true);
    monitor.recordTransfer({ type: 'redraw', durationMs: 300, reports: 27, pixels: 54400 });
    monitor.recordError('redraw');

    now = 6000;
    const result = monitor.snapshot();
    assert.equal(result.render_cycles, 0);
    assert.equal(result.completed_transfers, 0);
    assert.equal(result.operation_errors, 0);
    assert.equal(result.last_transfer, null);
});
