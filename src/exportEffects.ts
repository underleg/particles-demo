import { Application } from 'pixi.js';
import { serializeParticle, type ParticleDoc } from '@particlr/runtime';
import { loadParticleDoc } from './loadParticleDoc';
import { bakeSpineSheet } from './bakeSpineSheet';
import { createSpine, loadSpineAssets } from './spineAnimation';
import { SHEET_GRID, SKULL, SPINE_URLS } from './skullArt';
import { birdsDoc, cascadeDoc, FILE_COUNT, swirlDoc, type FlipbookSheet, type Setup } from './skullLayer';

// export.html's script: bakes the skull flipbook sheet from the Spine art, builds the three setups from portal.prt
// with the sheet embedded, and saves them through the dev server as public/effects/<setup>.prt. The app then only
// loads those files. Re-run after changing src/skullLayer.ts or the skull art; effects.test.ts flags stale files.

const SOURCE_URL = '/portal.prt';
const SOURCE_LAYER = 'pull';

const generators: Record<Setup, (doc: ParticleDoc, layerId: string, sheet: FlipbookSheet, count: number) => ParticleDoc> =
  {
    cascade: cascadeDoc,
    birds: birdsDoc,
    swirl: swirlDoc,
  };

async function save(setup: Setup, text: string): Promise<void> {
  const response = await fetch(`/__save-effect?name=${setup}`, { method: 'POST', body: text });
  if (!response.ok) throw new Error(`Saving ${setup}.prt failed: HTTP ${response.status} ${await response.text()}`);
}

async function main(log: HTMLElement): Promise<void> {
  const lines: string[] = ['Exporting…'];
  const say = (line: string) => {
    lines.push(line);
    log.textContent = lines.join('\n');
  };

  // A renderer is needed to bake the sheet; nothing is shown, so the canvas is never added to the page.
  const app = new Application();
  await app.init({ width: 1, height: 1, preference: 'webgl' });
  await loadSpineAssets(SPINE_URLS);
  const bakeSource = createSpine(SPINE_URLS, SKULL);
  const sheet = await bakeSpineSheet(app.renderer, bakeSource, SHEET_GRID);
  bakeSource.destroy();
  app.destroy();
  say(`Baked ${SKULL.skin}/${SKULL.animation}: ${sheet.cols}x${sheet.rows} frames at ${sheet.fps.toFixed(2)} fps`);

  const source = await loadParticleDoc(SOURCE_URL);
  for (const [setup, generate] of Object.entries(generators) as [Setup, (typeof generators)[Setup]][]) {
    const text = serializeParticle(generate(source, SOURCE_LAYER, sheet, FILE_COUNT));
    await save(setup, text);
    say(`Saved public/effects/${setup}.prt (${(text.length / 1024).toFixed(0)} KB)`);
  }
  say('Done.');
}

const log = document.getElementById('log');
const button = document.getElementById('export');
if (!log || !(button instanceof HTMLButtonElement)) throw new Error('Missing #log or #export in export.html');
button.addEventListener('click', () => {
  button.disabled = true;
  log.textContent = 'Exporting…';
  main(log)
    .catch((error: unknown) => {
      console.error(error);
      log.textContent += `\nFAILED: ${error instanceof Error ? error.message : String(error)}`;
    })
    .finally(() => (button.disabled = false));
});
