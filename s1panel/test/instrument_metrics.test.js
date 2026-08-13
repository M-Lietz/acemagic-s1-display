'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeMetrics,
    formatPercent,
    formatGigabytes,
    formatUptime
} = require('../lib/instrument_metrics');

test('normalizes descriptive metric names', () => {
    const metrics = normalizeMetrics({
        metrics: {
            hostConnected: true,
            cpuPercent: 6.4,
            cpuTempC: 41,
            memoryTotalGb: 15.4,
            memoryAvailableGb: 3.1,
            storagePercent: 8,
            vmCount: 1,
            ctCount: 3,
            uptimeDays: 3,
            uptimeHours: 22
        }
    });

    assert.equal(metrics.hostConnected, true);
    assert.equal(metrics.cpuPercent, 6.4);
    assert.equal(metrics.memoryPercent, 79.87012987012987);
    assert.equal(metrics.memoryUsedGb, 12.3);
    assert.equal(formatUptime(metrics), '3d 22h');
});

test('supports the compact legacy sensor payload without copying its implementation', () => {
    const metrics = normalizeMetrics({
        m: {
            hc: true,
            cpu: 17,
            ct: 52,
            rp: 80,
            ru: 12.3,
            wp: 31,
            wu: 4.8,
            dp: 9,
            wv: 2,
            wc: 4,
            ud: 12,
            uh: 7,
            um: 15
        }
    });

    assert.deepEqual(metrics, {
        hasData: true,
        hostConnected: true,
        cpuPercent: 17,
        cpuTempC: 52,
        memoryPercent: 80,
        memoryUsedGb: 12.3,
        memoryMeasured: true,
        storagePercent: 9,
        swapPercent: 0,
        backupState: 'unknown',
        backupAgeHours: 0,
        backupMessage: 'NO BACKUP DATA',
        healthLevel: 'ok',
        healthMessage: 'ALL SYSTEMS HEALTHY',
        vmCount: 2,
        vmTotal: 2,
        ctCount: 4,
        ctTotal: 4,
        uptimeDays: 12,
        uptimeHours: 7,
        uptimeMinutes: 15
    });
});

test('derives occupied memory from raw byte values', () => {
    const metrics = normalizeMetrics({
        memoryTotalBytes: 16 * 1024 ** 3,
        memoryAvailableBytes: 4 * 1024 ** 3
    });

    assert.equal(metrics.memoryPercent, 75);
    assert.equal(metrics.memoryUsedGb, 12);
});

test('clamps invalid percentages and formats display values', () => {
    const metrics = normalizeMetrics({
        cpuPercent: 140,
        memoryPercent: -5,
        storagePercent: 'invalid',
        uptimeHours: 28,
        uptimeMinutes: 90
    });

    assert.equal(metrics.cpuPercent, 100);
    assert.equal(metrics.memoryPercent, 0);
    assert.equal(metrics.storagePercent, 0);
    assert.equal(metrics.uptimeHours, 23);
    assert.equal(metrics.uptimeMinutes, 59);
    assert.equal(formatPercent(20.4), '20%');
    assert.equal(formatGigabytes(3.14), '3.1 GB');
});
