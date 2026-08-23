'use strict';
/*!
 * AceMagic S1 Display - instrument motion renderer
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createCanvas } = require('canvas');

const dashboard = require('../widgets/instrument_dashboard');
const fixture = require('../test/fixtures/instrument_status.json');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'screenshots', 'instrument-motion-preview.gif'));
async function main() {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'acemagic-motion-'));
    const canvas = createCanvas(170, 320);
    const context = canvas.getContext('2d');
    let now = 10000;
    const config = {
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now
    };
    const start = structuredClone(fixture);
    const target = structuredClone(fixture);
    target.metrics.cpuPercent = 82;
    target.metrics.cpuTempC = 79;
    target.metrics.memoryPercent = 47;
    target.metrics.memoryUsedGb = 7.3;
    target.metrics.storagePercent = 86;
    target.metrics.healthLevel = 'warning';

    try {
        fs.mkdirSync(path.dirname(output), { recursive: true });
        await dashboard.draw(context, start, 0, 0, config);
        config._private.history.cpu = [5, 7, 6, 9, 6].map((value, index) => ({
            time: now - (4 - index) * 60000,
            value
        }));
        config._private.history.memory = [17, 18, 18, 19, 18].map((value, index) => ({
            time: now - (4 - index) * 60000,
            value
        }));

        for (let frame = 0; frame < 96; frame++) {
            if (frame > 0) now += 125;
            await dashboard.draw(context, frame < 32 ? start : target, 0, 0, config);
            const filename = path.join(tempDirectory, `frame-${String(frame).padStart(2, '0')}.png`);
            fs.writeFileSync(filename, canvas.toBuffer('image/png'));
        }

        execFileSync('ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-framerate', '8', '-i', path.join(tempDirectory, 'frame-%02d.png'),
            '-filter_complex',
            '[0:v]scale=340:640:flags=lanczos,split[frames][palette_input];' +
                '[palette_input]palettegen=max_colors=128:stats_mode=diff[palette];' +
                '[frames][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
            '-loop', '0', output
        ]);
        console.log(output);
    }
    finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
