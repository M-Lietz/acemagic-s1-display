/*!
 * AceMagic S1 Display - Gallery development and build configuration
 * Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const designRoot = fileURLToPath(new URL('../designs', import.meta.url));

function developmentDesignApi() {
  return {
    name: 'development-design-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method === 'GET' && request.url === '/api/designs') {
          const catalog = JSON.parse(fs.readFileSync(path.join(designRoot, 'catalog.json'), 'utf8'));
          const designs = catalog.designs.map((design) => ({
            ...design,
            active: design.id === 'instrument',
            available: design.status === 'implemented' && Boolean(design.theme),
            preview_url: `/design-previews/${design.preview.split(path.sep).map(encodeURIComponent).join('/')}`,
          }));

          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ designs }));
          return;
        }

        if (request.method === 'GET' && request.url === '/healthz') {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ status: 'ok', healthy: true, lcdConnected: true, lcdLastActivityMs: 240 }));
          return;
        }

        if (request.method === 'GET' && request.url?.startsWith('/design-previews/')) {
          const requested = decodeURIComponent(request.url.slice('/design-previews/'.length).split('?')[0]);
          const preview = path.resolve(designRoot, requested);
          const relative = path.relative(designRoot, preview);

          if (relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && fs.existsSync(preview)) {
            response.setHeader('Content-Type', 'image/png');
            fs.createReadStream(preview).pipe(response);
            return;
          }
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), developmentDesignApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
