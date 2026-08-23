'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

function create() {
    return { wanted: 1, completed: 0, inFlight: false };
}

function pending(state) {
    return state.completed < state.wanted;
}

function request(state) {
    const required = state.inFlight ? 2 : 1;
    if (state.wanted - state.completed < required) {
        state.wanted = state.completed + required;
    }
}

function start(state) {
    state.inFlight = true;
}

function fail(state) {
    state.inFlight = false;
}

function complete(state) {
    if (state.completed < state.wanted) state.completed++;
    state.inFlight = false;
}

module.exports = { create, pending, request, start, fail, complete };
