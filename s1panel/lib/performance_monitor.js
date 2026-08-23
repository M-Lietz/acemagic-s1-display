'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const DEFAULT_WINDOW_MS = 30000;
const ACTIVE_FRAME_GAP_MS = 1000;

function round(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

class PerformanceMonitor {
    constructor(options = {}) {
        this.windowMs = Math.max(5000, Number(options.windowMs) || DEFAULT_WINDOW_MS);
        this.now = typeof options.now === 'function' ? options.now : Date.now;
        this.cycles = [];
        this.transfers = [];
        this.errors = [];
    }

    prune(now) {
        const oldest = now - this.windowMs;
        while (this.cycles.length && this.cycles[0].at < oldest) this.cycles.shift();
        while (this.transfers.length && this.transfers[0].at < oldest) this.transfers.shift();
        while (this.errors.length && this.errors[0].at < oldest) this.errors.shift();
    }

    recordCycle(busy) {
        const now = this.now();
        this.cycles.push({ at: now, busy: busy === true });
        this.prune(now);
    }

    recordTransfer(message = {}) {
        const now = this.now();
        this.transfers.push({
            at: now,
            type: message.type === 'redraw' ? 'redraw' : 'update',
            durationMs: Math.max(0, Number(message.durationMs) || 0),
            reports: Math.max(0, Number(message.reports) || 0),
            pixels: Math.max(0, Number(message.pixels) || 0)
        });
        this.prune(now);
    }

    recordError(operation) {
        const now = this.now();
        this.errors.push({ at: now, operation: operation === 'redraw' ? 'redraw' : 'update' });
        this.prune(now);
    }

    snapshot() {
        const now = this.now();
        this.prune(now);
        const busyCycles = this.cycles.filter(each => each.busy).length;
        const partial = this.transfers.filter(each => each.type === 'update');
        const durations = this.transfers.map(each => each.durationMs);
        const activeIntervals = [];

        for (let index = 1; index < this.transfers.length; index++) {
            const interval = this.transfers[index].at - this.transfers[index - 1].at;
            if (interval > 0 && interval <= ACTIVE_FRAME_GAP_MS) activeIntervals.push(interval);
        }

        const average = values => values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : 0;
        const last = this.transfers.at(-1);

        return {
            window_ms: this.windowMs,
            render_cycles: this.cycles.length,
            busy_cycles: busyCycles,
            busy_percent: this.cycles.length ? round(busyCycles / this.cycles.length * 100) : 0,
            completed_transfers: this.transfers.length,
            partial_transfers: partial.length,
            full_redraws: this.transfers.length - partial.length,
            operation_errors: this.errors.length,
            update_errors: this.errors.filter(each => each.operation === 'update').length,
            redraw_errors: this.errors.filter(each => each.operation === 'redraw').length,
            animation_fps: activeIntervals.length ? round(1000 / average(activeIntervals), 2) : 0,
            average_transfer_ms: round(average(durations)),
            maximum_transfer_ms: durations.length ? Math.max(...durations) : 0,
            average_partial_reports: round(average(partial.map(each => each.reports))),
            average_partial_pixels: Math.round(average(partial.map(each => each.pixels))),
            usb_busy_percent: round(durations.reduce((sum, value) => sum + value, 0) / this.windowMs * 100),
            last_transfer: last ? {
                type: last.type,
                age_ms: Math.max(0, now - last.at),
                duration_ms: last.durationMs,
                reports: last.reports,
                pixels: last.pixels
            } : null
        };
    }
}

module.exports = { PerformanceMonitor };
