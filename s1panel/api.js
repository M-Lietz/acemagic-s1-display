'use strict';
/*!
 * AceMagic S1 Display - Design Gallery API
 * Based on s1panel by Tomasz Jaworski
 * Copyright (c) 2024-2025 Tomasz Jaworski
 * Modifications Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const fs = require('fs');
const path = require('path');

const designCatalog = require('./lib/design_catalog');
const logger = require('./logger');

const appDir = __dirname;
const catalogFile = path.join(__dirname, 'designs', 'catalog.json');
const releaseFile = path.join(__dirname, '..', 'RELEASE');
const packageInfo = require('./package.json');

function releaseInfo() {
    let release = {};
    const repositoryUrl = packageInfo.repository.url.replace('git+', '').replace('.git', '');

    try {
        release = Object.fromEntries(fs.readFileSync(releaseFile, 'utf8')
            .split('\n')
            .filter(line => line.includes('='))
            .map(line => {
                const separator = line.indexOf('=');
                return [line.slice(0, separator), line.slice(separator + 1)];
            }));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    const sourceUrl = release.source || repositoryUrl;

    return {
        name: 'AceMagic S1 Display',
        version: release.version || packageInfo.version,
        revision: release.revision || 'development',
        license: 'GPL-3.0-only',
        source_url: sourceUrl,
        license_url: release.source
            ? sourceUrl.replace('/tree/', '/blob/') + '/LICENSE'
            : repositoryUrl + '/blob/main/LICENSE',
        upstream_name: 'AceMagic-S1-LED-TFT-Linux',
        upstream_author: 'Tomasz Jaworski',
        upstream_url: 'https://github.com/tjaworski/AceMagic-S1-LED-TFT-Linux'
    };
}

function errorResponse(response, error) {
    logger.error('design gallery api: ' + error.message);
    response.status(500).json({
        status: 'error',
        message: 'Die Anfrage konnte nicht verarbeitet werden.'
    });
}

module.exports.init = function(web, context) {

    web.get('/api/about', (request, response) => {
        try {
            response.json(releaseInfo());
        } catch (error) {
            errorResponse(response, error);
        }
    });

    web.get('/api/designs', async (request, response) => {
        try {
            const catalog = await designCatalog.loadCatalog(catalogFile);
            response.json({
                designs: designCatalog.listDesigns(catalog, context.config.theme)
            });
        } catch (error) {
            errorResponse(response, error);
        }
    });

    web.post('/api/designs/activate', async (request, response) => {
        if (!request.body || typeof request.body.id !== 'string') {
            response.status(400).json({
                status: 'invalid',
                message: 'Eine gültige Design-ID ist erforderlich.'
            });
            return;
        }

        let catalog;
        let design;

        try {
            catalog = await designCatalog.loadCatalog(catalogFile);
            design = designCatalog.findActivatableDesign(catalog, request.body.id);

            if (!design) {
                response.status(409).json({
                    status: 'unavailable',
                    message: 'Dieses Design ist noch nicht als geprüfter Renderer verfügbar.'
                });
                return;
            }

            if (context.config.theme === design.theme) {
                response.status(200).json({ status: 'active', changed: false, design });
                return;
            }

            await context.state.activate_theme(design.theme, design.id);

            const result = await designCatalog.selectDesign({
                catalog,
                id: request.body.id,
                configFile: context.state.config_file,
                appDir
            });

            if (result.changed) {
                context.config.theme = result.design.theme;
                result.status = 'active';
                result.message = 'Das Design wurde vollständig übertragen und dauerhaft aktiviert.';
                logger.info('design gallery api: activated ' + result.design.id);
            }

            response.status(200).json(result);
        } catch (error) {
            if (design && design.id !== 'instrument') {
                const fallback = designCatalog.findActivatableDesign(catalog, 'instrument');

                if (fallback) {
                    try {
                        await context.state.activate_theme(fallback.theme, fallback.id);
                        const fallbackResult = await designCatalog.selectDesign({
                            catalog,
                            id: fallback.id,
                            configFile: context.state.config_file,
                            appDir
                        });
                        context.config.theme = fallback.theme;
                        logger.error('design gallery api: activation failed; instrument restored');
                        error.fallback = fallbackResult.status;
                    } catch (fallbackError) {
                        logger.error('design gallery api: instrument fallback failed: ' + fallbackError.message);
                    }
                }
            }

            errorResponse(response, error);
        }
    });
};
