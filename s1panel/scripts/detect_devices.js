#!/usr/bin/env node
'use strict';
/*!
 * AceMagic S1 Display - local device detection
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const fs = require('fs');
const path = require('path');
const HID = require('node-hid');

const lcdDevices = HID.devices()
    .filter(device => device.vendorId === 0x04d9 && device.productId === 0xfd01)
    .map(device => ({ path: device.path, interface: device.interface }));

let ledDevices = [];
try {
    ledDevices = fs.readdirSync('/dev')
        .filter(name => /^ttyUSB\d+$/.test(name))
        .map(name => path.join('/dev', name));
} catch {
    ledDevices = [];
}

if (process.argv.includes('--lcd-path')) {
    if (lcdDevices[0]) console.log(lcdDevices[0].path);
    process.exit(lcdDevices.length > 0 ? 0 : 2);
}

if (process.argv.includes('--led-path')) {
    if (ledDevices[0]) console.log(ledDevices[0]);
    process.exit(ledDevices.length > 0 ? 0 : 2);
}

console.log(JSON.stringify({ lcd: lcdDevices, led: ledDevices }, null, 2));

if (lcdDevices.length === 0) {
    console.error('Kein AceMagic-S1-LCD (04d9:fd01) sichtbar.');
    process.exitCode = 2;
}
