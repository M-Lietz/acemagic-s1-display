'use strict';
/*!
 * s1panel - lcd_thread
 * Copyright (c) 2024-2025 Tomasz Jaworski
 * Modifications Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */
const threads     = require('worker_threads');
const node_hid    = require('node-hid');
const lcd         = require('./lcd_device');
const logger      = require('./logger');

const usb_hid     = node_hid.HIDAsync;

node_hid.setDriverType('libusb');

const START_COOL_DOWN = 1000;
const POLL_TIMEOUT = 10;
const RECONNECT_DELAY = 3000;
const ERROR_LOG_INTERVAL = 30000;
const UPDATE_RETRY_DELAY = 80;
const UPDATE_RETRIES = 2;
const UPDATE_REPORT_PAUSE = 15;

// my hid throws way too many of these errors, hide them by default!
const DEBUG_TRACE = false;

function get_hr_time() {

    return Math.floor(Number(process.hrtime.bigint()) / 1000000);
}

function start_lcd_redraw(handle, state, job) {
    const startedAt = get_hr_time();
    return lcd.redraw(handle, job.image).then(() => ({
        type: 'redraw',
        complete: true,
        durationMs: get_hr_time() - startedAt,
        reports: 27,
        pixels: job.image.data.length
    }));
}

function delay(milliseconds) {
    return new Promise(fulfill => setTimeout(fulfill, milliseconds));
}

function write_lcd_update(handle, job, attempt = 0) {
    return lcd.refresh(handle, job.rect.x, job.rect.y, job.rect.width, job.rect.height, job.image)
        .then(() => attempt + 1, error => {
            if (attempt >= UPDATE_RETRIES) throw error;
            return delay(UPDATE_RETRY_DELAY).then(() => write_lcd_update(handle, job, attempt + 1));
        });
}

function start_lcd_update(handle, state, job, fulfill, reject, stats) {

    const transfer = stats || { startedAt: get_hr_time(), reports: 0, pixels: 0 };

    if (job && 'update' === job.type) {
        return write_lcd_update(handle, job).then(attempts => {
            transfer.reports += attempts;
            transfer.pixels += attempts * job.rect.width * job.rect.height;

            if (state.queue[0]?.type === 'update') {
                const next = state.queue.shift();
                return delay(UPDATE_REPORT_PAUSE).then(() => start_lcd_update(
                    handle,
                    state,
                    next,
                    fulfill,
                    reject,
                    transfer
                ));
            }

            return fulfill({
                type: 'update',
                complete: true,
                durationMs: get_hr_time() - transfer.startedAt,
                reports: transfer.reports,
                pixels: transfer.pixels
            });
        }, reject);
    }

    return fulfill({
        type: 'update',
        complete: true,
        durationMs: get_hr_time() - transfer.startedAt,
        reports: transfer.reports,
        pixels: transfer.pixels
    });
}

function start_lcd_heartbeat(handle, state, job, fulfill, reject) {

    lcd.heartbeat(handle).then(
        () => fulfill({ type: 'heartbeat', complete: false }),
        reject
    );
}

function start_lcd_orientation(handle, state, job, fulfill, reject) {
    
    lcd.set_orientation(handle, job.portrait).then(
        () => fulfill({ type: 'orientation', complete: false }),
        reject
    );
}

function with_delay(handle, state, job, call) {

    return new Promise((fulfill, reject) => {

        if ('redraw' === state.last_type) {

            return setTimeout(() => {
            
                call(handle, state, job, fulfill, reject);
            
            }, state.refresh);
        }
        
        call(handle, state, job, fulfill, reject);
    });
}

function scheduleReconnect(state) {
    if (state.reconnect_timer || state.connecting || state.connected) return;
    state.reconnect_timer = setTimeout(() => {
        state.reconnect_timer = null;
        connectDevice(state);
    }, state.reconnect_delay);
}

function reportDeviceError(state, error) {
    const now = get_hr_time();
    if (!state.last_error_logged || now - state.last_error_logged >= ERROR_LOG_INTERVAL) {
        logger.error('lcd_thread: USB-Verbindung unterbrochen: ' + (error?.message || error || 'unbekannter Fehler'));
        state.last_error_logged = now;
    }
}

function disconnectDevice(handle, state, error) {
    if (state.handle !== handle) return;
    state.connected = false;
    state.handle = null;
    state.queue = state.queue.filter(job => job.type === 'orientation');
    reportDeviceError(state, error);
    threads.parentPort.postMessage({ type: 'device', connected: false });

    try {
        Promise.resolve(handle.close()).catch(() => undefined);
    }
    catch (closeError) {
        if (DEBUG_TRACE) logger.error('lcd_thread: Schliessen fehlgeschlagen: ' + closeError);
    }
    scheduleReconnect(state);
}

function connectDevice(state) {
    if (state.connecting || state.connected) return;
    state.connecting = true;

    usb_hid.open(state.device).then(handle => {
        state.connecting = false;
        state.connected = true;
        state.handle = handle;
        state.last_error_logged = 0;
        state.last_activity = get_hr_time();
        state.last_heartbeat = get_hr_time();
        logger.info('lcd_thread: USB-Display verbunden');
        threads.parentPort.postMessage({ type: 'device', connected: true });
        setTimeout(() => refresh_device(handle, state), START_COOL_DOWN);
    }, error => {
        state.connecting = false;
        reportDeviceError(state, error || ('failed to open ' + state.device));
        threads.parentPort.postMessage({ type: 'device', connected: false });
        scheduleReconnect(state);
    });
}

function refresh_device(handle, state) {    
    
    const _now = get_hr_time();
    var _promise = Promise.resolve({ type: 'idle' });
    var _attempted_type = 'idle';

    if (state.queue.length) {
        
        const _last_heartbeat = _now - state.last_heartbeat;

        if (_last_heartbeat > state.heartbeat) {

            _attempted_type = 'heartbeat';
            _promise = with_delay(handle, state, { type: 'heartbeat' }, start_lcd_heartbeat);
        }  
        else
        {
            const _job = state.queue.shift();
            _attempted_type = _job.type;

            switch (_job.type) {
            
                case 'redraw':
                    _promise = start_lcd_redraw(handle, state, _job);
                    break;

                case 'update':   
                    _promise = with_delay(handle, state, _job, start_lcd_update);
                    break;
                
                case 'orientation':
                    _promise = with_delay(handle, state, _job, start_lcd_orientation);
                    break;

                case 'heartbeat':
                    _promise = with_delay(handle, state, _job, start_lcd_heartbeat);
                    break;
            }  
        }      
    }
    else {

        const _last_activity = _now - state.last_activity;
        
        if (_last_activity > state.refresh) {

            _attempted_type = 'heartbeat';
            _promise = with_delay(handle, state, { type: 'heartbeat' }, start_lcd_heartbeat);
        }
    }

    _promise.then(rc => {
        state.consecutive_errors = 0;
        
        if ('idle' !== rc.type) {
            
            const _took = get_hr_time() - _now;

            if ('heartbeat' === rc.type) {

                state.last_heartbeat = get_hr_time(); 
            }
            else {

                // upcall we're ready to receive next command...
                threads.parentPort.postMessage({
                    type: rc.type,
                    complete: rc.complete,
                    durationMs: rc.durationMs,
                    reports: rc.reports,
                    pixels: rc.pixels
                });
            }

            state.last_type = rc.type;
            state.last_activity = get_hr_time();
            threads.parentPort.postMessage({ type: 'activity', operation: rc.type });
        }

    }, err => {
        state.consecutive_errors++;
        threads.parentPort.postMessage({ type: 'operation_error', operation: _attempted_type });
        if (state.consecutive_errors >= state.error_threshold) {
            disconnectDevice(handle, state, err);
        }
        else if (DEBUG_TRACE) {
            logger.error('lcd_thread: einzelner HID-Fehler: ' + err);
        }

    }).finally(() => {
        if (state.connected && state.handle === handle) {
            setTimeout(() => refresh_device(handle, state), POLL_TIMEOUT);
        }
    });
}

function message_handler(state, message) {

    switch (message.type) {
    
        case 'orientation':
        case 'heartbeat':
            state.queue.push(message);
            break;
            
        case 'redraw':
            // Ein Vollbild ist der neue verbindliche Zustand. Aeltere Teilbilder
            // duerfen danach nicht mehr auf das Display geschrieben werden.
            state.queue = state.queue.filter(job => job.type !== 'redraw' && job.type !== 'update');
            state.queue.push({ type: 'redraw', image: { data: message.pixelData } });
            break;

        case 'update':                
            state.queue.push({ type: 'update', rect: message.rect, image: { data: message.pixelData }});
            break;

        case 'config':
            state.poll = message.poll || state.poll;
            state.refresh = message.refresh || state.refresh;
            state.heartbeat = message.heartbeat || state.heartbeat;
            break;

        default:
            logger.error('lcd_thread: unknown command type: ' + message.type);
            break;
    }
} 

function main(state) {

    logger.info('lcd_thread: started...');

    threads.parentPort.on('message', message => {
        message_handler(state, message);
    });

    node_hid.devices().find(each => {

        if (1241 === each.vendorId && 64769 === each.productId) {
            logger.info(JSON.stringify(each, null, 3));
        }
    });

    connectDevice(state);
}

main({
    device             : threads.workerData.device,
    poll               : threads.workerData.poll,
    refresh            : threads.workerData.refresh,
    heartbeat          : threads.workerData.heartbeat,
    last_heartbeat     : get_hr_time(),
    last_activity      : get_hr_time(),
    queue              : [],
    last_type          : 'idle',
    handle             : null,
    connected          : false,
    connecting         : false,
    reconnect_timer    : null,
    reconnect_delay    : Number(threads.workerData.reconnectDelay) || RECONNECT_DELAY,
    consecutive_errors : 0,
    error_threshold    : 3,
    last_error_logged  : 0
});
