'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createCanvas } = require('canvas');

const dashboard = require('../widgets/design_dashboard');
const renderers = require('../lib/design_renderers');
const fixture = require('./fixtures/instrument_status.json');

const DESIGN_IDS = Object.keys(renderers.RENDERERS);

test('all twelve additional designs render as distinct native 170x320 images', () => {
    const hashes = new Set();

    DESIGN_IDS.forEach(design => {
        const canvas = createCanvas(170, 320);
        renderers.render(canvas.getContext('2d'), design, fixture.metrics, {
            cpu: [{ value: 4 }, { value: 9 }, { value: 6 }],
            memory: [{ value: 15 }, { value: 17 }, { value: 18 }]
        });
        const png = canvas.toBuffer('image/png');
        assert.ok(png.length > 8000, `${design} erzeugt kein vollständiges Bild`);
        hashes.add(crypto.createHash('sha256').update(png).digest('hex'));
    });

    assert.equal(hashes.size, DESIGN_IDS.length);
});

test('every design handles warning, offline and unavailable memory states', () => {
    const states = [
        { metrics: { ...fixture.metrics, healthLevel: 'warning', healthMessage: 'BACKUP WARNING' } },
        { metrics: { ...fixture.metrics, hostConnected: false, healthLevel: 'critical', healthMessage: 'HOST OFFLINE' } },
        { metrics: { ...fixture.metrics, memoryMeasured: false, healthLevel: 'warning', healthMessage: 'RAM N/A' } }
    ];

    DESIGN_IDS.forEach(design => {
        states.forEach(state => {
            const canvas = createCanvas(170, 320);
            assert.doesNotThrow(() => renderers.render(canvas.getContext('2d'), design, state.metrics));
            assert.ok(canvas.toBuffer('image/png').length > 7000);
        });
    });
});

test('instrument uses pixel diffs while all other designs keep atomic redraw transfers', async () => {
    const appDir = path.resolve(__dirname, '..');
    const catalog = JSON.parse(await fs.promises.readFile(path.join(appDir, 'designs', 'catalog.json')));

    for (const design of catalog.designs) {
        const theme = JSON.parse(await fs.promises.readFile(path.join(appDir, design.theme)));
        assert.equal(theme.refresh, design.id === 'instrument' ? 'diff' : 'redraw', design.id);
        if (design.id === 'instrument') assert.equal(theme.frame_interval_ms, 160);
        assert.deepEqual(theme.screens[0].widgets[0].rect,
            { x: 0, y: 0, width: 170, height: 320 }, design.id);
    }
});

test('shared dashboard animates updates and rejects unknown renderer IDs', async () => {
    const canvas = createCanvas(170, 320);
    let now = 1000;
    const config = {
        design: 'minimal',
        rect: { x: 0, y: 0, width: 170, height: 320 },
        now: () => now
    };

    assert.equal(await dashboard.draw(canvas.getContext('2d'), fixture, 0, 0, config), true);
    const changed = structuredClone(fixture);
    changed.metrics.cpuPercent = 62;
    now += 100;
    assert.equal(await dashboard.draw(canvas.getContext('2d'), changed, 0, 0, config), true);
    assert.ok(config._private.displayed.cpuPercent < 62);
    now += 1200;
    assert.equal(await dashboard.draw(canvas.getContext('2d'), changed, 0, 0, config), true);
    assert.equal(config._private.displayed.cpuPercent, 62);

    await assert.rejects(
        dashboard.draw(canvas.getContext('2d'), fixture, 0, 0, {
            design: 'unknown',
            rect: config.rect
        }),
        /Unbekanntes Design/
    );
});
