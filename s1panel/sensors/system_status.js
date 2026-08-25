'use strict';
/*!
 * AceMagic S1 Display - Proxmox system status sensor
 * Copyright (c) 2026 Merlin Lietz and contributors
 * Based on s1panel by Tomasz Jaworski
 * SPDX-License-Identifier: GPL-3.0-only
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { execFile } = require('child_process');

const logger = require('../logger');

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_REFRESH_MS = 5000;
const DEFAULT_BACKUP_WARNING_HOURS = 36;
const DEFAULT_BACKUP_CRITICAL_HOURS = 72;
const DEFAULT_MEMORY_PRESSURE_WARNING_AVAILABLE_PERCENT = 15;
const DEFAULT_MEMORY_PRESSURE_CRITICAL_AVAILABLE_PERCENT = 5;
const DEFAULT_SWAP_PRESSURE_WARNING_PERCENT = 25;
const DEFAULT_SWAP_PRESSURE_CRITICAL_PERCENT = 75;
const DEFAULT_HEALTH_WARNING_SAMPLES = 3;
const DEFAULT_HEALTH_RECOVERY_SAMPLES = 2;
const GIBIBYTE = 1024 ** 3;
const KIBIBYTE = 1024;
const HOUR_SECONDS = 3600;

function monotonicMilliseconds() {
    return Math.floor(Number(process.hrtime.bigint()) / 1000000);
}

function resolvePveUrl(config) {
    const envName = config.pve_url_env || 'S1PANEL_PVE_URL';
    return config.pve_url || process.env[envName] || '';
}

function resolveToken(config) {
    const envName = config.token_env || 'S1PANEL_PVE_TOKEN';
    return process.env[envName] || '';
}

function loadCa(config) {
    if (!config.ca_file) return undefined;
    return fs.readFileSync(config.ca_file);
}

function requestJsonOnce(config, apiPath) {
    return new Promise((fulfill, reject) => {
        const baseUrl = resolvePveUrl(config);
        const token = resolveToken(config);

        if (!baseUrl) {
            reject(new Error('keine Proxmox-URL konfiguriert'));
            return;
        }
        if (!token) {
            reject(new Error('kein Proxmox-Token in der Laufzeitumgebung'));
            return;
        }

        let url;
        try {
            url = new URL(apiPath, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
        }
        catch (error) {
            reject(new Error('ungueltige Proxmox-URL'));
            return;
        }

        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && config.allow_http === true)) {
            reject(new Error('Proxmox-URL muss HTTPS verwenden'));
            return;
        }

        const transport = url.protocol === 'https:' ? https : http;
        const options = {
            headers: {
                accept: 'application/json',
                authorization: token
            },
            timeout: Number(config.request_timeout_ms) || DEFAULT_TIMEOUT_MS
        };

        if (url.protocol === 'https:') {
            options.rejectUnauthorized = true;
            options.ca = config._private?.ca;
        }

        const request = transport.get(url, options, response => {
            const chunks = [];
            let size = 0;

            response.on('data', chunk => {
                size += chunk.length;
                if (size > 4 * 1024 * 1024) {
                    request.destroy(new Error('Proxmox-Antwort ist zu gross'));
                    return;
                }
                chunks.push(chunk);
            });

            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error('Proxmox antwortet mit HTTP ' + response.statusCode));
                    return;
                }

                try {
                    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
                        throw new Error('ungueltige Proxmox-Antwort');
                    }
                    fulfill(payload.data);
                }
                catch (error) {
                    reject(error);
                }
            });
        });

        request.on('timeout', () => request.destroy(new Error('Proxmox-Anfrage hat das Zeitlimit erreicht')));
        request.on('error', reject);
    });
}

function transientRequestError(error) {
    return ['ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(error?.code)
        || /socket hang up|Zeitlimit erreicht/i.test(String(error?.message || error));
}

async function requestJson(config, apiPath) {
    try {
        return await requestJsonOnce(config, apiPath);
    }
    catch (error) {
        if (!transientRequestError(error)) throw error;
        await new Promise(resolve => setTimeout(resolve, 120));
        return requestJsonOnce(config, apiPath);
    }
}

function discoverPackageTemperature() {
    const root = '/sys/class/hwmon';
    try {
        for (const directory of fs.readdirSync(root)) {
            const base = path.join(root, directory);
            if (fs.readFileSync(path.join(base, 'name'), 'utf8').trim() !== 'coretemp') continue;

            for (let index = 1; index <= 10; index++) {
                const labelPath = path.join(base, 'temp' + index + '_label');
                try {
                    if (fs.readFileSync(labelPath, 'utf8').trim() === 'Package id 0') {
                        return path.join(base, 'temp' + index + '_input');
                    }
                }
                catch (error) {
                    // Nicht jeder hwmon-Kanal besitzt ein Label.
                }
            }
        }
    }
    catch (error) {
        return '';
    }
    return '';
}

function readTemperature(file) {
    if (!file) return 0;
    try {
        return Math.round(Number(fs.readFileSync(file, 'utf8').trim()) / 1000);
    }
    catch (error) {
        return 0;
    }
}

function parseGuestMeminfo(output) {
    const values = {};
    for (const line of String(output).split(/\r?\n/)) {
        const match = /^(MemTotal|MemAvailable):\s+(\d+)\s+kB$/.exec(line.trim());
        if (match) values[match[1]] = Number(match[2]) * KIBIBYTE;
    }

    if (!(values.MemTotal > 0) || !(values.MemAvailable >= 0) || values.MemAvailable > values.MemTotal) {
        throw new Error('ungueltige RAM-Antwort des Gasts');
    }

    return {
        totalBytes: values.MemTotal,
        availableBytes: values.MemAvailable,
        usedBytes: values.MemTotal - values.MemAvailable
    };
}

function probeGuestMemory(probe, timeoutMs) {
    return new Promise((fulfill, reject) => {
        const user = String(probe.user || 'root');
        const host = String(probe.host || '');
        const identityFile = String(probe.identity_file || '');
        const knownHostsFile = String(probe.known_hosts_file || '');

        if (!/^[a-z_][a-z0-9_-]*$/i.test(user) || !/^[a-z0-9_.:-]+$/i.test(host)) {
            reject(new Error('ungueltiges SSH-Ziel'));
            return;
        }
        if (!path.isAbsolute(identityFile) || !path.isAbsolute(knownHostsFile)) {
            reject(new Error('SSH-Schluessel und known_hosts muessen absolute Pfade sein'));
            return;
        }

        const effectiveTimeout = Math.max(500, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
        const connectTimeout = Math.max(1, Math.ceil(effectiveTimeout / 1000));
        const args = [
            '-F', '/dev/null',
            '-o', 'BatchMode=yes',
            '-o', 'IdentitiesOnly=yes',
            '-o', 'PasswordAuthentication=no',
            '-o', 'KbdInteractiveAuthentication=no',
            '-o', 'StrictHostKeyChecking=yes',
            '-o', 'UserKnownHostsFile=' + knownHostsFile,
            '-o', 'ConnectTimeout=' + connectTimeout,
            '-i', identityFile,
            '--', user + '@' + host,
            's1panel-memory'
        ];

        execFile('/usr/bin/ssh', args, {
            encoding: 'utf8',
            timeout: effectiveTimeout,
            maxBuffer: 8192,
            windowsHide: true
        }, (error, stdout) => {
            if (error) {
                reject(new Error('SSH-RAM-Abfrage fehlgeschlagen'));
                return;
            }
            try {
                fulfill(parseGuestMeminfo(stdout));
            }
            catch (parseError) {
                reject(parseError);
            }
        });
    });
}

async function collectWorkloadMemory(config, resources, probe = probeGuestMemory) {
    const configured = Array.isArray(config.guest_memory_probes) ? config.guest_memory_probes : [];
    if (configured.length === 0) return null;

    const running = Array.isArray(resources)
        ? resources.filter(resource => resource.status === 'running' && resource.template !== 1)
        : [];
    const probes = new Map(configured.map(item => [String(item.vmid), item]));
    const containersUsedBytes = running
        .filter(resource => resource.type === 'lxc')
        .reduce((sum, resource) => sum + Math.max(0, Number(resource.mem) || 0), 0);
    const virtualMachines = running.filter(resource => resource.type === 'qemu');
    const results = await Promise.all(virtualMachines.map(async resource => {
        const definition = probes.get(String(resource.vmid));
        if (!definition) {
            return { ok: false, vmid: resource.vmid, error: 'kein Messzugang konfiguriert' };
        }
        try {
            const measurement = await probe(definition, config.guest_probe_timeout_ms);
            return { ok: true, vmid: resource.vmid, usedBytes: measurement.usedBytes };
        }
        catch (error) {
            return { ok: false, vmid: resource.vmid, error: error.message };
        }
    }));

    return {
        usedBytes: containersUsedBytes + results
            .filter(result => result.ok)
            .reduce((sum, result) => sum + result.usedBytes, 0),
        complete: results.every(result => result.ok),
        errors: results.filter(result => !result.ok)
            .map(result => 'VM ' + result.vmid + ': ' + result.error)
    };
}

function analyzeBackupTasks(tasks, nowSeconds, warningHours, criticalHours) {
    const backupTasks = Array.isArray(tasks)
        ? tasks.filter(task => task.type === 'vzdump')
            .sort((left, right) => (Number(right.starttime) || 0) - (Number(left.starttime) || 0))
        : [];
    const running = backupTasks.find(task => !task.endtime);
    const successful = backupTasks.find(task => task.status === 'OK' && Number(task.endtime) > 0);
    const latest = backupTasks[0];
    const warningLimit = Math.max(1, Number(warningHours) || DEFAULT_BACKUP_WARNING_HOURS);
    const criticalLimit = Math.max(warningLimit, Number(criticalHours) || DEFAULT_BACKUP_CRITICAL_HOURS);

    if (running) {
        return {
            state: 'running',
            ageHours: successful ? Math.max(0, (nowSeconds - successful.endtime) / HOUR_SECONDS) : -1,
            message: 'BACKUP RUNNING'
        };
    }

    if (latest && latest.status && latest.status !== 'OK'
        && (!successful || Number(latest.starttime) > Number(successful.endtime))) {
        return { state: 'critical', ageHours: -1, message: 'BACKUP FAILED' };
    }

    if (!successful) {
        return { state: 'unknown', ageHours: -1, message: 'NO BACKUP DATA' };
    }

    const ageHours = Math.max(0, (nowSeconds - successful.endtime) / HOUR_SECONDS);
    if (ageHours >= criticalLimit) {
        return { state: 'critical', ageHours, message: 'BACKUP OVERDUE' };
    }
    if (ageHours >= warningLimit) {
        return { state: 'warning', ageHours, message: 'BACKUP AGING' };
    }
    return { state: 'ok', ageHours, message: 'BACKUP OK' };
}

function numericSetting(config, name, fallback, minimum, maximum) {
    const value = Number(config?.[name]);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(maximum, Math.max(minimum, value));
}

function assessHealth(metrics, config = {}) {
    const critical = message => ({ level: 'critical', message });
    const warning = message => ({ level: 'warning', message });
    const memoryWarningAvailable = numericSetting(
        config,
        'memory_pressure_warning_available_percent',
        DEFAULT_MEMORY_PRESSURE_WARNING_AVAILABLE_PERCENT,
        0,
        100
    );
    const memoryCriticalAvailable = numericSetting(
        config,
        'memory_pressure_critical_available_percent',
        DEFAULT_MEMORY_PRESSURE_CRITICAL_AVAILABLE_PERCENT,
        0,
        memoryWarningAvailable
    );
    const swapWarning = numericSetting(
        config,
        'swap_pressure_warning_percent',
        DEFAULT_SWAP_PRESSURE_WARNING_PERCENT,
        0,
        100
    );
    const swapCritical = numericSetting(
        config,
        'swap_pressure_critical_percent',
        DEFAULT_SWAP_PRESSURE_CRITICAL_PERCENT,
        swapWarning,
        100
    );

    if (metrics.storagePercent >= 95) return critical('STORAGE CRITICAL');
    if (metrics.cpuTempC >= 90) return critical('CPU TEMP CRITICAL');
    if (metrics.memoryPercent >= 95) return critical('RAM CRITICAL');
    if (metrics.hostMemoryAvailablePercent < memoryCriticalAvailable
        || metrics.swapPercent >= swapCritical) {
        return critical('RAM PRESSURE CRITICAL');
    }
    if (metrics.backupState === 'critical') return critical(metrics.backupMessage);

    if (metrics.storagePercent >= 85) return warning('STORAGE HIGH');
    if (metrics.cpuTempC >= 75) return warning('CPU TEMP HIGH');
    if (metrics.memoryPercent >= 85) return warning('RAM HIGH');
    if (metrics.hostMemoryAvailablePercent < memoryWarningAvailable
        && metrics.swapPercent >= swapWarning) {
        return warning('RAM PRESSURE');
    }
    if (metrics.backupState === 'warning' || metrics.backupState === 'unknown') {
        return warning(metrics.backupMessage);
    }
    if (!metrics.memoryMeasured) return warning('RAM DATA MISSING');
    if (metrics.vmCount < metrics.vmTotal) return warning('VM OFFLINE');
    if (metrics.ctCount < metrics.ctTotal) return warning('CT OFFLINE');

    return { level: 'ok', message: 'ALL SYSTEMS HEALTHY' };
}

function stabilizeHealth(metrics, state, warningSamples = DEFAULT_HEALTH_WARNING_SAMPLES,
    recoverySamples = DEFAULT_HEALTH_RECOVERY_SAMPLES) {
    const observed = {
        level: metrics.healthLevel,
        message: metrics.healthMessage
    };
    const required = observed.level === 'ok'
        ? Math.max(1, Math.round(Number(recoverySamples) || DEFAULT_HEALTH_RECOVERY_SAMPLES))
        : Math.max(1, Math.round(Number(warningSamples) || DEFAULT_HEALTH_WARNING_SAMPLES));

    if (observed.level === state.level && observed.message === state.message) {
        state.pendingLevel = '';
        state.pendingMessage = '';
        state.pendingCount = 0;
    }
    else {
        if (observed.level === state.pendingLevel && observed.message === state.pendingMessage) {
            state.pendingCount++;
        }
        else {
            state.pendingLevel = observed.level;
            state.pendingMessage = observed.message;
            state.pendingCount = 1;
        }

        if (state.pendingCount >= required) {
            state.level = observed.level;
            state.message = observed.message;
            state.pendingLevel = '';
            state.pendingMessage = '';
            state.pendingCount = 0;
        }
    }

    return {
        ...metrics,
        healthLevel: state.level,
        healthMessage: state.message
    };
}

function buildMetrics(nodeStatus, storageStatus, resources, temperature, nodeName,
    workloadMemory = null, backup = null, healthConfig = {}) {
    const totalMemory = Number(nodeStatus?.memory?.total) || 0;
    const availableMemory = Number(nodeStatus?.memory?.available) || 0;
    const storageTotal = Number(storageStatus?.total) || 0;
    const storageUsed = Number(storageStatus?.used) || 0;
    const swapTotal = Number(nodeStatus?.swap?.total) || 0;
    const swapUsed = Number(nodeStatus?.swap?.used) || 0;
    const uptime = Math.max(0, Number(nodeStatus?.uptime) || 0);
    const guests = Array.isArray(resources)
        ? resources.filter(resource => resource.node === nodeName && resource.template !== 1)
        : [];
    const running = guests.filter(resource => resource.status === 'running');

    const metrics = {
        hostConnected: true,
        cpuPercent: (Number(nodeStatus?.cpu) || 0) * 100,
        cpuTempC: temperature,
        storagePercent: storageTotal > 0 ? storageUsed / storageTotal * 100 : 0,
        swapPercent: swapTotal > 0 ? swapUsed / swapTotal * 100 : 0,
        hostMemoryAvailableGb: Math.min(totalMemory, availableMemory) / GIBIBYTE,
        hostMemoryAvailablePercent: totalMemory > 0 ? Math.min(totalMemory, availableMemory) / totalMemory * 100 : 100,
        backupState: backup?.state || 'unknown',
        backupAgeHours: Number(backup?.ageHours) || 0,
        backupMessage: backup?.message || 'NO BACKUP DATA',
        vmCount: running.filter(resource => resource.type === 'qemu').length,
        vmTotal: guests.filter(resource => resource.type === 'qemu').length,
        ctCount: running.filter(resource => resource.type === 'lxc').length,
        ctTotal: guests.filter(resource => resource.type === 'lxc').length,
        uptimeDays: Math.floor(uptime / 86400),
        uptimeHours: Math.floor((uptime % 86400) / 3600),
        uptimeMinutes: Math.floor((uptime % 3600) / 60)
    };

    if (workloadMemory) {
        const usedMemory = Math.min(totalMemory, Math.max(0, workloadMemory.usedBytes));
        metrics.memoryPercent = totalMemory > 0 ? usedMemory / totalMemory * 100 : 0;
        metrics.memoryUsedGb = usedMemory / GIBIBYTE;
        metrics.memoryMeasured = workloadMemory.complete;
        metrics.memoryMode = 'guest-workload';
        metrics.memoryProbeErrors = workloadMemory.errors;
    }
    else {
        metrics.memoryTotalGb = totalMemory / GIBIBYTE;
        metrics.memoryAvailableGb = Math.min(totalMemory, availableMemory) / GIBIBYTE;
        metrics.memoryMeasured = true;
        metrics.memoryMode = 'host-occupied';
    }

    const health = assessHealth(metrics, healthConfig);
    metrics.healthLevel = health.level;
    metrics.healthMessage = health.message;

    return metrics;
}

async function collect(config) {
    const nodeName = config.node || 'pve';
    const storageName = config.storage || 'local-lvm';
    const [nodeStatus, storageStatus, resources, taskResult] = await Promise.all([
        requestJson(config, '/api2/json/nodes/' + encodeURIComponent(nodeName) + '/status'),
        requestJson(config, '/api2/json/nodes/' + encodeURIComponent(nodeName) + '/storage/' + encodeURIComponent(storageName) + '/status'),
        requestJson(config, '/api2/json/cluster/resources?type=vm'),
        requestJson(config, '/api2/json/nodes/' + encodeURIComponent(nodeName) + '/tasks?typefilter=vzdump&source=all&limit=50')
            .then(tasks => ({ tasks, error: '' }))
            .catch(error => ({ tasks: null, error: error.message }))
    ]);

    const localResources = Array.isArray(resources)
        ? resources.filter(resource => resource.node === nodeName && resource.template !== 1)
        : [];
    const workloadMemory = await collectWorkloadMemory(config, localResources);
    const backup = analyzeBackupTasks(
        taskResult.tasks,
        Math.floor(Date.now() / 1000),
        config.backup_warning_hours,
        config.backup_critical_hours
    );

    const metrics = buildMetrics(
        nodeStatus,
        storageStatus,
        resources,
        readTemperature(config._private.temperaturePath),
        nodeName,
        workloadMemory,
        backup,
        config
    );
    if (taskResult.error) metrics.backupProbeError = taskResult.error;
    return metrics;
}

async function sample(rate, format, config) {
    const privateState = config._private;
    const now = monotonicMilliseconds();
    const refresh = Math.max(Number(rate) || 0, Number(config.refresh_ms) || DEFAULT_REFRESH_MS);

    if (!privateState.lastSampled || now - privateState.lastSampled > refresh) {
        privateState.lastSampled = now;

        try {
            const collected = await collect(config);
            privateState.value = stabilizeHealth(
                collected,
                privateState.health,
                config.health_warning_samples,
                config.health_recovery_samples
            );
            privateState.fault = false;
            const probeErrors = privateState.value.memoryProbeErrors || [];
            if (probeErrors.length > 0 && !privateState.memoryFault) {
                logger.error('system_status sensor: ' + probeErrors.join('; '));
                privateState.memoryFault = true;
            }
            else if (probeErrors.length === 0) {
                privateState.memoryFault = false;
            }
            if (privateState.value.backupProbeError && !privateState.backupFault) {
                logger.error('system_status sensor: Backupstatus nicht lesbar: ' + privateState.value.backupProbeError);
                privateState.backupFault = true;
            }
            else if (!privateState.value.backupProbeError) {
                privateState.backupFault = false;
            }
        }
        catch (error) {
            privateState.value = { ...privateState.value, hostConnected: false };
            if (!privateState.fault) {
                logger.error('system_status sensor: ' + error.message);
                privateState.fault = true;
            }
        }
    }

    return { value: privateState.value, min: 0, max: 100 };
}

function init(config) {
    config._private = {
        ca: loadCa(config),
        temperaturePath: config.temperature_path || discoverPackageTemperature(),
        lastSampled: 0,
        fault: false,
        memoryFault: false,
        backupFault: false,
        health: {
            level: 'ok',
            message: 'ALL SYSTEMS HEALTHY',
            pendingLevel: '',
            pendingMessage: '',
            pendingCount: 0
        },
        value: { hostConnected: false }
    };

    logger.info('initialize: system_status sensor loaded (direct Proxmox API, credentials from environment)');
    return 'system_status';
}

function stop() {
    return Promise.resolve();
}

function settings() {
    return {
        name: 'system_status',
        description: 'Direct read-only Proxmox metrics for the Instrument dashboard',
        icon: 'pi-server',
        multiple: false,
        ident: [],
        fields: [
            { name: 'pve_url', type: 'string', value: '' },
            { name: 'pve_url_env', type: 'string', value: 'S1PANEL_PVE_URL' },
            { name: 'token_env', type: 'string', value: 'S1PANEL_PVE_TOKEN' },
            { name: 'node', type: 'string', value: 'pve' },
            { name: 'storage', type: 'string', value: 'local-lvm' },
            { name: 'ca_file', type: 'string', value: '' },
            { name: 'temperature_path', type: 'string', value: '' },
            { name: 'refresh_ms', type: 'number', value: DEFAULT_REFRESH_MS },
            { name: 'request_timeout_ms', type: 'number', value: DEFAULT_TIMEOUT_MS },
            { name: 'guest_probe_timeout_ms', type: 'number', value: DEFAULT_TIMEOUT_MS },
            { name: 'backup_warning_hours', type: 'number', value: DEFAULT_BACKUP_WARNING_HOURS },
            { name: 'backup_critical_hours', type: 'number', value: DEFAULT_BACKUP_CRITICAL_HOURS },
            { name: 'memory_pressure_warning_available_percent', type: 'number', value: DEFAULT_MEMORY_PRESSURE_WARNING_AVAILABLE_PERCENT },
            { name: 'memory_pressure_critical_available_percent', type: 'number', value: DEFAULT_MEMORY_PRESSURE_CRITICAL_AVAILABLE_PERCENT },
            { name: 'swap_pressure_warning_percent', type: 'number', value: DEFAULT_SWAP_PRESSURE_WARNING_PERCENT },
            { name: 'swap_pressure_critical_percent', type: 'number', value: DEFAULT_SWAP_PRESSURE_CRITICAL_PERCENT },
            { name: 'health_warning_samples', type: 'number', value: DEFAULT_HEALTH_WARNING_SAMPLES },
            { name: 'health_recovery_samples', type: 'number', value: DEFAULT_HEALTH_RECOVERY_SAMPLES },
            { name: 'allow_http', type: 'boolean', value: false }
        ]
    };
}

module.exports = {
    init,
    settings,
    sample,
    stop,
    requestJson,
    parseGuestMeminfo,
    probeGuestMemory,
    collectWorkloadMemory,
    analyzeBackupTasks,
    assessHealth,
    stabilizeHealth,
    buildMetrics,
    collect
};
