'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const api = require('../api');

function responseRecorder() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test('reports version, license and upstream in the about endpoint', () => {
    const routes = {};
    const web = {
        get(route, handler) { routes[`GET ${route}`] = handler; },
        post(route, handler) { routes[`POST ${route}`] = handler; }
    };

    api.init(web, {
        config: { theme: 'themes/instrument/instrument.json' },
        state: { config_file: '/not/read' }
    });

    const response = responseRecorder();
    routes['GET /api/about']({}, response);

    assert.equal(response.body.version, require('../package.json').version);
    assert.equal(response.body.license, 'GPL-3.0-only');
    assert.equal(response.body.upstream_author, 'Tomasz Jaworski');
    assert.match(response.body.source_url, /^https:\/\/github\.com\/M-Lietz\//);
    assert.match(response.body.license_url, /\/blob\/main\/LICENSE$/);
});

test('activates a design only after the live renderer confirms a complete frame', async context => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 's1panel-api-'));
    const configFile = path.join(directory, 'config.json');
    context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
    await fs.promises.writeFile(configFile, JSON.stringify({
        theme: 'themes/instrument/instrument.json'
    }));

    const routes = {};
    const web = {
        get(route, handler) { routes[`GET ${route}`] = handler; },
        post(route, handler) { routes[`POST ${route}`] = handler; }
    };
    const config = { theme: 'themes/instrument/instrument.json' };
    const activations = [];

    api.init(web, {
        config,
        state: {
            config_file: configFile,
            async activate_theme(theme, id) {
                activations.push({ theme, id });
            }
        }
    });

    const response = responseRecorder();
    await routes['POST /api/designs/activate']({ body: { id: 'executive' } }, response);

    assert.deepEqual(activations, [{
        theme: 'themes/executive/executive.json',
        id: 'executive'
    }]);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'active');
    assert.equal(response.body.changed, true);
    assert.equal(config.theme, 'themes/executive/executive.json');
    assert.equal(JSON.parse(await fs.promises.readFile(configFile, 'utf8')).theme,
        'themes/executive/executive.json');
});

test('does not touch the renderer when the selected design is already active', async () => {
    const routes = {};
    const web = {
        get(route, handler) { routes[`GET ${route}`] = handler; },
        post(route, handler) { routes[`POST ${route}`] = handler; }
    };
    let activations = 0;

    api.init(web, {
        config: { theme: 'themes/instrument/instrument.json' },
        state: {
            config_file: '/not/read',
            async activate_theme() { activations++; }
        }
    });

    const response = responseRecorder();
    await routes['POST /api/designs/activate']({ body: { id: 'instrument' } }, response);

    assert.equal(activations, 0);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'active');
    assert.equal(response.body.changed, false);
});

test('restores instrument when a live renderer activation fails', async context => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 's1panel-api-'));
    const configFile = path.join(directory, 'config.json');
    context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
    await fs.promises.writeFile(configFile, JSON.stringify({
        theme: 'themes/instrument/instrument.json'
    }));

    const routes = {};
    const web = {
        get(route, handler) { routes[`GET ${route}`] = handler; },
        post(route, handler) { routes[`POST ${route}`] = handler; }
    };
    const config = { theme: 'themes/instrument/instrument.json' };
    const activations = [];

    api.init(web, {
        config,
        state: {
            config_file: configFile,
            async activate_theme(theme, id) {
                activations.push({ theme, id });
                if (id === 'architect') throw new Error('synthetic renderer failure');
            }
        }
    });

    const response = responseRecorder();
    await routes['POST /api/designs/activate']({ body: { id: 'architect' } }, response);

    assert.deepEqual(activations.map(each => each.id), ['architect', 'instrument']);
    assert.equal(response.statusCode, 500);
    assert.equal(config.theme, 'themes/instrument/instrument.json');
    assert.equal(JSON.parse(await fs.promises.readFile(configFile, 'utf8')).theme,
        'themes/instrument/instrument.json');
});
