'use strict';
/*!
 * AceMagic S1 Display - Instrument dashboard
 * Copyright (c) 2026 Merlin Lietz and contributors
 * Based on s1panel by Tomasz Jaworski
 * SPDX-License-Identifier: GPL-3.0-only
 */

const {
    normalizeMetrics,
    formatPercent,
    formatGigabytes,
    formatUptime
} = require('../lib/instrument_metrics');

const BASE_WIDTH = 170;
const BASE_HEIGHT = 320;
const HISTORY_WINDOW_MS = 5 * 60 * 1000;
const HISTORY_SAMPLE_MS = 5000;
const MOTION_MIN_MS = 650;
const MOTION_MAX_MS = 950;
const MOTION_SETTLE_MS = 260;
const MOTION_VISIBLE_MIN_DELTA = 3;
const MOTION_OVERSHOOT_MIN_DELTA = 10;
const SCANNER_ACTIVE_MS = 6000;
const SCANNER_REST_MS = 900;
const MARKER_FIELDS = Object.freeze([
    'cpuPercent',
    'memoryPercent'
]);

const COLORS = Object.freeze({
    backgroundTop: '#050b13',
    backgroundBottom: '#02060b',
    frame: '#26313e',
    separator: '#1e2935',
    trackStart: '#0c1d30',
    trackEnd: '#172d49',
    tick: '#7396c3',
    activeStart: '#04d3ff',
    activeEnd: '#1688e8',
    white: '#f5f7fa',
    muted: '#8291a3',
    cyan: '#05bce9',
    amber: '#ffb400',
    green: '#39c963',
    red: '#df5353',
    greenDark: '#133921',
    panelTop: '#09111b',
    panelBottom: '#050a10'
});

function getPrivate(config) {
    if (!config._private) {
        config._private = {
            lastMetrics: null,
            displayedMetrics: null,
            markerMetrics: null,
            markerAnimation: null,
            scannerAnimation: null,
            lastHistoryAt: 0,
            history: { cpu: [], memory: [] }
        };
    }
    return config._private;
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

function drawSpacedText(context, text, centerX, baselineY, spacing) {
    const glyphs = Array.from(text);
    const widths = glyphs.map(glyph => context.measureText(glyph).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (glyphs.length - 1);
    let x = centerX - total / 2;

    glyphs.forEach((glyph, index) => {
        context.fillText(glyph, x, baselineY);
        x += widths[index] + spacing;
    });
}

function drawBackground(context) {
    const background = context.createLinearGradient(0, 0, 0, BASE_HEIGHT);
    background.addColorStop(0, COLORS.backgroundTop);
    background.addColorStop(0.55, '#030910');
    background.addColorStop(1, COLORS.backgroundBottom);
    context.fillStyle = background;
    context.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

    const highlight = context.createRadialGradient(85, 75, 4, 85, 75, 100);
    highlight.addColorStop(0, 'rgba(20, 63, 103, 0.12)');
    highlight.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = highlight;
    context.fillRect(0, 0, BASE_WIDTH, 180);

    context.strokeStyle = COLORS.frame;
    context.lineWidth = 1;
    roundedRect(context, 1.5, 1.5, 167, 317, 7);
    context.stroke();

    const topEdge = context.createLinearGradient(18, 0, 152, 0);
    topEdge.addColorStop(0, 'rgba(91, 119, 151, 0)');
    topEdge.addColorStop(0.5, 'rgba(120, 153, 190, 0.42)');
    topEdge.addColorStop(1, 'rgba(91, 119, 151, 0)');
    context.strokeStyle = topEdge;
    context.lineWidth = 0.7;
    context.beginPath();
    context.moveTo(19, 2.5);
    context.lineTo(151, 2.5);
    context.stroke();

    context.strokeStyle = 'rgba(91, 119, 151, 0.34)';
    context.lineWidth = 0.7;
    [
        [4, 14, 4, 7, 10, 2],
        [166, 14, 166, 7, 160, 2],
        [4, 306, 4, 313, 10, 318],
        [166, 306, 166, 313, 160, 318]
    ].forEach(points => {
        context.beginPath();
        context.moveTo(points[0], points[1]);
        context.lineTo(points[2], points[3]);
        context.lineTo(points[4], points[5]);
        context.stroke();
    });
}

function drawHeader(context, status) {
    const header = context.createLinearGradient(0, 2, 0, 31);
    header.addColorStop(0, 'rgba(20, 34, 50, 0.52)');
    header.addColorStop(1, 'rgba(5, 12, 20, 0.08)');
    context.fillStyle = header;
    context.fillRect(2, 2, 166, 29);

    context.strokeStyle = COLORS.separator;
    context.lineWidth = 0.8;
    context.beginPath();
    context.moveTo(2, 31.5);
    context.lineTo(168, 31.5);
    context.stroke();

    context.fillStyle = COLORS.white;
    context.font = 'bold 11px DejaVu Sans';
    context.textBaseline = 'alphabetic';
    drawSpacedText(context, 'ACEMAGIC S1', 45.5, 19.5, 0.05);

    const statusColor = status === 'ok' ? COLORS.green : status === 'warning' ? COLORS.amber : COLORS.red;
    const statusLabel = status === 'ok' ? 'ONLINE' : status === 'warning' ? 'WARNING' : 'OFFLINE';
    const badgeX = 103;
    const badgeY = 7;
    const badgeWidth = 61;
    const badgeHeight = 17;

    context.fillStyle = status === 'ok' ? 'rgba(19, 57, 33, 0.58)'
        : status === 'warning' ? 'rgba(74, 51, 10, 0.58)' : 'rgba(70, 23, 27, 0.62)';
    roundedRect(context, badgeX, badgeY, badgeWidth, badgeHeight, 8.5);
    context.fill();
    context.strokeStyle = statusColor;
    context.globalAlpha = 0.55;
    context.lineWidth = 0.8;
    context.stroke();
    context.globalAlpha = 1;

    context.save();
    context.shadowColor = statusColor;
    context.shadowBlur = 3;
    context.fillStyle = statusColor;
    context.beginPath();
    context.arc(112.5, 15.5, 3.4, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.fillStyle = statusColor;
    context.font = 'bold 7px DejaVu Sans';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(statusLabel, 121, 15.5);
}

function drawTicks(context, centerX, centerY, radius, startAngle, span) {
    const count = 31;
    context.save();
    context.strokeStyle = COLORS.tick;
    context.lineCap = 'round';

    for (let index = 0; index < count; index++) {
        const ratio = index / (count - 1);
        const angle = startAngle + span * ratio;
        const major = index % 5 === 0;
        const inner = radius + (major ? 6 : 9);
        const outer = radius + 13;
        context.globalAlpha = major ? 0.95 : 0.72;
        context.lineWidth = major ? 1.45 : 0.7;
        context.beginPath();
        context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
        context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
        context.stroke();
    }
    context.restore();
}

function gaugeColor(percent, temperature) {
    if (percent >= 90 || temperature >= 90) return {
        start: '#ff816f', end: '#d83e45', glow: 'rgba(223, 83, 83, 0.35)'
    };
    if (percent >= 75 || temperature >= 75) return {
        start: '#ffd25b', end: '#e89a17', glow: 'rgba(255, 180, 0, 0.3)'
    };
    return {
        start: COLORS.activeStart, end: COLORS.activeEnd, glow: 'rgba(0, 164, 255, 0.32)'
    };
}

function drawGaugeMarker(context, centerX, centerY, radius, percent, temperature) {
    const startAngle = Math.PI * 0.75;
    const span = Math.PI * 1.5;
    const normalized = Math.max(0, Math.min(100, percent)) / 100;
    const angle = startAngle + span * normalized;
    const innerRadius = radius - 7;
    const outerRadius = radius + 6;
    const color = gaugeColor(percent, temperature);

    context.save();
    context.strokeStyle = color.start;
    context.lineCap = 'round';
    context.lineWidth = 9;
    context.shadowColor = color.glow;
    context.shadowBlur = 3;
    context.beginPath();
    context.arc(centerX, centerY, radius, angle - 0.07, angle + 0.07);
    context.stroke();

    context.strokeStyle = '#d9f7ff';
    context.fillStyle = color.start;
    context.lineWidth = 1.35;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
    context.lineTo(centerX + Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius);
    context.stroke();
    context.beginPath();
    context.arc(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
        1.7,
        0,
        Math.PI * 2
    );
    context.fill();
    context.restore();
}

function drawGaugeArc(context, centerX, centerY, radius, percent, temperature, markerPercent = percent, glint = null) {
    const startAngle = Math.PI * 0.75;
    const span = Math.PI * 1.5;
    const normalized = Math.max(0, Math.min(100, markerPercent)) / 100;

    const track = context.createLinearGradient(centerX - radius, centerY, centerX + radius, centerY);
    track.addColorStop(0, COLORS.trackStart);
    track.addColorStop(0.5, COLORS.trackEnd);
    track.addColorStop(1, COLORS.trackStart);

    context.save();
    context.lineCap = 'butt';
    context.lineWidth = 10;
    context.strokeStyle = track;
    context.beginPath();
    context.arc(centerX, centerY, radius, startAngle, startAngle + span);
    context.stroke();

    context.strokeStyle = 'rgba(118, 157, 204, 0.28)';
    context.lineWidth = 0.8;
    context.beginPath();
    context.arc(centerX, centerY, radius + 5.2, startAngle, startAngle + span);
    context.stroke();

    if (normalized > 0) {
        const color = gaugeColor(percent, temperature);
        const active = context.createLinearGradient(centerX - radius, centerY, centerX, centerY - radius);
        active.addColorStop(0, color.start);
        active.addColorStop(1, color.end);
        context.strokeStyle = active;
        context.lineWidth = 10;
        context.shadowColor = color.glow;
        context.shadowBlur = 3;
        context.beginPath();
        context.arc(centerX, centerY, radius, startAngle, startAngle + span * normalized);
        context.stroke();

        context.shadowBlur = 0;
        context.strokeStyle = 'rgba(190, 239, 255, 0.48)';
        context.lineWidth = 0.75;
        context.beginPath();
        context.arc(centerX, centerY, radius - 4.3, startAngle, startAngle + span * normalized);
        context.stroke();
    }

    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(86, 124, 165, 0.35)';
    context.lineWidth = 0.8;
    context.beginPath();
    context.arc(centerX, centerY, radius - 5.5, startAngle, startAngle + span);
    context.stroke();

    if (glint && glint.intensity > 0) {
        const glintAngle = startAngle + span * glint.progress;
        const halfWidth = 0.16;
        context.strokeStyle = `rgba(105, 204, 235, ${0.1 + glint.intensity * 0.16})`;
        context.lineWidth = 8;
        context.lineCap = 'round';
        context.shadowColor = 'rgba(68, 192, 226, 0.4)';
        context.shadowBlur = 2;
        context.beginPath();
        context.arc(centerX, centerY, radius, glintAngle - halfWidth, glintAngle + halfWidth);
        context.stroke();

        context.strokeStyle = `rgba(224, 245, 250, ${0.58 + glint.intensity * 0.28})`;
        context.lineWidth = 2.4;
        context.shadowColor = 'rgba(151, 225, 244, 0.72)';
        context.shadowBlur = 3;
        context.beginPath();
        context.arc(centerX, centerY, radius - 1, glintAngle - 0.11, glintAngle + 0.11);
        context.stroke();
    }
    context.restore();

    drawTicks(context, centerX, centerY, radius, startAngle, span);
    drawGaugeMarker(context, centerX, centerY, radius, markerPercent, temperature);
}

function drawSparkline(context, points, centerY) {
    const x = 60;
    const y = centerY + 17;
    const width = 50;
    const height = 9;
    const values = Array.isArray(points) ? points.map(point => point.value) : [];

    context.strokeStyle = 'rgba(130, 145, 160, 0.22)';
    context.lineWidth = 0.7;
    context.beginPath();
    context.moveTo(x, centerY + 21.5);
    context.lineTo(x + width, centerY + 21.5);
    context.stroke();

    if (values.length < 2) return;

    const rawMinimum = Math.min(...values);
    const rawMaximum = Math.max(...values);
    const middle = (rawMinimum + rawMaximum) / 2;
    const span = Math.max(24, rawMaximum - rawMinimum);
    let minimum = Math.max(0, middle - span / 2);
    let maximum = Math.min(100, minimum + span);
    minimum = Math.max(0, maximum - span);

    const coordinates = values.map((value, index) => ({
        x: x + width * index / (values.length - 1),
        y: y + height - (value - minimum) / (maximum - minimum) * height
    }));

    context.save();
    const fill = context.createLinearGradient(0, y, 0, y + height);
    fill.addColorStop(0, 'rgba(58, 180, 226, 0.2)');
    fill.addColorStop(1, 'rgba(58, 180, 226, 0)');
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(coordinates[0].x, y + height);
    context.lineTo(coordinates[0].x, coordinates[0].y);
    for (let index = 1; index < coordinates.length; index++) {
        const previous = coordinates[index - 1];
        const current = coordinates[index];
        const middleX = (previous.x + current.x) / 2;
        context.quadraticCurveTo(previous.x, previous.y, middleX, (previous.y + current.y) / 2);
    }
    const last = coordinates[coordinates.length - 1];
    context.lineTo(last.x, last.y);
    context.lineTo(last.x, y + height);
    context.closePath();
    context.fill();

    context.strokeStyle = 'rgba(92, 203, 240, 0.78)';
    context.lineWidth = 0.9;
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(coordinates[0].x, coordinates[0].y);
    for (let index = 1; index < coordinates.length; index++) {
        const previous = coordinates[index - 1];
        const current = coordinates[index];
        const middleX = (previous.x + current.x) / 2;
        context.quadraticCurveTo(previous.x, previous.y, middleX, (previous.y + current.y) / 2);
    }
    context.lineTo(last.x, last.y);
    context.stroke();

    context.fillStyle = '#7adcf5';
    context.beginPath();
    context.arc(last.x, last.y, 1.15, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

function drawThermometer(context, x, y, color) {
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(x, y + 4.5, 2.2, 0, Math.PI * 2);
    context.stroke();
    roundedRect(context, x - 1.2, y - 6, 2.4, 10, 1.2);
    context.stroke();
    context.fillRect(x - 0.45, y - 3.5, 0.9, 7.5);
    context.beginPath();
    context.arc(x, y + 4.5, 1.1, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

function drawPercentValue(context, percent, centerY, available) {
    context.fillStyle = available === false ? COLORS.amber : COLORS.white;
    context.textBaseline = 'middle';

    if (available === false) {
        context.textAlign = 'center';
        context.font = 'bold 21px DejaVu Sans';
        context.fillText('N/A', 85, centerY);
        return;
    }

    const digits = String(Math.round(percent));
    context.font = 'bold 31px DejaVu Sans';
    const digitsWidth = context.measureText(digits).width;
    context.font = 'bold 16px DejaVu Sans';
    const unitWidth = context.measureText('%').width;
    const gap = 1.5;
    const startX = 85 - (digitsWidth + gap + unitWidth) / 2;

    context.textAlign = 'left';
    context.font = 'bold 31px DejaVu Sans';
    context.fillText(digits, startX, centerY);
    context.font = 'bold 16px DejaVu Sans';
    context.fillText('%', startX + digitsWidth + gap, centerY + 5);
}

function drawInformationBadge(context, centerY, options) {
    const width = options.icon ? 62 : 60;
    const x = 85 - width / 2;
    const y = centerY + 28;

    context.fillStyle = 'rgba(6, 13, 21, 0.9)';
    roundedRect(context, x, y, width, 15, 7.5);
    context.fill();
    context.strokeStyle = options.available === false ? 'rgba(255, 180, 0, 0.5)' : 'rgba(76, 105, 137, 0.52)';
    context.lineWidth = 0.7;
    context.stroke();

    context.fillStyle = options.color;
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    if (options.icon) {
        drawThermometer(context, x + 11, centerY + 35, options.color);
        context.font = 'bold 11px DejaVu Sans';
        context.fillText(options.text, x + 39, centerY + 35.5);
    }
    else {
        context.font = options.available === false ? 'bold 7px DejaVu Sans' : 'bold 10px DejaVu Sans';
        context.fillText(options.text, 85, centerY + 35.5);
    }
}

function drawGauge(context, options) {
    drawGaugeArc(
        context,
        85,
        options.centerY,
        46,
        options.percent,
        options.temperature,
        options.markerPercent,
        options.glint
    );

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = COLORS.cyan;
    context.font = 'bold 8px DejaVu Sans';
    context.fillText(options.label, 85, options.centerY - 23);

    drawPercentValue(context, options.percent, options.centerY, options.available);

    drawSparkline(context, options.history, options.centerY);

    if (options.temperature !== undefined) {
        drawInformationBadge(context, options.centerY, {
            icon: true,
            color: COLORS.amber,
            text: Math.round(options.temperature) + '°C'
        });
    } else {
        drawInformationBadge(context, options.centerY, {
            available: options.available,
            color: options.available === false ? COLORS.amber : COLORS.white,
            text: options.available === false ? 'NO DATA' : formatGigabytes(options.secondary)
        });
    }
}

function drawPanel(context, x, y, width, height, radius) {
    const panel = context.createLinearGradient(0, y, 0, y + height);
    panel.addColorStop(0, COLORS.panelTop);
    panel.addColorStop(1, COLORS.panelBottom);
    context.fillStyle = panel;
    roundedRect(context, x, y, width, height, radius);
    context.fill();
    context.strokeStyle = COLORS.frame;
    context.lineWidth = 0.8;
    context.stroke();
}

function formatBackup(metrics) {
    if (metrics.backupState === 'running') return 'BKP RUN';
    if (metrics.backupState === 'critical') return 'BKP ERR';
    if (metrics.backupState === 'unknown') return 'BKP --';
    if (metrics.backupAgeHours < 1) return 'BKP <1H';
    if (metrics.backupAgeHours < 48) return 'BKP ' + Math.floor(metrics.backupAgeHours) + 'H';
    return 'BKP ' + Math.floor(metrics.backupAgeHours / 24) + 'D';
}

function usageColor(percent) {
    if (percent >= 90) return { solid: COLORS.red, start: '#ee6d65', end: '#bd343d' };
    if (percent >= 75) return { solid: COLORS.amber, start: '#ffc84b', end: '#d78a17' };
    return { solid: COLORS.green, start: '#3bd16a', end: '#249a45' };
}

function drawStorage(context, metrics) {
    const x = 6;
    const y = 245;
    const width = 158;
    const height = 35;
    drawPanel(context, x, y, width, height, 6);

    context.textBaseline = 'middle';
    const storageColor = usageColor(metrics.storagePercent);
    context.fillStyle = storageColor.solid;
    context.font = 'bold 8px DejaVu Sans';
    context.textAlign = 'left';
    context.fillText('STORAGE', x + 8, y + 11);

    const backupColor = metrics.backupState === 'ok' ? COLORS.green
        : metrics.backupState === 'running' ? COLORS.cyan
            : metrics.backupState === 'critical' ? COLORS.red : COLORS.amber;
    context.fillStyle = 'rgba(7, 14, 22, 0.92)';
    roundedRect(context, 69, y + 5, 43, 12, 6);
    context.fill();
    context.strokeStyle = backupColor;
    context.globalAlpha = 0.48;
    context.lineWidth = 0.7;
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = backupColor;
    context.font = 'bold 5.5px DejaVu Sans';
    context.textAlign = 'center';
    context.fillText(formatBackup(metrics), 91, y + 11);

    context.fillStyle = storageColor.solid;
    context.font = 'bold 11px DejaVu Sans';
    context.textAlign = 'right';
    context.fillText(formatPercent(metrics.storagePercent), x + width - 8, y + 11);

    const barX = x + 8;
    const barY = y + 23;
    const barWidth = width - 16;
    context.fillStyle = '#202a36';
    roundedRect(context, barX, barY, barWidth, 5, 2.5);
    context.fill();

    if (metrics.storagePercent > 0) {
        const fillWidth = Math.max(3, barWidth * Math.min(100, metrics.storagePercent) / 100);
        const fill = context.createLinearGradient(barX, 0, barX + fillWidth, 0);
        fill.addColorStop(0, storageColor.start);
        fill.addColorStop(1, storageColor.end);
        context.fillStyle = fill;
        roundedRect(context, barX, barY, fillWidth, 5, 2.5);
        context.fill();
    }
}

function drawFooterCell(context, cellX, cellWidth, centerX, label, value, labelColor, valueSize, healthy = true) {
    context.strokeStyle = labelColor;
    context.globalAlpha = healthy ? 0.62 : 0.95;
    context.lineWidth = healthy ? 1 : 1.6;
    context.beginPath();
    context.moveTo(cellX + 10, 286.5);
    context.lineTo(cellX + cellWidth - 10, 286.5);
    context.stroke();
    context.globalAlpha = 1;

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = labelColor;
    context.font = 'bold 6.5px DejaVu Sans';
    context.fillText(label, centerX, 295);
    context.fillStyle = healthy ? COLORS.white : labelColor;
    context.font = 'bold ' + valueSize + 'px DejaVu Sans';
    context.fillText(value, centerX, 307.5);
}

function drawFooter(context, metrics) {
    const x = 6;
    const y = 284;
    const width = 158;
    const height = 32;
    drawPanel(context, x, y, width, height, 6);

    context.strokeStyle = COLORS.separator;
    context.lineWidth = 0.8;
    [58.5, 110.5].forEach(separatorX => {
        context.beginPath();
        context.moveTo(separatorX, y + 1);
        context.lineTo(separatorX, y + height - 1);
        context.stroke();
    });

    const vmHealthy = metrics.vmCount === metrics.vmTotal;
    const ctHealthy = metrics.ctCount === metrics.ctTotal;
    drawFooterCell(context, 6, 52.5, 32, 'VM', metrics.vmCount + '/' + metrics.vmTotal,
        vmHealthy ? COLORS.cyan : COLORS.amber, 11, vmHealthy);
    drawFooterCell(context, 58.5, 52, 84.5, 'CT', metrics.ctCount + '/' + metrics.ctTotal,
        ctHealthy ? COLORS.cyan : COLORS.amber, 11, ctHealthy);
    drawFooterCell(context, 110.5, 53.5, 137, 'UP', formatUptime(metrics), COLORS.green, 9.5, true);
}

function connectionStatus(metrics) {
    if (!metrics.hostConnected) return 'critical';
    return metrics.healthLevel;
}

function render(context, metrics, history = { cpu: [], memory: [] }, markers = metrics, motion = {}) {
    drawBackground(context);
    drawHeader(context, connectionStatus(metrics));
    drawGauge(context, {
        centerY: 91,
        label: 'CPU LOAD',
        percent: metrics.cpuPercent,
        markerPercent: markers.cpuPercent,
        temperature: metrics.cpuTempC,
        history: history.cpu,
        glint: motion.cpuGlint
    });
    drawGauge(context, {
        centerY: 194,
        label: 'RAM ACTIVE',
        percent: metrics.memoryPercent,
        markerPercent: markers.memoryPercent,
        secondary: metrics.memoryUsedGb,
        available: metrics.memoryMeasured,
        history: history.memory,
        glint: motion.memoryGlint
    });
    drawStorage(context, metrics);
    drawFooter(context, metrics);
}

function recordHistory(privateState, metrics, now) {
    if (privateState.lastHistoryAt && now - privateState.lastHistoryAt < HISTORY_SAMPLE_MS) return;
    privateState.lastHistoryAt = now;
    const pushSmoothed = (series, value) => {
        const previous = series.at(-1);
        const smoothed = previous ? previous.value * 0.68 + value * 0.32 : value;
        series.push({ time: now, value: smoothed });
    };
    pushSmoothed(privateState.history.cpu, metrics.cpuPercent);
    pushSmoothed(privateState.history.memory, metrics.memoryPercent);
    for (const series of Object.values(privateState.history)) {
        while (series.length && now - series[0].time > HISTORY_WINDOW_MS) series.shift();
    }
}

function interpolateValue(from, target, progress) {
    const linear = Math.max(0, Math.min(1, progress));
    return from + (target - from) * linear;
}

function animationDuration(from, target) {
    return Math.min(MOTION_MAX_MS, MOTION_MIN_MS + Math.abs(target - from) * 5);
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
}

function markerPhases(markerMetrics, targetMarkers) {
    return MARKER_FIELDS.flatMap(field => {
        const from = Number(markerMetrics[field]) || 0;
        const target = Number(targetMarkers[field]) || 0;
        const delta = target - from;
        if (Math.abs(delta) < MOTION_VISIBLE_MIN_DELTA) return [];

        if (Math.abs(delta) < MOTION_OVERSHOOT_MIN_DELTA) {
            return [{
                field,
                from,
                target,
                duration: animationDuration(from, target),
                kind: 'move'
            }];
        }

        const overshootDistance = Math.min(2.4, Math.max(1.2, Math.abs(delta) * 0.12));
        const overshoot = clampPercent(target + Math.sign(delta) * overshootDistance);
        const move = {
            field,
            from,
            target: overshoot,
            duration: animationDuration(from, overshoot),
            kind: 'move'
        };
        if (Math.abs(overshoot - target) < 0.2) {
            move.target = target;
            return [move];
        }
        return [move, {
            field,
            from: overshoot,
            target,
            duration: MOTION_SETTLE_MS,
            kind: 'settle'
        }];
    });
}

function advanceMarkerAnimation(privateState, now) {
    const animation = privateState.markerAnimation;
    if (!animation) return { animating: false, settled: false };

    const phase = animation.phases[animation.index];
    const elapsed = now - animation.startedAt;
    if (elapsed < phase.duration) {
        privateState.markerMetrics[phase.field] = interpolateValue(
            phase.from,
            phase.target,
            elapsed / phase.duration
        );
        return { animating: true, settled: false };
    }

    privateState.markerMetrics[phase.field] = phase.target;
    animation.index++;
    if (animation.index < animation.phases.length) {
        animation.startedAt = now;
        return { animating: true, settled: false };
    }

    privateState.markerAnimation = null;
    return { animating: false, settled: true };
}

function animateMarkers(privateState, target, now, targetChanged) {
    const targetMarkers = Object.fromEntries(MARKER_FIELDS.map(field => [field, target[field]]));

    if (!privateState.markerMetrics) {
        privateState.displayedMetrics = { ...target };
        privateState.markerMetrics = { ...targetMarkers };
        return { metrics: privateState.displayedMetrics, markers: privateState.markerMetrics, animating: false };
    }

    privateState.displayedMetrics = { ...target };
    const previousAnimation = advanceMarkerAnimation(privateState, now);

    if (targetChanged) {
        const phases = markerPhases(privateState.markerMetrics, targetMarkers);
        privateState.markerAnimation = phases.length ? {
            phases,
            index: 0,
            startedAt: now,
        } : null;
        if (!phases.length) privateState.markerMetrics = { ...targetMarkers };
    }

    if (!privateState.markerAnimation) {
        return {
            metrics: privateState.displayedMetrics,
            markers: privateState.markerMetrics,
            animating: false,
            settled: previousAnimation.settled
        };
    }

    return {
        metrics: privateState.displayedMetrics,
        markers: privateState.markerMetrics,
        animating: true
    };
}

function animateScanner(privateState, now, markerAnimating, enabled) {
    if (!enabled) return { active: false, settled: false };
    if (!privateState.scannerAnimation) {
        privateState.scannerAnimation = {
            gauge: 'cpu',
            mode: 'active',
            elapsed: 0,
            lastAt: now,
            progress: 0,
            lastRenderedProgress: null
        };
    }

    const scanner = privateState.scannerAnimation;
    const delta = Math.max(0, Math.min(250, now - scanner.lastAt));
    scanner.lastAt = now;
    const currentGlint = () => ({ progress: scanner.progress, intensity: 1 });
    const result = glint => ({
        active: false,
        settled: false,
        cpuGlint: scanner.gauge === 'cpu' ? glint : null,
        memoryGlint: scanner.gauge === 'memory' ? glint : null
    });

    if (markerAnimating) return result(currentGlint());

    scanner.elapsed += delta;
    if (scanner.mode === 'rest') {
        if (scanner.elapsed < SCANNER_REST_MS) return result(null);
        scanner.gauge = scanner.gauge === 'cpu' ? 'memory' : 'cpu';
        scanner.mode = 'active';
        scanner.elapsed = 0;
        scanner.progress = 0;
        scanner.lastRenderedProgress = null;
    }

    if (scanner.elapsed >= SCANNER_ACTIVE_MS) {
        scanner.mode = 'rest';
        scanner.elapsed = 0;
        scanner.lastRenderedProgress = null;
        return { ...result(null), settled: true };
    }

    const phase = scanner.elapsed / SCANNER_ACTIVE_MS;
    scanner.progress = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    const changed = scanner.lastRenderedProgress === null
        || Math.abs(scanner.progress - scanner.lastRenderedProgress) >= 0.0001;
    scanner.lastRenderedProgress = scanner.progress;
    return { ...result(currentGlint()), active: changed };
}

function draw(context, value, min, max, config) {
    return new Promise(fulfill => {
        const privateState = getPrivate(config);
        const metrics = normalizeMetrics(value);
        const signature = JSON.stringify(metrics);
        const changed = signature !== privateState.lastMetrics;
        privateState.lastMetrics = signature;
        const now = typeof config.now === 'function' ? config.now() : Date.now();
        recordHistory(privateState, metrics, now);
        const animated = animateMarkers(privateState, metrics, now, changed);
        const scanner = animateScanner(privateState, now, animated.animating, config.ambientMotion !== false);

        const rect = config.rect;
        context.save();
        context.beginPath();
        context.rect(rect.x, rect.y, rect.width, rect.height);
        context.clip();
        context.translate(rect.x, rect.y);
        context.scale(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT);
        render(context, animated.metrics, privateState.history, animated.markers, {
            cpuGlint: scanner.cpuGlint,
            memoryGlint: scanner.memoryGlint
        });
        context.restore();

        fulfill(changed || animated.animating || animated.settled === true || scanner.active || scanner.settled);
    });
}

function info() {
    return {
        name: 'instrument_dashboard',
        description: 'AceMagic S1 Instrument Dashboard - 170x320',
        fields: []
    };
}

module.exports = {
    info,
    draw,
    render
};
