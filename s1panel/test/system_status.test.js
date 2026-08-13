'use strict';
/* Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only */

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const sensor = require('../sensors/system_status');

const GIBIBYTE = 1024 ** 3;

function responseFor(pathname) {
    if (pathname === '/api2/json/nodes/pve/status') {
        return {
            cpu: 0.08,
            memory: { total: 16 * GIBIBYTE, available: 4 * GIBIBYTE },
            swap: { total: 8 * GIBIBYTE, used: 8 * 1024 ** 2 },
            uptime: 338400
        };
    }
    if (pathname === '/api2/json/nodes/pve/storage/local-lvm/status') {
        return { total: 1000, used: 94 };
    }
    if (pathname === '/api2/json/cluster/resources') {
        return [
            { node: 'pve', vmid: 100, status: 'running', type: 'qemu' },
            { node: 'pve', vmid: 101, status: 'running', type: 'lxc', mem: GIBIBYTE / 4 },
            { node: 'pve', vmid: 102, status: 'running', type: 'lxc', mem: GIBIBYTE / 8 },
            { node: 'pve', vmid: 110, status: 'running', type: 'lxc', mem: GIBIBYTE / 8 },
            { node: 'pve', status: 'stopped', type: 'lxc' },
            { node: 'pve', status: 'stopped', type: 'qemu', template: 1 },
            { node: 'other', status: 'running', type: 'qemu' }
        ];
    }
    if (pathname === '/api2/json/nodes/pve/tasks') {
        const now = Math.floor(Date.now() / 1000);
        return [{ type: 'vzdump', starttime: now - 7300, endtime: now - 7200, status: 'OK' }];
    }
    return undefined;
}

function startPveServer(expectedToken) {
    return new Promise(resolve => {
        const server = http.createServer((request, response) => {
            assert.equal(request.headers.authorization, expectedToken);
            const payload = responseFor(new URL(request.url, 'http://localhost').pathname);
            if (payload === undefined) {
                response.writeHead(404).end();
                return;
            }
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ data: payload }));
        });

        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({ server, url: 'http://127.0.0.1:' + address.port });
        });
    });
}

test('collects existing Proxmox metrics without an intermediate service', async t => {
    const tokenEnv = 'S1PANEL_TEST_PVE_TOKEN';
    const previousToken = process.env[tokenEnv];
    const token = 'PVEAPIToken=test@pve!display=test-only-token';
    process.env[tokenEnv] = token;

    const { server, url } = await startPveServer(token);
    t.after(() => {
        server.close();
        if (previousToken === undefined) delete process.env[tokenEnv];
        else process.env[tokenEnv] = previousToken;
    });

    const config = {
        pve_url: url,
        token_env: tokenEnv,
        node: 'pve',
        storage: 'local-lvm',
        temperature_path: '/does/not/exist',
        allow_http: true
    };
    sensor.init(config);

    const result = await sensor.sample(1000, '{0}', config);
    const { backupAgeHours, ...stableValue } = result.value;
    assert.ok(backupAgeHours >= 2 && backupAgeHours < 2.01);
    assert.deepEqual(stableValue, {
        hostConnected: true,
        cpuPercent: 8,
        cpuTempC: 0,
        memoryTotalGb: 16,
        memoryAvailableGb: 4,
        memoryMeasured: true,
        memoryMode: 'host-occupied',
        storagePercent: 9.4,
        swapPercent: 0.09765625,
        backupState: 'ok',
        backupMessage: 'BACKUP OK',
        vmCount: 1,
        vmTotal: 1,
        ctCount: 3,
        ctTotal: 4,
        uptimeDays: 3,
        uptimeHours: 22,
        uptimeMinutes: 0,
        healthLevel: 'warning',
        healthMessage: 'CT OFFLINE'
    });
});

test('classifies fresh, running and failed backups', () => {
    const now = 1_800_000_000;
    assert.deepEqual(sensor.analyzeBackupTasks([
        { type: 'vzdump', starttime: now - 4000, endtime: now - 3900, status: 'OK' }
    ], now, 36, 72), {
        state: 'ok',
        ageHours: 3900 / 3600,
        message: 'BACKUP OK'
    });
    assert.equal(sensor.analyzeBackupTasks([
        { type: 'vzdump', starttime: now - 10 }
    ], now, 36, 72).state, 'running');
    assert.equal(sensor.analyzeBackupTasks([
        { type: 'vzdump', starttime: now - 20, endtime: now - 10, status: 'ERROR' }
    ], now, 36, 72).state, 'critical');
});

test('prioritizes critical health conditions over warnings', () => {
    assert.deepEqual(sensor.assessHealth({
        storagePercent: 96,
        cpuTempC: 50,
        memoryPercent: 20,
        swapPercent: 0,
        backupState: 'warning',
        backupMessage: 'BACKUP AGING',
        memoryMeasured: true,
        vmCount: 1,
        vmTotal: 1,
        ctCount: 3,
        ctTotal: 3
    }), { level: 'critical', message: 'STORAGE CRITICAL' });
});

test('parses Linux MemAvailable as reclaimable guest memory', () => {
    assert.deepEqual(sensor.parseGuestMeminfo(
        'MemTotal:       10485760 kB\nMemFree:         900000 kB\nMemAvailable:    7864320 kB\n'
    ), {
        totalBytes: 10 * GIBIBYTE,
        availableBytes: 7.5 * GIBIBYTE,
        usedBytes: 2.5 * GIBIBYTE
    });
});

test('sums measured VM memory and live container cgroups', async () => {
    const resources = responseFor('/api2/json/cluster/resources')
        .filter(resource => resource.node === 'pve');
    const measurement = await sensor.collectWorkloadMemory({
        guest_memory_probes: [{ vmid: 100 }]
    }, resources, async probe => {
        assert.equal(probe.vmid, 100);
        return { usedBytes: 2.5 * GIBIBYTE };
    });

    assert.deepEqual(measurement, {
        usedBytes: 3 * GIBIBYTE,
        complete: true,
        errors: []
    });

    const metrics = sensor.buildMetrics(
        responseFor('/api2/json/nodes/pve/status'),
        responseFor('/api2/json/nodes/pve/storage/local-lvm/status'),
        resources,
        42,
        'pve',
        measurement
    );
    assert.equal(metrics.memoryPercent, 18.75);
    assert.equal(metrics.memoryUsedGb, 3);
    assert.equal(metrics.memoryMeasured, true);
    assert.equal(metrics.memoryMode, 'guest-workload');
});

test('marks workload memory unavailable instead of undercounting an unprobed VM', async () => {
    const measurement = await sensor.collectWorkloadMemory({
        guest_memory_probes: [{ vmid: 999 }]
    }, [{ node: 'pve', vmid: 100, status: 'running', type: 'qemu' }], async () => {
        throw new Error('darf nicht aufgerufen werden');
    });

    assert.equal(measurement.complete, false);
    assert.deepEqual(measurement.errors, ['VM 100: kein Messzugang konfiguriert']);
});

test('rejects plain HTTP unless it is explicitly enabled', async () => {
    const tokenEnv = 'S1PANEL_TEST_PVE_TOKEN_REJECT';
    process.env[tokenEnv] = 'PVEAPIToken=test@pve!display=test-only-token';
    try {
        await assert.rejects(
            sensor.requestJson({ pve_url: 'http://127.0.0.1', token_env: tokenEnv }, '/api2/json/version'),
            /HTTPS verwenden/
        );
    }
    finally {
        delete process.env[tokenEnv];
    }
});
