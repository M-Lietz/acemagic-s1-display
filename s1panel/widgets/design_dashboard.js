'use strict';
/*!
 * AceMagic S1 Display - shared native design dashboard
 * Copyright (c) 2026 Merlin Lietz
 * Based on s1panel by Tomasz Jaworski
 * SPDX-License-Identifier: GPL-3.0-only
 */

const { normalizeMetrics } = require('../lib/instrument_metrics');
const designRenderers = require('../lib/design_renderers');

const HISTORY_WINDOW_MS = 5 * 60 * 1000;
const HISTORY_SAMPLE_MS = 5000;
const MOTION_DURATION_MS = 950;
const MOTION_FIELDS = [
    'cpuPercent',
    'cpuTempC',
    'memoryPercent',
    'memoryUsedGb',
    'storagePercent'
];

function privateState(config) {
    if (!config._private) {
        config._private = {
            signature: null,
            displayed: null,
            animation: null,
            lastHistoryAt: 0,
            history: { cpu: [], memory: [] }
        };
    }
    return config._private;
}

function recordHistory(state, metrics, now) {
    if (state.lastHistoryAt && now - state.lastHistoryAt < HISTORY_SAMPLE_MS) return;
    state.lastHistoryAt = now;

    const push = (series, value) => {
        const previous = series.at(-1);
        series.push({
            time: now,
            value: previous ? previous.value * 0.7 + value * 0.3 : value
        });
        while (series.length && now - series[0].time > HISTORY_WINDOW_MS) series.shift();
    };

    push(state.history.cpu, metrics.cpuPercent);
    push(state.history.memory, metrics.memoryPercent);
}

function interpolate(from, target, progress) {
    const eased = 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 3);
    const result = { ...target };
    MOTION_FIELDS.forEach(field => {
        if (Number.isFinite(from[field]) && Number.isFinite(target[field])) {
            result[field] = from[field] + (target[field] - from[field]) * eased;
        }
    });
    return result;
}

function animate(state, target, now, changed) {
    if (!state.displayed) {
        state.displayed = { ...target };
        return { metrics: state.displayed, moving: false };
    }

    if (changed) {
        state.animation = {
            from: { ...state.displayed },
            target: { ...target },
            startedAt: now
        };
    }

    if (!state.animation) return { metrics: state.displayed, moving: false };
    const progress = (now - state.animation.startedAt) / MOTION_DURATION_MS;

    if (progress >= 1) {
        state.displayed = { ...state.animation.target };
        state.animation = null;
        return { metrics: state.displayed, moving: false, settled: true };
    }

    state.displayed = interpolate(state.animation.from, state.animation.target, progress);
    return { metrics: state.displayed, moving: true };
}

function draw(context, value, min, max, config) {
    return new Promise((fulfill, reject) => {
        try {
            if (!designRenderers.RENDERERS[config.design]) {
                throw new Error(`Unbekanntes Design: ${config.design}`);
            }

            const state = privateState(config);
            const metrics = normalizeMetrics(value);
            const signature = JSON.stringify(metrics);
            const changed = signature !== state.signature;
            state.signature = signature;
            const now = typeof config.now === 'function' ? config.now() : Date.now();
            recordHistory(state, metrics, now);
            const animated = animate(state, metrics, now, changed);
            const rect = config.rect;

            context.save();
            context.beginPath();
            context.rect(rect.x, rect.y, rect.width, rect.height);
            context.clip();
            context.translate(rect.x, rect.y);
            context.scale(rect.width / designRenderers.WIDTH, rect.height / designRenderers.HEIGHT);
            designRenderers.render(context, config.design, animated.metrics, state.history);
            context.restore();

            fulfill(changed || animated.moving || animated.settled === true);
        } catch (error) {
            reject(error);
        }
    });
}

function info() {
    return {
        name: 'design_dashboard',
        description: 'AceMagic S1 native design renderer - 170x320',
        fields: [{ name: 'design', value: 'string' }]
    };
}

module.exports = {
    draw,
    info,
    render: designRenderers.render
};
