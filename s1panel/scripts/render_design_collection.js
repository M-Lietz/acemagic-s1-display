'use strict';
/*!
 * AceMagic S1 Display - design collection renderer
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const designRenderers = require('../lib/design_renderers');
const { normalizeMetrics } = require('../lib/instrument_metrics');
const instrument = require('../widgets/instrument_dashboard');
const fixture = require('../test/fixtures/instrument_status.json');
const catalog = require('../designs/catalog.json');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'designs', 'previews');
const history = {
    cpu: [4, 7, 5, 9, 8, 12, 7, 10, 6].map((value, index) => ({ time: index, value })),
    memory: [14, 15, 15, 16, 17, 16, 18, 18, 18].map((value, index) => ({ time: index, value }))
};

fs.mkdirSync(outputDirectory, { recursive: true });
const metrics = normalizeMetrics(fixture);

catalog.designs.forEach(design => {
    const canvas = createCanvas(170, 320);
    const context = canvas.getContext('2d');

    if (design.id === 'instrument') {
        instrument.render(context, metrics, history);
    } else {
        designRenderers.render(context, design.id, metrics, history);
    }

    const output = path.join(outputDirectory, `${design.id}.png`);
    fs.writeFileSync(output, canvas.toBuffer('image/png', {
        compressionLevel: 9,
        filters: canvas.PNG_FILTER_NONE
    }));
    console.log(output);
});
