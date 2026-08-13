'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const designCatalog = require('../lib/design_catalog');

function catalogFixture() {
    return {
        designs: [
            {
                number: 1,
                id: 'instrument',
                name: 'Instrument',
                status: 'implemented',
                preview: 'concepts/01-instrument.png',
                theme: 'themes/instrument/instrument.json'
            },
            {
                number: 2,
                id: 'concept',
                name: 'Concept',
                status: 'selected',
                preview: 'concepts/02-concept.png'
            }
        ]
    };
}

test('lists only implemented designs as available', () => {
    const designs = designCatalog.listDesigns(catalogFixture(), 'themes/instrument/instrument.json');

    assert.equal(designs.length, 2);
    assert.equal(designs[0].active, true);
    assert.equal(designs[0].available, true);
    assert.equal(designs[0].preview_url, '/design-previews/concepts/01-instrument.png');
    assert.equal(designs[1].active, false);
    assert.equal(designs[1].available, false);
});

test('rejects concepts and unknown IDs without changing configuration', async () => {
    const result = await designCatalog.selectDesign({
        catalog: catalogFixture(),
        id: 'concept',
        configFile: '/not/read/config.json',
        homeDir: '/not/read'
    });

    assert.equal(result.status, 'unavailable');
});

test('writes an activatable design atomically and keeps a rollback copy', async (context) => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 's1panel-design-'));
    context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));

    const themeDirectory = path.join(directory, 'themes', 'instrument');
    const configFile = path.join(directory, 'config.json');
    await fs.promises.mkdir(themeDirectory, { recursive: true });
    await fs.promises.writeFile(path.join(themeDirectory, 'instrument.json'), '{}');
    await fs.promises.writeFile(configFile, JSON.stringify({ theme: 'themes/old/old.json', poll: 250 }));

    const result = await designCatalog.selectDesign({
        catalog: catalogFixture(),
        id: 'instrument',
        configFile,
        appDir: directory
    });

    const current = JSON.parse(await fs.promises.readFile(configFile, 'utf8'));
    const previous = JSON.parse(await fs.promises.readFile(configFile + '.previous', 'utf8'));

    assert.equal(result.status, 'activating');
    assert.equal(current.theme, 'themes/instrument/instrument.json');
    assert.equal(current.poll, 250);
    assert.equal(previous.theme, 'themes/old/old.json');
});

test('does not rewrite the configuration when the design is already active', async (context) => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 's1panel-design-'));
    context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));

    const themeDirectory = path.join(directory, 'themes', 'instrument');
    const configFile = path.join(directory, 'config.json');
    await fs.promises.mkdir(themeDirectory, { recursive: true });
    await fs.promises.writeFile(path.join(themeDirectory, 'instrument.json'), '{}');
    await fs.promises.writeFile(configFile, JSON.stringify({ theme: 'themes/instrument/instrument.json' }));

    const result = await designCatalog.selectDesign({
        catalog: catalogFixture(),
        id: 'instrument',
        configFile,
        appDir: directory
    });

    assert.equal(result.status, 'active');
    assert.equal(result.changed, false);
    assert.equal(fs.existsSync(configFile + '.previous'), false);
});

test('blocks theme paths outside the application directory', () => {
    assert.throws(
        () => designCatalog.resolveInside('/srv/s1panel', '../secret.json'),
        /außerhalb/
    );
});

test('all real catalog designs can be selected without modifying a release', async (context) => {
    const appDir = path.resolve(__dirname, '..');
    const catalog = await designCatalog.loadCatalog(path.join(appDir, 'designs', 'catalog.json'));
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 's1panel-catalog-'));
    const configFile = path.join(directory, 'config.json');
    context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));

    await fs.promises.writeFile(configFile, JSON.stringify({
        theme: 'themes/instrument/instrument.json',
        poll: 250
    }));

    assert.equal(catalog.designs.length, 13);

    for (const design of catalog.designs) {
        const result = await designCatalog.selectDesign({
            catalog,
            id: design.id,
            configFile,
            appDir
        });
        const stored = JSON.parse(await fs.promises.readFile(configFile, 'utf8'));

        assert.notEqual(result.status, 'unavailable', design.id);
        assert.equal(stored.theme, design.theme, design.id);
        assert.equal(stored.poll, 250, design.id);
    }
});
