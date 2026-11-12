import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const EFFECTS_DIR = fileURLToPath(new URL('./public/effects/', import.meta.url));

// Dev server only: lets export.html save the .prt files it generates into public/effects/, since baking the flipbook
// sheet needs a real renderer and so has to run in a browser. Only a lowercase name is accepted and only
// <name>.prt in that one folder is written, so nothing else on disk is reachable through it.
function saveEffects(): Plugin {
  return {
    name: 'save-effects',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-effect', (req, res) => {
        const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !/^[a-z]+$/.test(name)) {
          res.statusCode = 400;
          res.end('POST with ?name=<lowercase letters> only');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          mkdirSync(EFFECTS_DIR, { recursive: true });
          writeFileSync(`${EFFECTS_DIR}${name}.prt`, Buffer.concat(chunks));
          res.end('saved');
        });
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/, so the Pages workflow sets VITE_BASE; everything else runs at /.
  base: process.env.VITE_BASE ?? '/',
  plugins: [saveEffects()],
  build: {
    // Small assets are inlined as data: URLs, but Spine's atlas loader picks atlases by their ".atlas" extension,
    // so an inlined atlas would never load. Returning undefined keeps Vite's default size rule for everything else.
    assetsInlineLimit: (filePath) => (filePath.endsWith('.atlas') ? false : undefined),
  },
});
