'use strict';
/*!
 * AceMagic S1 Display - validated design catalog
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

const fs = require('fs');
const path = require('path');

function validateCatalog(catalog) {
    if (!catalog || !Array.isArray(catalog.designs)) {
        throw new Error('Ungültiger Designkatalog');
    }

    const ids = new Set();

    catalog.designs.forEach(design => {
        if (!design.id || !design.name || !design.preview || ids.has(design.id)) {
            throw new Error('Ungültiger oder doppelter Designeintrag');
        }

        ids.add(design.id);
    });

    return catalog;
}

async function loadCatalog(filename) {
    const data = await fs.promises.readFile(filename, 'utf8');
    return validateCatalog(JSON.parse(data));
}

function listDesigns(catalog, activeTheme) {
    return catalog.designs.map(design => ({
        ...design,
        active: Boolean(design.theme && design.theme === activeTheme),
        available: design.status === 'implemented' && Boolean(design.theme),
        preview_url: '/design-previews/' + design.preview.split(path.sep).map(encodeURIComponent).join('/')
    }));
}

function findActivatableDesign(catalog, id) {
    const design = catalog.designs.find(each => each.id === id);

    if (!design || design.status !== 'implemented' || !design.theme) {
        return null;
    }

    return design;
}

function resolveInside(root, relativePath) {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(root, relativePath);
    const relation = path.relative(resolvedRoot, resolved);

    if (!relation || (!relation.startsWith('..' + path.sep) && relation !== '..' && !path.isAbsolute(relation))) {
        return resolved;
    }

    throw new Error('Designpfad liegt außerhalb des S1Panel-Verzeichnisses');
}

async function writeAtomic(filename, data, mode) {
    const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
    let handle;

    try {
        handle = await fs.promises.open(temporary, 'wx', mode);
        await handle.writeFile(data);
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.promises.rename(temporary, filename);
    } catch (error) {
        if (handle) {
            await handle.close().catch(() => {});
        }

        await fs.promises.unlink(temporary).catch(() => {});
        throw error;
    }
}

async function selectDesign({ catalog, id, configFile, appDir, homeDir }) {
    const design = findActivatableDesign(catalog, id);

    if (!design) {
        return {
            status: 'unavailable',
            message: 'Dieses Design ist noch nicht als geprüfter Renderer verfügbar.'
        };
    }

    const themeFile = resolveInside(appDir || homeDir, design.theme);
    const themeBuffer = await fs.promises.readFile(themeFile, 'utf8');
    JSON.parse(themeBuffer);

    const configBuffer = await fs.promises.readFile(configFile);
    const config = JSON.parse(configBuffer.toString('utf8'));

    if (config.theme === design.theme) {
        return { status: 'active', changed: false, design };
    }

    const stat = await fs.promises.stat(configFile);
    const mode = stat.mode & 0o777;
    const backupFile = configFile + '.previous';
    const nextConfig = { ...config, theme: design.theme };

    await writeAtomic(backupFile, configBuffer, mode);
    await writeAtomic(configFile, JSON.stringify(nextConfig, null, 3) + '\n', mode);

    return {
        status: 'activating',
        changed: true,
        design,
        previous_theme: config.theme,
        backup_file: backupFile
    };
}

module.exports = {
    findActivatableDesign,
    listDesigns,
    loadCatalog,
    resolveInside,
    selectDesign,
    validateCatalog
};
