import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Shared Recess site assets (logo, site scripts) live in ../assets and are served at /assets/ in
// production. In dev the page sits at the server root, so map "/assets/*" to that folder.
const SITE_ASSETS = join(import.meta.dirname, '..', 'assets');
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css' };
function siteAssets(): Plugin {
  return {
    name: 'recess-site-assets',
    configureServer(server) {
      server.middlewares.use('/assets', async (req, res, next) => {
        const file = normalize(join(SITE_ASSETS, (req.url ?? '').split('?')[0]));
        if (!file.startsWith(SITE_ASSETS)) return next();
        try {
          const body = await readFile(file);
          res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
          res.end(body);
        } catch {
          next();
        }
      });
    },
  };
}

// Relative asset paths: the build runs inside the Recess site at /games/cipher/.
export default defineConfig({
  base: './',
  plugins: [react(), siteAssets()],
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
});
