'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const test = require('node:test');
const assert = require('node:assert/strict');

const tracker = require('../lib/redraw_tracker');

test('keeps one initial redraw pending without duplicating requests', () => {
    const state = tracker.create();

    assert.equal(tracker.pending(state), true);
    tracker.request(state);
    tracker.request(state);
    assert.deepEqual(state, { wanted: 1, completed: 0, inFlight: false });
});

test('retries a failed redraw without growing an endless backlog', () => {
    const state = tracker.create();

    for (let attempt = 0; attempt < 8; attempt++) {
        tracker.start(state);
        tracker.fail(state);
        tracker.request(state);
    }

    assert.deepEqual(state, { wanted: 1, completed: 0, inFlight: false });
    tracker.start(state);
    tracker.complete(state);
    assert.equal(tracker.pending(state), false);
});

test('keeps exactly one follow-up redraw requested during a transfer', () => {
    const state = tracker.create();

    tracker.start(state);
    tracker.request(state);
    tracker.request(state);
    assert.deepEqual(state, { wanted: 2, completed: 0, inFlight: true });

    tracker.complete(state);
    assert.equal(tracker.pending(state), true);
    tracker.start(state);
    tracker.complete(state);
    assert.equal(tracker.pending(state), false);
});
