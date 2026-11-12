import { describe, expect, it } from 'vitest';
import { Effect, parseParticle, type ParticleDoc } from '@particlr/runtime';
import cascadeText from '../public/effects/cascade.prt?raw';
import birdsText from '../public/effects/birds.prt?raw';
import swirlText from '../public/effects/swirl.prt?raw';
import { SHEET_GRID } from './skullArt';
import {
  birdsDoc,
  cascadeDoc,
  FILE_COUNT,
  SKULL_TEXTURE,
  swirlDoc,
  withCount,
  type FlipbookSheet,
  type Setup,
} from './skullLayer';
import { portal } from './testFixtures';

// The app loads public/effects/*.prt, which export.html generates from src/skullLayer.ts. These tests catch the two
// drifting apart: if one fails after a change to skullLayer.ts or the skull art, re-run export.html under `npm run dev`.

const FILES: Record<Setup, string> = { cascade: cascadeText, birds: birdsText, swirl: swirlText };
const GENERATORS = { cascade: cascadeDoc, birds: birdsDoc, swirl: swirlDoc };

function parsed(setup: Setup): ParticleDoc {
  const doc = parseParticle(FILES[setup]).doc;
  if (!doc) throw new Error(`${setup}.prt failed to parse`);
  return doc;
}

// The sheet as embedded in a file: baking needs a GPU, so the tests take the baked image from the file itself.
function embeddedSheet(doc: ParticleDoc): FlipbookSheet {
  const frames = doc.layers[0].texture.frames;
  const dataUrl = doc.textures?.[SKULL_TEXTURE];
  if (!frames || !dataUrl) throw new Error(`"${doc.meta.name}" has no embedded skull sheet`);
  return { dataUrl, cols: frames.cols, rows: frames.rows, fps: frames.fps };
}

describe.each(['cascade', 'birds', 'swirl'] as const)('effects/%s.prt', (setup) => {
  it('matches what its generator makes from portal.prt today', () => {
    const file = parsed(setup);
    expect(file).toEqual(GENERATORS[setup](portal(), 'pull', embeddedSheet(file), FILE_COUNT));
  });

  it('embeds a PNG sheet laid out as the app bakes it', () => {
    const file = parsed(setup);
    const sheet = embeddedSheet(file);
    expect(sheet.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect([sheet.cols, sheet.rows]).toEqual([SHEET_GRID.cols, SHEET_GRID.rows]);
  });

  it('builds and runs at every count the menu offers', () => {
    for (const count of [10, 100, 1000, 10000]) {
      const fx = new Effect(withCount(parsed(setup), setup, count));
      fx.step(1 / 30);
      expect(fx.layers[0].pool.capacity).toBe(count);
    }
  });
});

describe('withCount', () => {
  it('changes only the cap and birth rate, leaving the loaded document untouched', () => {
    const file = parsed('cascade');
    const before = structuredClone(file);
    const doc = withCount(file, 'cascade', 1000);
    expect(file).toEqual(before);
    expect(doc.layers[0].emission.maxParticles).toBe(1000);
    expect({ ...doc.layers[0], emission: null }).toEqual({ ...file.layers[0], emission: null });
  });

  it('refuses a multi-layer effect, which the setups never are', () => {
    expect(() => withCount(portal(), 'cascade', 100)).toThrow('should have one layer');
  });
});
