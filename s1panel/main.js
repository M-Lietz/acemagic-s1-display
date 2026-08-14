#!/usr/bin/env node
'use strict';
/*!
 * s1panel - main
 * Copyright (c) 2024-2025 Tomasz Jaworski
 * Modifications Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */
const threads     = require('worker_threads');
const fs          = require('fs');
const path        = require('path');
const http        = require('http');
const { execFile } = require('child_process');

const express     = require('express');
const node_canvas = require('canvas');

const logger      = require('./logger');
const api         = require('./api');
const webSecurity = require('./lib/web_security');
const updateRegions = require('./lib/update_regions');

const app_dir = __dirname;
const config_dir = process.env.S1PANEL_CONFIG || app_dir;

function get_hr_time() {

    return Math.floor(Number(process.hrtime.bigint()) / 1000000);
}

function lcd_redraw(state, imageData) {

    state.drawing = true;

    const pixelData = new Uint16Array(imageData.data);

    state.lcd_thread.postMessage({ type: 'redraw', pixelData}, [pixelData.buffer]);
}

function lcd_update(state, rect, imageData) {

    state.drawing = true;

    const pixelData = new Uint16Array(imageData.data);

    state.lcd_thread.postMessage({ type: 'update', rect, pixelData }, [pixelData.buffer]);
}

function lcd_orientation(state, portrait) {

    state.lcd_thread.postMessage({ type: 'orientation', portrait });
}

function lcd_set_time(state) {

    state.lcd_thread.postMessage({ type: 'heartbeat' });
}

function lcd_set_config(state, config) {

    state.lcd_thread.postMessage({ type: 'config', poll: config.poll, refresh: config.refresh, heartbeat: config.heartbeat });
}

function load_config(filename) {

    return new Promise((fulfill, reject) => {

        fs.readFile(filename, 'utf8', (err, jsonData) => {

            if (err) {
                logger.error('load_config: ' + err);
                return reject();
            }

            try {
                fulfill(JSON.parse(jsonData));
            }
            catch (ex) {
                logger.error('load_config: failed to parse json from ' + filename);
                reject();
            }
        });
    });
}

function translate_rect(portrait, rect, height) {

    return portrait ? { x: rect.y, y: (height - (rect.x + rect.width)), width: rect.height, height: rect.width } : rect;
}

function next_update_region(context, state, config, fulfill) {

    if (!state.changes.length) {

        return fulfill();
    }

    const _change = state.changes.shift();
    const _rect = translate_rect(config.portrait, _change, config.canvas.height);
    const _image = context.getImageData(_rect.x, _rect.y, _rect.width, _rect.height);

    if (config.debug_update) {

        _image.data.fill(Math.floor(Math.random() * 65025) + 1);
    }

    state.change_count--;

    lcd_update(state, _rect, _image);

    next_update_region(context, state, config, fulfill);
}

function start_update_screen(context, state, config, fulfill) {

    const _start = get_hr_time();
    const _count = state.change_count;

    next_update_region(context, state, config, () => {

        state.stat_update = get_hr_time() - _start;
        state.stat_count = _count;

        fulfill(_count ? true : false);
    });
}

function start_diff_screen(context, previousContext, state, config, fulfill) {

    const width = config.canvas.width;
    const height = config.canvas.height;
    const current = context.getImageData(0, 0, width, height);
    const previous = previousContext.getImageData(0, 0, width, height);
    const plan = updateRegions.planUpdates(previous, current, width, height);

    clear_pending_screen_updates(state);

    if (!plan.chunks.length) return fulfill(false);

    if (plan.type === 'redraw') {
        lcd_redraw(state, current);
        return fulfill(true);
    }

    plan.chunks.forEach(rect => {
        lcd_update(state, rect, context.getImageData(rect.x, rect.y, rect.width, rect.height));
    });
    state.stat_count = plan.chunks.length;
    return fulfill(true);
}

function clear_pending_screen_updates(state) {

    while (state.changes.length) {

        state.changes.shift();
        state.change_count--;
    }
}

function update_device_screen(context, state, config, theme) {

    return new Promise(fulfill => {

        if (state.update_orientation) {

            config.portrait = theme.orientation === 'portrait';

            state.update_orientation = false;

            lcd_orientation(state, config.portrait);

            return fulfill();
        }
        else if (!state.drawing) {

            if (state.pending_redraw(state) || ('redraw' === theme.refresh && state.changes.length)) {

                clear_pending_screen_updates(state);

                lcd_redraw(state, context.getImageData(0, 0, config.canvas.width, config.canvas.height));

                return fulfill(true);
            }
            else if (state.changes.length) {

                // lcd update methods:
                //
                // redraw   : always redraw the whole screen (slowest)
                // update   : update by the widget rect (fastest)
                //
                // row      : update whole screen by drawing strips down x (landscape going down)
                // column   : update whole screen by drawing strips down y (portrait going down)
                // gridx    : update screen by a grid of 32x10 (only changed parts)
                // gridy    : update screen by a grid of 10x32 (only changed parts)
                //
                switch (theme.refresh) {

                    case 'update':
                        return start_update_screen(context, state, config, fulfill);

                    case 'diff':
                        return start_diff_screen(
                            context,
                            state.canvas_context[state.active_context ^ 1],
                            state,
                            config,
                            fulfill
                        );

                    case 'row':
                    case 'column':
                    case 'gridx':
                    case 'gridy':
                        break;
                }
            }
        }
        fulfill();
    });
}

function validate_theme(theme) {

    if (!theme || !Array.isArray(theme.screens) || !theme.screens.length) {
        throw new Error('Theme enthält keinen Bildschirm');
    }

    theme.screens.forEach(screen => {
        if (!Array.isArray(screen.widgets) || !screen.widgets.length) {
            throw new Error('Theme enthält einen leeren Bildschirm');
        }
    });

    return theme;
}

function apply_pending_theme(state, config, theme) {

    const _activation = state.theme_activation;

    if (!_activation || _activation.applied || state.drawing) {
        return;
    }

    const _next_theme = _activation.theme;
    const _old_portrait = config.portrait;

    Object.keys(theme).forEach(key => delete theme[key]);
    Object.assign(theme, _next_theme);
    theme.screens.sort((a, b) => a.id - b.id);
    theme.screens.forEach(screen => screen.widgets.sort((a, b) => a.id - b.id));

    config.portrait = theme.orientation === 'portrait';
    state.screen_index = find_first_enabled_index(theme.screens);
    state.gui_screen_index = state.screen_index;
    state.change_screen = state.screen_index;
    state.screen_start = get_hr_time();
    state.wallpaper_image = null;
    state.changes = [];
    state.change_count = 0;
    state.update_orientation = _old_portrait !== config.portrait;
    state.force_redraw(state);
    _activation.applied = true;

    logger.info('design gallery api: renderer prepared for ' + _activation.id);
}

function activate_theme(state, config, theme, filename, id) {

    if (state.theme_activation) {
        return Promise.reject(new Error('Ein Designwechsel läuft bereits'));
    }

    return load_config(filename).then(validate_theme).then(nextTheme => new Promise((fulfill, reject) => {
        const timeout = setTimeout(() => {
            if (state.theme_activation && state.theme_activation.id === id) {
                state.theme_activation = null;
            }
            reject(new Error('Das Display hat das neue Design nicht rechtzeitig bestätigt'));
        }, 15000);

        state.theme_activation = {
            id,
            theme: nextTheme,
            applied: false,
            fulfill,
            reject,
            timeout
        };
    }));
}

function is_screen_enabled(screen) {

    return screen && screen.enabled !== false;
}

function find_next_enabled_index(screens, start_index) {

    const _count = screens.length;

    if (!_count) {
        return start_index;
    }

    for (var i = 1; i <= _count; i++) {

        const _index = (start_index + i) % _count;

        if (is_screen_enabled(screens[_index])) {
            return _index;
        }
    }

    return start_index;
}

function find_first_enabled_index(screens) {

    for (var i = 0; i < screens.length; i++) {

        if (is_screen_enabled(screens[i])) {
            return i;
        }
    }

    return 0;
}

// keep screen at least for 10 seconds
// prevents from fast screen switching...
function has_screen_expired(elapsed, duration) {

    const _min_time_ms = 10 * 1000;

    if (duration > _min_time_ms) {
        return elapsed > duration ? true : false;
    }

    return elapsed > _min_time_ms ? true : false;
}

function get_gui_screen(state, theme) {

    const _index = state.gui_screen_index;

    if (_index >= 0 && _index < theme.screens.length) {
        return theme.screens[_index];
    }

    return theme.screens[0];
}

function reset_wallpaper(state) {

    state.wallpaper_image = null;
}

function fetch_screen(state, config, theme) {

    const _count = theme.screens.length;
    const _old_index = state.screen_index;

    var _screen = theme.screens[state.screen_index];

    if (_screen && !is_screen_enabled(_screen)) {

        state.screen_index = find_first_enabled_index(theme.screens);
        _screen = theme.screens[state.screen_index];
    }

    if (_count > 1) {

        const _now = get_hr_time();
        const _diff = _now - state.screen_start;

        if (_screen.duration && has_screen_expired(_diff, _screen.duration)) {

            if (!state.screen_paused) {

                state.screen_index = find_next_enabled_index(theme.screens, state.screen_index);
            }
            else {

                state.screen_start = get_hr_time();
            }
        }

        // did we change?
        if (_old_index !== state.screen_index) {

            _screen = theme.screens[state.screen_index];

            // does new screen have a wallpaper?
            if (_screen.wallpaper) {

                state.wallpaper_image = null;
            }

            if (_screen.led_config) {

                config.led_config.theme = _screen.led_config.theme || 4;
                config.led_config.intensity = _screen.led_config.intensity || 3;
                config.led_config.speed = _screen.led_config.speed || 3;
                state.update_led = true;
            }

            state.change_screen = state.screen_index;
            state.screen_start = get_hr_time();
            state.force_redraw(state);
        }
    }
    else {
        state.screen_start = get_hr_time();
    }
    return _screen;
}

function calc_update_region(rect) {

    const _max_size = 2048;   // 4096 buffer limit
    const _totalPixels = rect.width * rect.height;
    const _chunks = [];

    if (_totalPixels > _max_size) {

        const _rows = Math.ceil(rect.height / Math.sqrt(_max_size));
        const _cols = Math.ceil(rect.width / Math.sqrt(_max_size));
        const _area_width = Math.ceil(rect.width / _cols);
        const _area_height = Math.ceil(rect.height / _rows);

        for (let i = 0; i < _rows; i++) {

            for (let j = 0; j < _cols; j++) {

                const _areaX = rect.x + j * _area_width;
                const _areaY = rect.y + i * _area_height;

                _chunks.push({
                    x: _areaX,
                    y: _areaY,
                    width: Math.min(_area_width, rect.width - j * _area_width),
                    height: Math.min(_area_height, rect.height - i * _area_height)
                });
            }
        }
    }
    else {
        _chunks.push(rect);
    }

    return _chunks;
}

function fix_rect_bounds(config, rect) {

    var _width = rect.width;
    var _height = rect.height;

    const _total_width = rect.x + _width;
    const _total_height = rect.y + _height;

    const _max_width = config.portrait ? config.canvas.height : config.canvas.width;
    const _max_height = config.portrait ? config.canvas.width : config.canvas.height;

    if (_total_width > _max_width) {

        _width -= _total_width - _max_width;
    }

    if (_total_height > _max_height) {

        _height -= _total_height - _max_height;
    }

    return { x: rect.x, y: rect.y, width: _width, height: _height };
}

function next_draw_widgets(context, state, config, widgets, index, total, for_lcd, fulfill) {

    if (index < total) {

        const _widget_config = widgets[index];

        var _sensor_reading = Promise.resolve();

        if (_widget_config.refresh && _widget_config.sensor) {

            const _sensor = state.sensors[_widget_config.value];

            if (_sensor) {

                _sensor_reading = _sensor.sample(_widget_config.refresh, _widget_config.format);
            }
        }

       return _sensor_reading.then(sensor => {

            const _widget = state.widgets[_widget_config.name];
            const _value = sensor ? sensor.value : _widget_config.value;
            const _min = sensor ? sensor.min : 0;
            const _max = sensor ? sensor.max : 0;

            var _draw_promise = Promise.resolve(false);

            if (_widget) {

                _draw_promise = _widget.draw(context, _value, _min, _max, _widget_config);
            }

            _draw_promise.then(changed => {

                if (for_lcd && !state.drawing && changed) {

                    calc_update_region(fix_rect_bounds(config, _widget_config.rect)).forEach(each => {

                        state.changes.push(each);
                        state.change_count++;
                    });
                }

                next_draw_widgets(context, state, config, widgets, 1 + index, total, for_lcd, fulfill);
            });
        });
    }

    fulfill(); // we are done
}

function load_wallpaper(context, state, config, screen) {

    return new Promise(fulfill => {

        if (screen.background) {

            context.fillStyle = screen.background;
            context.rect(0, 0, config.canvas.width, config.canvas.height);
            context.fill();
        }

        if (screen.wallpaper) {

            if (state.wallpaper_image) {

                return fulfill(state.wallpaper_image);
            }

            return node_canvas.loadImage(screen.wallpaper).then(image => {

                state.wallpaper_image = image;

                return fulfill(state.wallpaper_image);
            });
        }

        fulfill();
    });
}

function draw_screen(context, state, config, screen, for_lcd) {

    return new Promise(fulfill => {

        context.resetTransform();
        context.rotate(0);
        context.clearRect(0, 0, config.canvas.width, config.canvas.height);

        load_wallpaper(context, state, config, screen).then(image => {

            if (image) {

                context.drawImage(image, 0, 0, config.canvas.width, config.canvas.height);
            }

            if (config.portrait) {

                context.translate(0, 170);
                context.rotate(-Math.PI / 2);
            }

            next_draw_widgets(context, state, config, screen.widgets, 0, screen.widgets.length, for_lcd, () => {

                fulfill();
            });
        });
    });
}

function update_led_strip(state, config) {

    return new Promise(fulfill => {

        if (!state.update_led) {
            return fulfill();
        }

        // led strip manipulation is done on a seperate thread...
        state.led_thread.postMessage(config.led_config);
        state.update_led = false;

        fulfill();
    });
}

function next_sensor(state, widgets, index, fulfill) {

    if (index < widgets.length) {

        const _widget_config = widgets[index];

        var _sensor_reading = Promise.resolve();

        if (_widget_config.refresh && _widget_config.sensor) {

            const _sensor = state.sensors[_widget_config.value];

            if (_sensor) {

                _sensor_reading = _sensor.sample(_widget_config.refresh, '');
            }
        }

        return _sensor_reading.then(() => {

            next_sensor(state, widgets, 1 + index, fulfill);
        });
    }

    fulfill(); // we are done
}

/*
 * we need to poll each widget/sensor in all the inactive screens or we
 * going to have missed data points. ie: if cpu_usage is only on screen 1
 * and temp is only on screen 2, if we stay on screen 1 too long screen 2
 * temp sensor will have missed data points. we skip the active screen,
 * since its going to be taken care of by the draw_screen.
 */
function poll_inactive_screen_sensors(state, screens, index, active, fulfill) {

    if (index < screens.length) {

        const _screen = screens[index];

        if (_screen.id !== active.id) {

            return next_sensor(state, _screen.widgets, 0, () => {

                poll_inactive_screen_sensors(state, screens, 1 + index, active, fulfill);
            });
        }

        return poll_inactive_screen_sensors(state, screens, 1 + index, active, fulfill);
    }

    fulfill(); // we are done
}


function start_draw_canvas(state, config, theme) {

    apply_pending_theme(state, config, theme);

    const _lcd_screen = fetch_screen(state, config, theme);
    const _preview_screen = get_gui_screen(state, theme);
    const _lcd_context = state.canvas_context[state.active_context];

    poll_inactive_screen_sensors(state, theme.screens, 0, _preview_screen, () => {

        reset_wallpaper(state);
        draw_screen(state.output_context, state, config, _preview_screen, false).then(() => {

            reset_wallpaper(state);
            draw_screen(_lcd_context, state, config, _lcd_screen, true).then(() => {

                update_device_screen(_lcd_context, state, config, theme).then(device_updated => {

                    if (device_updated) {

                        state.active_context ^= 1;  // flip buffer to use
                    }

                    update_led_strip(state, config).then(() => {

                        setTimeout(() => {

                            lcd_set_config(state, config);

                            start_draw_canvas(state, config, theme);

                        }, Math.max(100, Number(theme.frame_interval_ms) || config.poll));
                    });
                });
            });
        });
    });
}

function initialize(state, config, theme) {

    config.widgets.forEach(widget => {

        const _file = './' + widget;    // relative path to install dir ./widget/xyz.js
        const _module = require(_file);

        if (_module) {

            const _name = _module.info().name;

            logger.info('initialize: widget ' + _name + ' loaded...');

            state.widgets[_name] = { name: _name, info: _module.info, draw: _module.draw };
        }
    });

    config.sensors.forEach(sensor => {

        const _file = './' + sensor.module; // relative path to install dir ./sensors/abc.js
        const _module = require(_file);

        if (_module) {

            const _config = sensor.config || {};
            const _name = _module.init(_config);
            const _info = { ..._module.settings(), module: sensor.module };

            logger.info('initialize: sensor ' + _name + ' loaded...');

            state.sensors[_name] = { config: _config, name: _name, info: _info, sample: (rate, format) => {
                return _module.sample(rate, format, _config);
            }, stop: () => {
                return _module.stop(_config);
            }};
        }
    });

    config.portrait = theme.orientation === 'portrait';

    logger.info('initialize: device orientation is ' + theme.orientation);

    // sort screens by id
    theme.screens.sort((a, b) => a.id - b.id);

    state.screen_index = find_first_enabled_index(theme.screens);
    state.gui_screen_index = state.screen_index;
    state.change_screen = state.screen_index;

    lcd_set_time(state);

    return Promise.resolve();
}

function init_web_gui(state, config, theme) {

    return new Promise(fulfill => {

        const _web = express();

        const _listen = config.listen.split(':');
        const _ip = _listen[0];
        const _port = Number(_listen[1]);

        _web.disable('x-powered-by');
        _web.use(webSecurity.middleware);

        _web.get('/healthz', (request, response) => {
            const age = Date.now() - state.lcd_last_activity;
            const healthy = state.lcd_connected && age < Math.max(90000, config.heartbeat * 2);
            response.status(healthy ? 200 : 503).json({
                status: healthy ? 'ok' : 'degraded',
                lcdConnected: state.lcd_connected,
                lcdLastActivityMs: Math.max(0, age)
            });
        });

        _web.use('/design-previews', express.static(path.join(app_dir, 'designs'), {
            immutable: true,
            index: false,
            maxAge: '1d'
        }));
        _web.use(express.static(path.join(__dirname, 'gui/dist')));
        _web.use(express.json({ limit: '8kb', strict: true }));

        api.init(_web, { state, config, theme });

        http.createServer(_web).listen(_port, _ip, () => {

            logger.info('initialize: gui started on ' + _ip + ':' + _port);
            fulfill();
        });
    });
}

function systemdNotify(arguments_) {
    if (!process.env.NOTIFY_SOCKET) return;
    execFile('/usr/bin/systemd-notify', arguments_, { timeout: 3000 }, error => {
        if (error) logger.error('systemd-notify: ' + error.message);
    });
}

function startSystemdWatchdog(state, config) {
    if (!process.env.NOTIFY_SOCKET) return;
    systemdNotify(['--ready', '--status=AceMagic S1 Display gestartet']);
    const interval = setInterval(() => {
        const age = Date.now() - state.lcd_last_activity;
        if (state.lcd_connected && age < Math.max(90000, config.heartbeat * 2)) {
            systemdNotify(['WATCHDOG=1', 'STATUS=Display verbunden, Renderer aktiv']);
        }
    }, 15000);
    interval.unref();
}

function lcd_thread_status(state, theme, message) {

    if (message.type === 'device') {
        state.lcd_connected = message.connected === true;
        state.lcd_last_activity = Date.now();
        state.drawing = false;
        if (state.lcd_connected) {
            state.update_orientation = true;
            state.force_redraw(state);
        }
        return;
    }

    if (message.type === 'activity') {
        state.lcd_last_activity = Date.now();
        return;
    }

    if (message.type === 'operation_error') {
        state.drawing = false;
        if (message.operation === 'redraw' || message.operation === 'update') {
            state.force_redraw(state);
        }
        return;
    }

    if (state.drawing && message.complete) {

        if ('redraw' === message.type) {

            state.done_redraw(state);
        }

        state.drawing = false;

        if ('redraw' === message.type && state.theme_activation && state.theme_activation.applied) {
            const _activation = state.theme_activation;
            state.theme_activation = null;
            clearTimeout(_activation.timeout);
            logger.info('design gallery api: renderer confirmed for ' + _activation.id);
            _activation.fulfill();
        }
    }
}

function register_fonts() {
    logger.info('initialize: using native DejaVu Sans system font');
    return Promise.resolve();
}

function main() {
    // additional commandline args
    const _args = process.argv.slice(2);
    const _config_file = (_args.length > 0) ? _args[0] : path.join(config_dir, 'config.json');

    logger.info('config ' + _config_file);
    
    load_config(_config_file).then(config => {
        
        const _theme_file = path.join(app_dir, config.theme);
        
        logger.info('theme ' + _theme_file);

        load_config(_theme_file).then(theme => {

            register_fonts().then(() => {

                const _output_canvas = node_canvas.createCanvas(config.canvas.width, config.canvas.height);
                const _canvas1 = node_canvas.createCanvas(config.canvas.width, config.canvas.height).getContext('2d', { pixelFormat: config.canvas.pixel });
                const _canvas2 = node_canvas.createCanvas(config.canvas.width, config.canvas.height).getContext('2d', { pixelFormat: config.canvas.pixel });

                const _state = {

                    config_file        : _config_file,

                    widgets            : {},
                    sensors            : {},

                    redraw_want        : 1,
                    redraw_count       : 0,

                    drawing            : false,             // drawing in progress
                    lcd_connected      : false,
                    lcd_last_activity  : Date.now(),
                    theme_activation   : null,
                    changes            : [],                // screen update regions
                    change_count       : 0,                 // screen update count

                    output_canvas      : _output_canvas,
                    output_context     : _output_canvas.getContext('2d', { pixelFormat: config.canvas.pixel }),
                    active_context     : 0,
                    canvas_context     : [ _canvas1, _canvas2 ],

                    change_screen      : 0,                 // index of forced screen change
                    gui_screen_index   : 0,                 // screen selected in web gui
                    screen_paused      : false,             // pause screen change
                    screen_index       : 0,                 // array index into screens, not screen id
                    screen_start       : get_hr_time(),

                    update_orientation : true,
                    update_led         : true,

                    wallpaper_image    : null,

                    led_thread         : new threads.Worker('./led_thread.js', { workerData: config.led_config }),
                    lcd_thread         : new threads.Worker('./lcd_thread.js', { workerData: { device: config.device, poll: config.poll, refresh: config.refresh, heartbeat: config.heartbeat }}),

                    unsaved_changes    : false,

                    // helpers to keep things consistant between here and api
                    pending_redraw     : (state) => state.redraw_count < state.redraw_want,
                    force_redraw       : (state) => state.redraw_want++,
                    done_redraw        : (state) => state.redraw_count < state.redraw_want ? state.redraw_count++ : state.redraw_count
                };

                initialize(_state, config, theme).then(() => {

                    const _screen = theme.screens[_state.screen_index];

                    _screen.widgets.sort((a, b) => a.id - b.id);

                    if (_screen.led_config) {

                        config.led_config.theme = _screen.led_config.theme || 4;    // off by default
                        config.led_config.intensity = _screen.led_config.intensity || 3;
                        config.led_config.speed = _screen.led_config.speed || 3;
                    }

                    _state.lcd_thread.on('message', message => {

                        lcd_thread_status(_state, theme, message);
                    });

                    _state.activate_theme = (themePath, id) => {
                        const filename = path.join(app_dir, themePath);
                        return activate_theme(_state, config, theme, filename, id);
                    };

                    init_web_gui(_state, config, theme).then(() => {

                        startSystemdWatchdog(_state, config);
                        start_draw_canvas(_state, config, theme);
                    });

                }, err => {

                    logger.error('initialization failed');
                });
            });

        }, err => {

            logger.error('failed to load ' + config.theme);
        });

    }, err => {

        logger.error('failed to load config.json');
    });
}

logger.info('starting up ' + __filename);

main();
