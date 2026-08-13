'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const assert = require('node:assert/strict');
const test = require('node:test');

const webSecurity = require('../lib/web_security');

test('sets the complete browser security policy and continues', () => {
    const actual = {};
    let continued = false;
    const response = {
        setHeader(name, value) {
            actual[name] = value;
        }
    };

    webSecurity.middleware({}, response, () => {
        continued = true;
    });

    assert.equal(continued, true);
    assert.deepEqual(actual, webSecurity.headers);
    assert.match(actual['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.equal(actual['X-Content-Type-Options'], 'nosniff');
});
