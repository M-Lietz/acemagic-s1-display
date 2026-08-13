'use strict';
/*!
 * AceMagic S1 Display - Web security headers
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const headers = Object.freeze({
    'Content-Security-Policy': "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
});

function middleware(request, response, next) {
    for (const [name, value] of Object.entries(headers)) {
        response.setHeader(name, value);
    }
    next();
}

module.exports = { headers, middleware };
