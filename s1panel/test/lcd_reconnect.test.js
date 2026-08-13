'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { Worker } = require('node:worker_threads');

test('LCD worker retries an unavailable USB device', async t => {
    const worker = new Worker(path.join(__dirname, '..', 'lcd_thread.js'), {
        workerData: {
            device: '/definitely/not/a/hid/device',
            poll: 100,
            refresh: 100,
            heartbeat: 1000,
            reconnectDelay: 50
        }
    });
    t.after(() => worker.terminate());

    const attempts = await new Promise((resolve, reject) => {
        let disconnected = 0;
        const timeout = setTimeout(() => reject(new Error('kein USB-Reconnect beobachtet')), 3000);
        worker.on('message', message => {
            if (message.type === 'device' && message.connected === false) {
                disconnected++;
                if (disconnected >= 2) {
                    clearTimeout(timeout);
                    resolve(disconnected);
                }
            }
        });
        worker.on('error', reject);
    });

    assert.ok(attempts >= 2);
});
