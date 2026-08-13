'use strict';
/*!
 * AceMagic S1 Display - instrument metrics adapter
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function firstNumber(source, names, fallback) {
    for (const name of names) {
        if (source[name] !== undefined && source[name] !== null && source[name] !== '') {
            return finiteNumber(source[name], fallback);
        }
    }
    return fallback;
}

function deriveMemory(source) {
    let totalGb = firstNumber(source, ['memoryTotalGb', 'memory_total_gb'], -1);
    let availableGb = firstNumber(source, ['memoryAvailableGb', 'memory_available_gb'], -1);

    if (totalGb < 0 || availableGb < 0) {
        const totalBytes = firstNumber(source, ['memoryTotalBytes', 'memory_total_bytes'], -1);
        const availableBytes = firstNumber(source, ['memoryAvailableBytes', 'memory_available_bytes'], -1);
        if (totalBytes >= 0 && availableBytes >= 0) {
            totalGb = totalBytes / (1024 ** 3);
            availableGb = availableBytes / (1024 ** 3);
        }
    }

    if (totalGb > 0 && availableGb >= 0) {
        const usedGb = clamp(totalGb - availableGb, 0, totalGb);
        return {
            percent: usedGb / totalGb * 100,
            usedGb
        };
    }

    return {
        percent: firstNumber(source, ['memoryPercent', 'memory_percent', 'rp', 'workloadPercent', 'wl_pct', 'wp'], 0),
        usedGb: firstNumber(source, ['memoryUsedGb', 'memory_used_gb', 'ru', 'workloadUsedGb', 'wl_used', 'wu'], 0)
    };
}

function normalizeMetrics(value) {
    const wrapper = value && typeof value === 'object' ? value : {};
    const source = wrapper.metrics || wrapper.m || wrapper;
    const hasData = Boolean(value && typeof value === 'object' && Object.keys(source).length);
    const memory = deriveMemory(source);
    const vmCount = Math.max(0, Math.round(firstNumber(source, ['vmCount', 'vm_count', 'wl_vms', 'wv'], 0)));
    const ctCount = Math.max(0, Math.round(firstNumber(source, ['ctCount', 'ct_count', 'wl_cts', 'wc'], 0)));
    const vmTotal = Math.max(vmCount, Math.round(firstNumber(source, ['vmTotal', 'vm_total'], vmCount)));
    const ctTotal = Math.max(ctCount, Math.round(firstNumber(source, ['ctTotal', 'ct_total'], ctCount)));
    const healthLevel = ['ok', 'warning', 'critical'].includes(source.healthLevel)
        ? source.healthLevel
        : (source.hostConnected === false ? 'critical' : 'ok');
    const backupState = ['ok', 'running', 'warning', 'critical', 'unknown'].includes(source.backupState)
        ? source.backupState
        : 'unknown';

    return {
        hasData,
        hostConnected: Boolean(source.hostConnected ?? source.host_connected ?? source.hc ?? hasData),
        cpuPercent: clamp(firstNumber(source, ['cpuPercent', 'cpu_percent', 'cpu'], 0), 0, 100),
        cpuTempC: clamp(firstNumber(source, ['cpuTempC', 'cpu_temp_c', 'cpu_temp', 'ct'], 0), 0, 130),
        memoryPercent: clamp(memory.percent, 0, 100),
        memoryUsedGb: Math.max(0, memory.usedGb),
        memoryMeasured: Boolean(source.memoryMeasured ?? source.memory_measured ?? true),
        storagePercent: clamp(firstNumber(source, ['storagePercent', 'storage_percent', 'diskPercent', 'disk_pct', 'dp'], 0), 0, 100),
        swapPercent: clamp(firstNumber(source, ['swapPercent', 'swap_percent'], 0), 0, 100),
        backupState,
        backupAgeHours: Math.max(0, firstNumber(source, ['backupAgeHours', 'backup_age_hours'], 0)),
        backupMessage: String(source.backupMessage || source.backup_message || 'NO BACKUP DATA'),
        healthLevel,
        healthMessage: String(source.healthMessage || source.health_message || 'ALL SYSTEMS HEALTHY'),
        vmCount,
        vmTotal,
        ctCount,
        ctTotal,
        uptimeDays: Math.max(0, Math.floor(firstNumber(source, ['uptimeDays', 'uptime_days', 'ud'], 0))),
        uptimeHours: clamp(Math.floor(firstNumber(source, ['uptimeHours', 'uptime_hours', 'uh'], 0)), 0, 23),
        uptimeMinutes: clamp(Math.floor(firstNumber(source, ['uptimeMinutes', 'uptime_minutes', 'um'], 0)), 0, 59)
    };
}

function formatPercent(value) {
    return Math.round(clamp(finiteNumber(value, 0), 0, 100)) + '%';
}

function formatGigabytes(value) {
    return Math.max(0, finiteNumber(value, 0)).toFixed(1) + ' GB';
}

function formatUptime(metrics) {
    if (metrics.uptimeDays > 0) {
        return metrics.uptimeDays + 'd ' + metrics.uptimeHours + 'h';
    }
    if (metrics.uptimeHours > 0) {
        return metrics.uptimeHours + 'h ' + metrics.uptimeMinutes + 'm';
    }
    return metrics.uptimeMinutes + 'm';
}

module.exports = {
    normalizeMetrics,
    formatPercent,
    formatGigabytes,
    formatUptime
};
