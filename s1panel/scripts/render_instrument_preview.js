'use strict';
/*!
 * AceMagic S1 Display - instrument preview renderer
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const dashboard = require('../widgets/instrument_dashboard');
const fixture = require('../test/fixtures/instrument_status.json');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'screenshots', 'instrument-dashboard.png');
async function main() {
    const canvas = createCanvas(170, 320);
    const context = canvas.getContext('2d');
    let now = Date.UTC(2026, 7, 23, 12, 0, 0);
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now
    };

    await dashboard.draw(context, fixture, 0, 0, config);
    config._private.history.cpu = [4, 8, 7, 11, 6].map((value, index) => ({
        time: now - (4 - index) * 60000,
        value
    }));
    config._private.history.memory = [16, 17, 17, 19, 18].map((value, index) => ({
        time: now - (4 - index) * 60000,
        value
    }));
    // Fest definierter Scanner-Zeitpunkt: Die gespeicherte Vorschau muss auf
    // jedem Rechner und in GitHub Actions bytegleich reproduzierbar bleiben.
    now += 1500;
    await dashboard.draw(context, fixture, 0, 0, config);
    fs.writeFileSync(output, canvas.toBuffer('image/png', {
        compressionLevel: 9,
        filters: canvas.PNG_FILTER_NONE
    }));
    console.log(output);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
