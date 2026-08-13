'use strict';
/*!
 * AceMagic S1 Display - native design renderers
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const {
    formatGigabytes,
    formatPercent,
    formatUptime
} = require('./instrument_metrics');

const WIDTH = 170;
const HEIGHT = 320;

const COLOR = Object.freeze({
    bg: '#05090e',
    bg2: '#09111a',
    panel: '#0b121a',
    panel2: '#101923',
    line: '#26313c',
    lineSoft: '#19232d',
    white: '#f3f5f7',
    muted: '#85909c',
    dim: '#4e5b67',
    blue: '#259ed0',
    blue2: '#57b8dc',
    cyan: '#3bc0de',
    green: '#46ce68',
    amber: '#efb33f',
    red: '#df6262',
    bronze: '#b89562',
    steel: '#9aabba'
});

function clamp(value, minimum = 0, maximum = 100) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
}

function fillRounded(context, x, y, width, height, radius, fill, stroke = null) {
    roundedRect(context, x, y, width, height, radius);
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
        context.strokeStyle = stroke;
        context.lineWidth = 0.8;
        context.stroke();
    }
}

function status(metrics) {
    if (!metrics.hostConnected || metrics.healthLevel === 'critical') {
        return { label: 'OFFLINE', color: COLOR.red };
    }
    if (metrics.healthLevel === 'warning') {
        return { label: 'WARNING', color: COLOR.amber };
    }
    return { label: 'ONLINE', color: COLOR.green };
}

function usageColor(value) {
    if (value >= 90) return COLOR.red;
    if (value >= 75) return COLOR.amber;
    return COLOR.green;
}

function background(context, options = {}) {
    const top = options.top || COLOR.bg2;
    const bottom = options.bottom || '#030609';
    const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    if (options.glow !== false) {
        const glow = context.createRadialGradient(85, 58, 4, 85, 58, 110);
        glow.addColorStop(0, options.glow || 'rgba(49, 111, 153, 0.12)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        context.fillStyle = glow;
        context.fillRect(0, 0, WIDTH, 190);
    }

    context.strokeStyle = options.frame || COLOR.line;
    context.lineWidth = 0.8;
    roundedRect(context, 1.5, 1.5, 167, 317, options.radius || 7);
    context.stroke();
}

function text(context, value, x, y, size, color = COLOR.white, align = 'left', weight = 'normal') {
    context.fillStyle = color;
    context.font = `${weight} ${size}px DejaVu Sans`;
    context.textAlign = align;
    context.textBaseline = 'middle';
    context.fillText(String(value), x, y);
}

function rule(context, x1, y1, x2, y2, color = COLOR.line, width = 0.7) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
}

function header(context, metrics, options = {}) {
    const current = status(metrics);
    const compact = options.compact === true;
    const y = compact ? 17 : 19;
    text(context, options.brand || 'ACEMAGIC S1', options.brandX || 8, y, options.brandSize || 8.5,
        options.brandColor || COLOR.white, 'left', 'bold');

    context.fillStyle = current.color;
    context.beginPath();
    context.arc(options.dotX || 109, y, 2.2, 0, Math.PI * 2);
    context.fill();
    text(context, current.label, options.statusX || 115, y, compact ? 5.3 : 5.8, current.color, 'left', 'bold');
    rule(context, 6, compact ? 29 : 31, 164, compact ? 29 : 31, options.rule || COLOR.lineSoft);
}

function panel(context, x, y, width, height, options = {}) {
    const gradient = context.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, options.top || COLOR.panel2);
    gradient.addColorStop(1, options.bottom || COLOR.panel);
    fillRounded(context, x, y, width, height, options.radius || 5, gradient, options.stroke || COLOR.line);
}

function bar(context, x, y, width, height, value, options = {}) {
    const percent = clamp(value);
    fillRounded(context, x, y, width, height, height / 2, options.track || '#202a34');
    if (percent <= 0) return;
    const fillWidth = Math.max(height, width * percent / 100);
    const gradient = context.createLinearGradient(x, 0, x + fillWidth, 0);
    gradient.addColorStop(0, options.start || options.color || COLOR.blue);
    gradient.addColorStop(1, options.end || options.color || COLOR.cyan);
    fillRounded(context, x, y, fillWidth, height, height / 2, gradient);
}

function sparkline(context, points, x, y, width, height, options = {}) {
    const values = (Array.isArray(points) ? points : []).map(point => clamp(point.value));
    if (values.length < 2) return;

    const minimum = Math.max(0, Math.min(...values) - 8);
    const maximum = Math.min(100, Math.max(...values) + 8);
    const range = Math.max(18, maximum - minimum);
    const coordinates = values.map((value, index) => ({
        x: x + width * index / (values.length - 1),
        y: y + height - (value - minimum) / range * height
    }));

    if (options.fill !== false) {
        const gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, options.fillColor || 'rgba(59, 192, 222, 0.2)');
        gradient.addColorStop(1, 'rgba(59, 192, 222, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.moveTo(coordinates[0].x, y + height);
        coordinates.forEach(point => context.lineTo(point.x, point.y));
        context.lineTo(coordinates.at(-1).x, y + height);
        context.closePath();
        context.fill();
    }

    context.strokeStyle = options.color || COLOR.cyan;
    context.lineWidth = options.lineWidth || 0.9;
    context.lineJoin = 'round';
    context.beginPath();
    coordinates.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.stroke();
}

function percentValue(context, value, x, y, size, available = true, color = COLOR.white) {
    if (!available) {
        text(context, 'N/A', x, y, size * 0.62, COLOR.amber, 'center', 'bold');
        return;
    }
    text(context, `${Math.round(clamp(value))}%`, x, y, size, color, 'center', 'bold');
}

function backupLabel(metrics) {
    if (metrics.backupState === 'running') return 'RUNNING';
    if (metrics.backupState === 'critical') return 'ERROR';
    if (metrics.backupState === 'unknown') return 'N/A';
    if (metrics.backupAgeHours < 1) return '< 1H';
    if (metrics.backupAgeHours < 48) return `${Math.floor(metrics.backupAgeHours)}H`;
    return `${Math.floor(metrics.backupAgeHours / 24)}D`;
}

function backupColor(metrics) {
    if (metrics.backupState === 'ok') return COLOR.green;
    if (metrics.backupState === 'running') return COLOR.cyan;
    if (metrics.backupState === 'critical') return COLOR.red;
    return COLOR.amber;
}

function compactFooter(context, metrics, y = 287, options = {}) {
    const color = options.color || COLOR.blue2;
    panel(context, 6, y, 158, 27, { radius: 4, top: options.top || '#0b1219', bottom: '#070b10' });
    [58.5, 110.5].forEach(x => rule(context, x, y + 1, x, y + 26, COLOR.lineSoft));
    const cells = [
        { x: 32, label: 'VM', value: `${metrics.vmCount}/${metrics.vmTotal}`, healthy: metrics.vmCount === metrics.vmTotal },
        { x: 84.5, label: 'CT', value: `${metrics.ctCount}/${metrics.ctTotal}`, healthy: metrics.ctCount === metrics.ctTotal },
        { x: 137, label: 'UP', value: formatUptime(metrics), healthy: true }
    ];
    cells.forEach(cell => {
        text(context, cell.label, cell.x, y + 8, 5.5, cell.healthy ? color : COLOR.amber, 'center', 'bold');
        text(context, cell.value, cell.x, y + 19, cell.label === 'UP' ? 7.5 : 9, cell.healthy ? COLOR.white : COLOR.amber, 'center', 'bold');
    });
}

function radialGauge(context, x, y, radius, value, options = {}) {
    const start = options.start ?? Math.PI * 0.75;
    const span = options.span ?? Math.PI * 1.5;
    const percent = clamp(value);
    context.save();
    context.lineCap = options.lineCap || 'butt';
    context.strokeStyle = options.track || '#172532';
    context.lineWidth = options.width || 8;
    context.beginPath();
    context.arc(x, y, radius, start, start + span);
    context.stroke();
    if (percent > 0) {
        const gradient = context.createLinearGradient(x - radius, y, x + radius, y);
        gradient.addColorStop(0, options.startColor || COLOR.blue);
        gradient.addColorStop(1, options.endColor || COLOR.cyan);
        context.strokeStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, start, start + span * percent / 100);
        context.stroke();
    }
    context.restore();
}

function ticks(context, x, y, radius, count = 25, options = {}) {
    const start = options.start ?? Math.PI * 0.75;
    const span = options.span ?? Math.PI * 1.5;
    context.save();
    for (let index = 0; index < count; index++) {
        const angle = start + span * index / (count - 1);
        const major = index % (options.majorEvery || 4) === 0;
        const inner = radius - (major ? 5 : 3);
        context.strokeStyle = options.color || COLOR.steel;
        context.globalAlpha = major ? 0.85 : 0.45;
        context.lineWidth = major ? 1.1 : 0.55;
        context.beginPath();
        context.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
        context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
        context.stroke();
    }
    context.restore();
}

function metricRow(context, y, label, value, percent, options = {}) {
    text(context, label, 12, y, 6, options.labelColor || COLOR.muted, 'left', 'bold');
    text(context, value, 158, y, options.valueSize || 8, options.valueColor || COLOR.white, 'right', 'bold');
    bar(context, 12, y + 8, 146, options.barHeight || 4, percent, options);
}

function renderExecutive(context, metrics, history) {
    background(context, { top: '#091019', glow: 'rgba(37, 105, 145, 0.13)' });
    header(context, metrics);
    const current = status(metrics);

    panel(context, 7, 38, 156, 48, { top: '#101923', bottom: '#091016' });
    text(context, 'SYSTEM HEALTH', 15, 49, 5.8, COLOR.muted, 'left', 'bold');
    context.fillStyle = current.color;
    context.beginPath();
    context.arc(19, 67, 6, 0, Math.PI * 2);
    context.fill();
    text(context, current.label, 31, 67, 15, current.color, 'left', 'bold');
    text(context, metrics.healthLevel === 'ok' ? 'ALL SYSTEMS HEALTHY' : metrics.healthMessage,
        15, 79, 5.3, COLOR.muted, 'left', 'bold');

    panel(context, 7, 92, 156, 67);
    text(context, 'CPU', 15, 106, 6, COLOR.blue2, 'left', 'bold');
    percentValue(context, metrics.cpuPercent, 39, 130, 25);
    text(context, `${Math.round(metrics.cpuTempC)}°C`, 39, 149, 8, COLOR.amber, 'center', 'bold');
    sparkline(context, history.cpu, 72, 111, 78, 31, { color: COLOR.cyan });
    rule(context, 72, 147, 150, 147, COLOR.lineSoft);

    panel(context, 7, 165, 156, 55);
    text(context, 'RAM ACTIVE', 15, 178, 6, COLOR.blue2, 'left', 'bold');
    percentValue(context, metrics.memoryPercent, 41, 198, 20, metrics.memoryMeasured);
    text(context, metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', 148, 198, 10,
        metrics.memoryMeasured ? COLOR.white : COLOR.amber, 'right', 'bold');
    bar(context, 15, 210, 133, 5, metrics.memoryPercent, { color: COLOR.blue });

    panel(context, 7, 226, 156, 52);
    metricRow(context, 239, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent), barHeight: 4 });
    text(context, 'BACKUP', 12, 266, 5.5, COLOR.muted, 'left', 'bold');
    text(context, backupLabel(metrics), 158, 266, 7.5, backupColor(metrics), 'right', 'bold');
    compactFooter(context, metrics, 285);
}

function renderOperations(context, metrics) {
    background(context, { top: '#071019', glow: 'rgba(23, 98, 140, 0.11)' });
    header(context, metrics);
    const current = status(metrics);

    const cards = [
        { y: 39, h: 45, title: 'SYSTEM HEALTH', color: current.color, big: current.label,
            detail: metrics.healthLevel === 'ok' ? 'ALL SERVICES NOMINAL' : metrics.healthMessage },
        { y: 90, h: 52, title: 'PROXMOX HOST', color: COLOR.blue2, big: `${Math.round(metrics.cpuPercent)}% CPU · ${Math.round(metrics.cpuTempC)}°C`,
            detail: `STORAGE ${Math.round(metrics.storagePercent)}%` },
        { y: 148, h: 52, title: 'WORKLOAD', color: COLOR.cyan,
            big: metrics.memoryMeasured ? `${Math.round(metrics.memoryPercent)}% · ${formatGigabytes(metrics.memoryUsedGb)}` : 'RAM N/A',
            detail: 'ACTIVE GUEST MEMORY' },
        { y: 206, h: 52, title: 'GUESTS', color: COLOR.blue2,
            big: `${metrics.vmCount}/${metrics.vmTotal} VM · ${metrics.ctCount}/${metrics.ctTotal} CT`,
            detail: metrics.vmCount === metrics.vmTotal && metrics.ctCount === metrics.ctTotal ? 'ALL ONLINE' : 'GUEST OFFLINE' }
    ];
    cards.forEach(card => {
        panel(context, 7, card.y, 156, card.h, { radius: 5 });
        fillRounded(context, 13, card.y + 11, 13, 13, 3, '#102635', '#28526a');
        context.strokeStyle = card.color;
        context.lineWidth = 1;
        context.strokeRect(17, card.y + 15, 5, 5);
        text(context, card.title, 33, card.y + 15, 5.5, card.color, 'left', 'bold');
        text(context, card.big, 33, card.y + 29, 9.5, COLOR.white, 'left', 'bold');
        text(context, card.detail, 33, card.y + 40, 5.2,
            card.detail.includes('OFFLINE') ? COLOR.amber : COLOR.muted, 'left', 'bold');
    });
    compactFooter(context, metrics, 266);
}

function renderTelemetry(context, metrics, history) {
    background(context, { top: '#06101a', glow: 'rgba(23, 126, 165, 0.13)' });
    header(context, metrics);

    const trendPanel = (y, label, value, secondary, points, available = true) => {
        panel(context, 7, y, 156, 91, { radius: 5, top: '#0b1721', bottom: '#071018' });
        text(context, label, 15, y + 14, 6, COLOR.cyan, 'left', 'bold');
        percentValue(context, value, 40, y + 42, 24, available);
        text(context, secondary, 150, y + 43, 7.5, available ? COLOR.muted : COLOR.amber, 'right', 'bold');
        [0, 1, 2].forEach(index => rule(context, 15, y + 61 + index * 9, 150, y + 61 + index * 9, '#16232d', 0.5));
        sparkline(context, points, 15, y + 55, 135, 29, { color: COLOR.cyan, lineWidth: 1.1 });
        text(context, '5 MIN', 150, y + 84, 4.8, COLOR.dim, 'right', 'bold');
    };

    trendPanel(38, 'CPU LOAD', metrics.cpuPercent, `${Math.round(metrics.cpuTempC)}°C`, history.cpu);
    trendPanel(135, 'RAM ACTIVE', metrics.memoryPercent,
        metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', history.memory, metrics.memoryMeasured);
    panel(context, 7, 232, 156, 43);
    metricRow(context, 245, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent) });
    text(context, 'BACKUP', 12, 267, 5.3, COLOR.muted, 'left', 'bold');
    text(context, backupLabel(metrics), 158, 267, 7, backupColor(metrics), 'right', 'bold');
    compactFooter(context, metrics, 281);
}

function renderMinimal(context, metrics) {
    background(context, { top: '#070b10', glow: false, frame: '#222a31' });
    header(context, metrics, { compact: true, brandSize: 8 });
    const current = status(metrics);

    fillRounded(context, 16, 43, 138, 54, 6, current.label === 'ONLINE' ? '#0b2516' : '#291417', current.color);
    context.fillStyle = current.color;
    context.beginPath();
    context.arc(85, 58, 3.5, 0, Math.PI * 2);
    context.fill();
    text(context, current.label, 85, 76, 18, current.color, 'center', 'bold');
    text(context, metrics.healthLevel === 'ok' ? 'ALL SYSTEMS HEALTHY' : metrics.healthMessage, 85, 90, 4.8,
        current.color, 'center', 'bold');

    rule(context, 85, 111, 85, 190, COLOR.line);
    text(context, 'CPU', 44, 119, 6, COLOR.cyan, 'center', 'bold');
    percentValue(context, metrics.cpuPercent, 44, 146, 26);
    text(context, `${Math.round(metrics.cpuTempC)}°C`, 44, 172, 8, COLOR.amber, 'center', 'bold');
    text(context, 'RAM', 126, 119, 6, COLOR.cyan, 'center', 'bold');
    percentValue(context, metrics.memoryPercent, 126, 146, 26, metrics.memoryMeasured);
    text(context, metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', 126, 172, 8,
        metrics.memoryMeasured ? COLOR.white : COLOR.amber, 'center', 'bold');

    rule(context, 12, 198, 158, 198, COLOR.line);
    metricRow(context, 213, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent), barHeight: 5 });
    text(context, 'BACKUP', 12, 245, 5.5, COLOR.muted, 'left', 'bold');
    text(context, backupLabel(metrics), 158, 245, 8, backupColor(metrics), 'right', 'bold');
    compactFooter(context, metrics, 267, { color: COLOR.green });
}

function verticalMeter(context, x, y, width, height, value, label, secondary, options = {}) {
    panel(context, x, y, width, height, { radius: 5, top: '#0a1219', bottom: '#060a0e' });
    text(context, label, x + width / 2, y + 14, 5.7, options.color || COLOR.cyan, 'center', 'bold');
    const railX = x + width / 2 - 6;
    const railY = y + 34;
    const railHeight = height - 68;
    fillRounded(context, railX, railY, 12, railHeight, 3, '#111d26', '#30404d');
    for (let index = 0; index <= 10; index++) {
        const tickY = railY + railHeight - railHeight * index / 10;
        rule(context, index % 5 === 0 ? railX - 7 : railX - 4, tickY, railX - 1, tickY,
            index % 5 === 0 ? COLOR.steel : COLOR.dim, 0.6);
        if (index % 5 === 0) text(context, index * 10, railX - 9, tickY, 4.2, COLOR.dim, 'right', 'bold');
    }
    const percent = clamp(value);
    const fillHeight = Math.max(3, railHeight * percent / 100);
    const gradient = context.createLinearGradient(0, railY + railHeight, 0, railY);
    gradient.addColorStop(0, options.start || COLOR.blue);
    gradient.addColorStop(1, options.end || COLOR.cyan);
    fillRounded(context, railX + 2, railY + railHeight - fillHeight, 8, fillHeight, 2, gradient);
    percentValue(context, value, x + width / 2, y + height - 24, 14, options.available !== false);
    text(context, secondary, x + width / 2, y + height - 10, 6, options.secondaryColor || COLOR.muted, 'center', 'bold');
}

function renderPrecision(context, metrics) {
    background(context, { top: '#071018', glow: 'rgba(38, 105, 144, 0.1)' });
    header(context, metrics);
    verticalMeter(context, 8, 39, 74, 189, metrics.cpuPercent, 'CPU LOAD', `${Math.round(metrics.cpuTempC)}°C`,
        { secondaryColor: COLOR.amber });
    verticalMeter(context, 88, 39, 74, 189, metrics.memoryPercent, 'RAM ACTIVE',
        metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', { available: metrics.memoryMeasured });
    panel(context, 8, 234, 154, 39);
    metricRow(context, 247, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent) });
    compactFooter(context, metrics, 281);
}

function renderGrandTouring(context, metrics, history) {
    background(context, { top: '#060b10', glow: 'rgba(44, 91, 125, 0.16)', frame: '#34404b' });
    header(context, metrics, { brandSize: 8.4 });

    radialGauge(context, 84, 112, 65, metrics.cpuPercent, {
        start: Math.PI * 0.84, span: Math.PI * 1.32, width: 10, startColor: '#1f7ab2', endColor: '#67b4df'
    });
    ticks(context, 84, 112, 74, 33, { start: Math.PI * 0.84, span: Math.PI * 1.32, color: '#9eb5c8', majorEvery: 4 });
    text(context, 'CPU LOAD', 84, 83, 6.2, COLOR.blue2, 'center', 'bold');
    percentValue(context, metrics.cpuPercent, 84, 113, 31);
    text(context, `${Math.round(metrics.cpuTempC)}°C`, 84, 142, 9, COLOR.amber, 'center', 'bold');
    sparkline(context, history.cpu, 54, 157, 60, 13, { color: '#72badc', fill: false });

    panel(context, 8, 183, 154, 55, { top: '#0b131a', bottom: '#060b10' });
    text(context, 'RAM ACTIVE', 16, 197, 5.8, COLOR.blue2, 'left', 'bold');
    percentValue(context, metrics.memoryPercent, 42, 214, 17, metrics.memoryMeasured);
    text(context, metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', 151, 213, 8,
        metrics.memoryMeasured ? COLOR.white : COLOR.amber, 'right', 'bold');
    bar(context, 69, 225, 76, 5, metrics.memoryPercent, { start: '#245d84', end: '#52a6d2' });
    panel(context, 8, 244, 154, 32);
    metricRow(context, 255, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent), barHeight: 3 });
    compactFooter(context, metrics, 283, { color: '#87aeca' });
}

function renderAtelier(context, metrics) {
    background(context, { top: '#080c11', glow: 'rgba(38, 78, 110, 0.15)', frame: '#39444e' });
    header(context, metrics, { brandColor: '#e7ecf0' });
    const centerX = 85;
    const centerY = 125;
    context.strokeStyle = '#27343f';
    context.lineWidth = 0.7;
    [74, 61, 48].forEach(radius => {
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.stroke();
    });
    radialGauge(context, centerX, centerY, 67, metrics.cpuPercent, {
        start: -Math.PI / 2, span: Math.PI * 2, width: 7, startColor: '#315f83', endColor: '#7daed2', lineCap: 'round'
    });
    radialGauge(context, centerX, centerY, 54, metrics.memoryPercent, {
        start: -Math.PI / 2, span: Math.PI * 2, width: 5, startColor: '#246c8c', endColor: COLOR.cyan, lineCap: 'round'
    });
    ticks(context, centerX, centerY, 77, 37, { start: -Math.PI / 2, span: Math.PI * 2, color: '#8395a4', majorEvery: 6 });
    text(context, 'CPU', centerX, 101, 5.5, COLOR.muted, 'center', 'bold');
    percentValue(context, metrics.cpuPercent, centerX, 121, 23);
    text(context, 'RAM', centerX, 143, 5.2, COLOR.cyan, 'center', 'bold');
    text(context, metrics.memoryMeasured ? `${Math.round(metrics.memoryPercent)}% · ${formatGigabytes(metrics.memoryUsedGb)}` : 'N/A',
        centerX, 157, 8, metrics.memoryMeasured ? COLOR.white : COLOR.amber, 'center', 'bold');
    text(context, `${Math.round(metrics.cpuTempC)}°C`, centerX, 181, 7.5, COLOR.amber, 'center', 'bold');

    panel(context, 8, 207, 154, 67, { top: '#0c1218', bottom: '#070a0e' });
    metricRow(context, 220, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent), barHeight: 4 });
    text(context, 'BACKUP', 13, 251, 5.3, COLOR.muted, 'left', 'bold');
    text(context, backupLabel(metrics), 157, 251, 7.2, backupColor(metrics), 'right', 'bold');
    compactFooter(context, metrics, 281, { color: '#87a3b7' });
}

function renderSignature(context, metrics, history) {
    background(context, { top: '#071018', glow: 'rgba(29, 104, 142, 0.12)' });
    header(context, metrics);

    const rail = (y, label, value, secondary, points, available = true) => {
        panel(context, 7, y, 156, 82, { top: '#0b151e', bottom: '#071018' });
        text(context, label, 14, y + 14, 5.8, COLOR.cyan, 'left', 'bold');
        percentValue(context, value, 35, y + 39, 19, available);
        text(context, secondary, 151, y + 39, 7, available ? COLOR.white : COLOR.amber, 'right', 'bold');
        const segments = 18;
        for (let index = 0; index < segments; index++) {
            const active = index < Math.round(clamp(value) / 100 * segments);
            context.fillStyle = active ? COLOR.blue : '#192732';
            context.fillRect(14 + index * 7.55, y + 57, 5.5, 5);
        }
        sparkline(context, points, 14, y + 67, 136, 9, { color: COLOR.cyan, fill: false, lineWidth: 0.7 });
    };
    rail(39, 'CPU LOAD', metrics.cpuPercent, `${Math.round(metrics.cpuTempC)}°C`, history.cpu);
    rail(127, 'RAM ACTIVE', metrics.memoryPercent,
        metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', history.memory, metrics.memoryMeasured);
    panel(context, 7, 215, 156, 58);
    metricRow(context, 228, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent), barHeight: 4 });
    text(context, 'LAST BACKUP', 12, 259, 5.2, COLOR.muted, 'left', 'bold');
    text(context, backupLabel(metrics), 158, 259, 7, backupColor(metrics), 'right', 'bold');
    compactFooter(context, metrics, 281);
}

function renderObsidian(context, metrics) {
    background(context, { top: '#080b0e', bottom: '#030405', glow: false, frame: '#30363b' });
    header(context, metrics, { brandColor: '#e5e4e1', rule: '#292e32' });
    rule(context, 85, 42, 85, 172, '#2b3034');

    text(context, 'CPU', 43, 55, 5.5, '#8f969b', 'center', 'bold');
    percentValue(context, metrics.cpuPercent, 43, 91, 28, true, '#e8e7e4');
    text(context, `${Math.round(metrics.cpuTempC)}°C`, 43, 122, 8, COLOR.amber, 'center', 'bold');
    bar(context, 16, 143, 54, 4, metrics.cpuPercent, { start: '#586674', end: '#9cafbd' });

    text(context, 'RAM ACTIVE', 127, 55, 5.2, '#8f969b', 'center', 'bold');
    percentValue(context, metrics.memoryPercent, 127, 91, 28, metrics.memoryMeasured, '#e8e7e4');
    text(context, metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', 127, 122, 8,
        metrics.memoryMeasured ? '#d4d6d7' : COLOR.amber, 'center', 'bold');
    bar(context, 100, 143, 54, 4, metrics.memoryPercent, { start: '#52616c', end: '#96a9b6' });

    const current = status(metrics);
    panel(context, 12, 181, 146, 48, { top: '#0d1114', bottom: '#080a0c', stroke: '#33393e' });
    text(context, 'SYSTEM HEALTH', 85, 196, 5.5, current.color, 'center', 'bold');
    text(context, current.label, 85, 214, 13, current.color, 'center', 'bold');

    panel(context, 12, 237, 146, 39, { top: '#0d1114', bottom: '#07090b' });
    metricRow(context, 249, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent), track: '#272c30', barHeight: 4 });
    compactFooter(context, metrics, 283, { color: '#99a1a6', top: '#0c0f11' });
}

function roundDial(context, x, y, radius, value, label, secondary, options = {}) {
    context.strokeStyle = '#27333d';
    context.lineWidth = 0.8;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    radialGauge(context, x, y, radius - 5, value, {
        start: Math.PI * 0.72,
        span: Math.PI * 1.56,
        width: 6,
        startColor: options.start || '#315f89',
        endColor: options.end || '#73acd4'
    });
    ticks(context, x, y, radius - 1, 29, { start: Math.PI * 0.72, span: Math.PI * 1.56, color: options.tick || '#9badbb', majorEvery: 4 });
    text(context, label, x, y - 17, 5.5, options.labelColor || COLOR.cyan, 'center', 'bold');
    percentValue(context, value, x, y + 1, 20, options.available !== false);
    text(context, secondary, x, y + 23, 6.8, options.secondaryColor || COLOR.amber, 'center', 'bold');
}

function renderChronometer(context, metrics) {
    background(context, { top: '#080b0f', glow: 'rgba(92, 74, 44, 0.1)', frame: '#3b3934' });
    header(context, metrics, { brandColor: '#e8e5dc', rule: '#332f29' });
    roundDial(context, 85, 94, 55, metrics.cpuPercent, 'CPU LOAD', `${Math.round(metrics.cpuTempC)}°C`, {
        start: '#4a6b8c', end: '#83a8c8', tick: '#b6b0a4'
    });
    roundDial(context, 85, 207, 55, metrics.memoryPercent, 'RAM ACTIVE',
        metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', {
            available: metrics.memoryMeasured, start: '#536d86', end: '#91a9bb', tick: '#b6b0a4', secondaryColor: COLOR.white
        });
    compactFooter(context, metrics, 286, { color: COLOR.bronze, top: '#0e1012' });
}

function renderHorizon(context, metrics, history) {
    background(context, { top: '#07101a', glow: 'rgba(23, 107, 151, 0.12)' });
    header(context, metrics);
    const horizon = (y, label, value, secondary, points, available = true) => {
        text(context, label, 10, y, 5.7, COLOR.cyan, 'left', 'bold');
        percentValue(context, value, 33, y + 29, 23, available);
        text(context, secondary, 159, y + 29, 7.2, available ? COLOR.white : COLOR.amber, 'right', 'bold');
        rule(context, 70, y + 10, 159, y + 10, COLOR.lineSoft);
        sparkline(context, points, 70, y + 18, 89, 31, { color: COLOR.cyan, lineWidth: 1.1 });
        rule(context, 10, y + 57, 160, y + 57, COLOR.line);
    };
    horizon(48, 'CPU LOAD', metrics.cpuPercent, `${Math.round(metrics.cpuTempC)}°C`, history.cpu);
    horizon(120, 'RAM ACTIVE', metrics.memoryPercent,
        metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', history.memory, metrics.memoryMeasured);

    panel(context, 8, 194, 154, 78, { top: '#0a151e', bottom: '#071018' });
    metricRow(context, 209, 'STORAGE', formatPercent(metrics.storagePercent), metrics.storagePercent,
        { color: usageColor(metrics.storagePercent), barHeight: 4 });
    text(context, 'BACKUP', 14, 243, 5.2, COLOR.muted, 'left', 'bold');
    text(context, backupLabel(metrics), 156, 243, 7, backupColor(metrics), 'right', 'bold');
    text(context, 'HOST UPTIME', 14, 260, 5.2, COLOR.muted, 'left', 'bold');
    text(context, formatUptime(metrics), 156, 260, 7.5, COLOR.white, 'right', 'bold');
    compactFooter(context, metrics, 281);
}

function renderArchitect(context, metrics, history) {
    background(context, { top: '#080c10', glow: false, frame: '#2b333a', radius: 2 });
    header(context, metrics, { compact: true, brandSize: 7.8, rule: '#2a3239' });
    const current = status(metrics);

    text(context, 'SYSTEM', 9, 44, 4.8, COLOR.dim, 'left', 'bold');
    text(context, current.label, 161, 44, 8, current.color, 'right', 'bold');
    rule(context, 9, 54, 161, 54, '#303941');

    text(context, '01', 9, 68, 5, COLOR.dim, 'left', 'bold');
    text(context, 'CPU', 28, 68, 6, COLOR.cyan, 'left', 'bold');
    percentValue(context, metrics.cpuPercent, 53, 96, 24);
    text(context, `${Math.round(metrics.cpuTempC)}°C`, 159, 68, 7, COLOR.amber, 'right', 'bold');
    sparkline(context, history.cpu, 88, 80, 71, 26, { color: COLOR.cyan, fill: false });
    rule(context, 9, 119, 161, 119, '#303941');

    text(context, '02', 9, 133, 5, COLOR.dim, 'left', 'bold');
    text(context, 'RAM ACTIVE', 28, 133, 6, COLOR.cyan, 'left', 'bold');
    percentValue(context, metrics.memoryPercent, 53, 161, 24, metrics.memoryMeasured);
    text(context, metrics.memoryMeasured ? formatGigabytes(metrics.memoryUsedGb) : 'NO DATA', 159, 161, 8,
        metrics.memoryMeasured ? COLOR.white : COLOR.amber, 'right', 'bold');
    sparkline(context, history.memory, 88, 143, 71, 28, { color: COLOR.blue2, fill: false });
    rule(context, 9, 184, 161, 184, '#303941');

    text(context, '03', 9, 198, 5, COLOR.dim, 'left', 'bold');
    text(context, 'STORAGE', 28, 198, 6, usageColor(metrics.storagePercent), 'left', 'bold');
    text(context, formatPercent(metrics.storagePercent), 159, 198, 9, COLOR.white, 'right', 'bold');
    bar(context, 28, 210, 131, 4, metrics.storagePercent, { color: usageColor(metrics.storagePercent) });

    text(context, '04', 9, 230, 5, COLOR.dim, 'left', 'bold');
    text(context, 'BACKUP', 28, 230, 6, COLOR.muted, 'left', 'bold');
    text(context, backupLabel(metrics), 159, 230, 8, backupColor(metrics), 'right', 'bold');
    rule(context, 9, 244, 161, 244, '#303941');

    const guestHealthy = metrics.vmCount === metrics.vmTotal && metrics.ctCount === metrics.ctTotal;
    text(context, 'GUESTS', 9, 259, 5.2, COLOR.dim, 'left', 'bold');
    text(context, `${metrics.vmCount}/${metrics.vmTotal} VM`, 59, 259, 7.2, guestHealthy ? COLOR.white : COLOR.amber, 'center', 'bold');
    text(context, `${metrics.ctCount}/${metrics.ctTotal} CT`, 111, 259, 7.2, guestHealthy ? COLOR.white : COLOR.amber, 'center', 'bold');
    text(context, formatUptime(metrics), 161, 259, 7.2, COLOR.white, 'right', 'bold');
    rule(context, 9, 276, 161, 276, '#303941');
    text(context, 'ACEMAGIC S1 / SYSTEM TELEMETRY', 9, 293, 4.7, COLOR.dim, 'left', 'bold');
    text(context, '170×320', 161, 293, 4.7, COLOR.dim, 'right', 'bold');
}

const RENDERERS = Object.freeze({
    executive: renderExecutive,
    operations: renderOperations,
    telemetry: renderTelemetry,
    minimal: renderMinimal,
    precision: renderPrecision,
    'grand-touring': renderGrandTouring,
    atelier: renderAtelier,
    signature: renderSignature,
    obsidian: renderObsidian,
    chronometer: renderChronometer,
    horizon: renderHorizon,
    architect: renderArchitect
});

function render(context, design, metrics, history) {
    const renderer = RENDERERS[design];
    if (!renderer) throw new Error(`Unbekannter Renderer: ${design}`);
    renderer(context, metrics, history || { cpu: [], memory: [] });
}

module.exports = {
    HEIGHT,
    RENDERERS,
    WIDTH,
    render
};
