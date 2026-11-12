import { describe, expect, it } from 'vitest';
import { computeRenderState, Effect, makeRenderBuffers, type ParticleDoc } from '@particlr/runtime';
import {
  ATTRACTOR_REACH,
  ATTRACTOR_STRENGTH,
  BIRD_SPEED_MAX,
  BIRD_SPEED_MIN,
  birdsDoc,
  cascadeDoc,
  FADE_OUT_SECONDS,
  FLOOR_Y,
  PEAK_ALPHA,
  setBirdsExit,
  setSwirlAttractors,
  SKULL_TEXTURE,
  swirlDoc,
} from './skullLayer';
import { portal, SHEET } from './testFixtures';

function layer(doc: ParticleDoc, id: string) {
  const found = doc.layers.find((l) => l.id === id);
  if (!found) throw new Error(`no layer ${id}`);
  return found;
}

describe('cascadeDoc', () => {
  it('points the layer at the embedded sheet as a looping flipbook', () => {
    const doc = cascadeDoc(portal(), 'pull', SHEET, 250);
    expect(doc.textures?.[SKULL_TEXTURE]).toBe(SHEET.dataUrl);
    expect(layer(doc, 'pull').texture).toEqual({
      ref: 'user:skull',
      frames: { cols: 5, rows: 4, fps: 30, mode: 'loop', randomStartFrame: true, frameOverLife: null },
    });
  });

  it('makes the particles upright, opaque-blended, untinted skull-sized sprites', () => {
    const pull = layer(cascadeDoc(portal(), 'pull', SHEET, 250), 'pull');
    expect(pull.blend).toBe('normal');
    expect(pull.render).toBeNull();
    expect(pull.initial.rotation).toEqual({ mode: 'range', min: -180, max: 180 });
    expect(pull.initial.angularVelocity).toEqual({ mode: 'constant', value: 0 });
    expect(pull.randomFlip).toEqual({ x: 0.5, y: 0 });
    expect(pull.initial.size).toEqual({ mode: 'range', min: 56, max: 80 });
    expect(pull.initial.life).toEqual({ mode: 'range', min: 2.5, max: 3.5 });
    const keys = pull.overLifetime.color?.keys ?? [];
    expect(keys.every((k) => k.r === 1 && k.g === 1 && k.b === 1)).toBe(true);
  });

  it('holds full opacity until at most the last 250 ms of each skull’s life, then fades out', () => {
    const fx = new Effect(cascadeDoc(portal(), 'pull', SHEET, 250));
    const buffers = makeRenderBuffers(fx.layers[0].pool.capacity);
    let fading = 0;
    let holding = 0;
    for (let step = 0; step < 120; step++) {
      fx.step(1 / 30);
      const sim = fx.layers[0];
      computeRenderState(sim, buffers);
      for (let i = 0; i < sim.count; i++) {
        const age = sim.pool.age[i];
        const remaining = sim.pool.lifetime[i] - age;
        if (age / sim.pool.lifetime[i] < 0.15) continue; // still fading in
        if (remaining > FADE_OUT_SECONDS) {
          expect(buffers.a[i]).toBeCloseTo(PEAK_ALPHA, 5); // no fade before the last 250 ms
          holding++;
        } else if (remaining < 0.15) {
          expect(buffers.a[i]).toBeLessThan(PEAK_ALPHA); // the last 150 ms is fading for every lifetime (fade ≥ 179 ms)
          fading++;
        }
      }
    }
    expect(holding).toBeGreaterThan(0);
    expect(fading).toBeGreaterThan(0);
  });

  it('keeps only the skull layer, leaving the original document untouched', () => {
    const original = portal();
    const before = structuredClone(original);
    const doc = cascadeDoc(original, 'pull', SHEET, 250);
    expect(doc.layers.map((l) => l.id)).toEqual(['pull']);
    expect(original).toEqual(before);
  });

  it('starts empty and fills from the emitter rather than prewarming', () => {
    const fx = new Effect(cascadeDoc(portal(), 'pull', SHEET, 250));
    expect(fx.particleCount).toBe(0);
    fx.step(1 / 30);
    // Every skull alive after the first step was born in it, at the emitter.
    const { pool, count } = fx.layers[0];
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) expect(pool.age[i]).toBeLessThanOrEqual(1 / 30 + 1e-6);
  });

  it('shoots skulls upward in a 30° fan', () => {
    const doc = cascadeDoc(portal(), 'pull', SHEET, 250);
    expect(layer(doc, 'pull').shape).toMatchObject({ kind: 'cone', direction: -90, spread: 30, radius: 0 });

    // Young skulls (gravity has barely acted) are above the emitter and inside the fan: |x| / height ≤ tan 15° = 0.27.
    // The bound is 0.35 because gravity has already shaved a little height by 0.2 s.
    // The cascade isn't prewarmed, so run 0.2 s first for skulls of that age to exist.
    const fx = new Effect(doc);
    for (let i = 0; i < 6; i++) fx.step(1 / 30);
    const { pool, count } = fx.layers[0];
    let checked = 0;
    for (let i = 0; i < count; i++) {
      if (pool.age[i] < 0.05 || pool.age[i] > 0.2) continue;
      expect(pool.y[i]).toBeLessThan(0);
      expect(Math.abs(pool.x[i]) / -pool.y[i]).toBeLessThan(0.35);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('pulls skulls down with gravity and bounces them off the floor', () => {
    const fx = new Effect(cascadeDoc(portal(), 'pull', SHEET, 250));
    let bounced = 0;
    for (let step = 0; step < 150; step++) {
      fx.step(1 / 30);
      const { pool, count } = fx.layers[0];
      for (let i = 0; i < count; i++) {
        expect(pool.y[i]).toBeLessThanOrEqual(FLOOR_Y);
        // Skulls only ever start at the emitter (y = 0) moving up, so one moving up below it has bounced.
        if (pool.y[i] > 0 && pool.velY[i] < 0) bounced++;
      }
    }
    expect(bounced).toBeGreaterThan(0);
  });

  it('grows skulls from half size to full over life', () => {
    const size = layer(cascadeDoc(portal(), 'pull', SHEET, 250), 'pull').overLifetime.size;
    expect(size).toEqual({ mode: 'curve', keys: [{ t: 0, v: 0.5, ease: 'easeIn' }, { t: 1, v: 1 }] });
  });

  it('gives each skull its own tilt and a roughly even left/right split', () => {
    const fx = new Effect(cascadeDoc(portal(), 'pull', SHEET, 250));
    for (let i = 0; i < 60; i++) fx.step(1 / 30);
    const { pool, count } = fx.layers[0];
    const flips = pool.flipBits;
    if (!flips) throw new Error('randomFlip should allocate the flip column');
    let mirrored = 0;
    const tilts = new Set<number>();
    for (let i = 0; i < count; i++) {
      mirrored += flips[i] & 1;
      expect(flips[i] & 2).toBe(0); // never upside-down by mirroring; rotation alone does that
      expect(Math.abs(pool.rotation[i])).toBeLessThanOrEqual(180);
      tilts.add(Math.round(pool.rotation[i]));
    }
    // With ~200 skulls at 50%, anything outside 30-70% would mean the flip isn't random per particle.
    expect(mirrored / count).toBeGreaterThan(0.3);
    expect(mirrored / count).toBeLessThan(0.7);
    expect(tilts.size).toBeGreaterThan(count / 4);
  });

  it.each([10, 100, 1000])('keeps %i skulls alive once it has settled', (count) => {
    const fx = new Effect(cascadeDoc(portal(), 'pull', SHEET, count));
    // 5 s: past the longest 3.5 s life, so births and deaths balance. Births run 50% ahead of deaths, so the cap holds
    // the count, give or take the deaths of one step before the next step's births refill them.
    for (let i = 0; i < 150; i++) fx.step(1 / 30);
    expect(fx.particleCount).toBeLessThanOrEqual(count);
    expect(fx.particleCount).toBeGreaterThanOrEqual(Math.floor(count * 0.95));
  });

  it('fails fast on an unknown layer', () => {
    expect(() => cascadeDoc(portal(), 'nope', SHEET, 250)).toThrow('No layer "nope" in "Portal"');
  });
});

describe('birdsDoc', () => {
  function flock(seconds: number, exitX?: number, count = 100): Effect {
    const fx = new Effect(birdsDoc(portal(), 'pull', SHEET, count));
    if (exitX !== undefined) setBirdsExit(fx.layers[0].layer, exitX);
    for (let i = 0; i < seconds * 30; i++) fx.step(1 / 30);
    return fx;
  }

  it('flies every bird straight right at 40-120 px/s, mirrored to face its flight', () => {
    const { pool, count } = flock(2).layers[0];
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      expect(pool.velY[i]).toBeCloseTo(0, 6);
      expect(pool.velX[i]).toBeGreaterThanOrEqual(BIRD_SPEED_MIN - 1e-3);
      expect(pool.velX[i]).toBeLessThanOrEqual(BIRD_SPEED_MAX + 1e-3);
      expect(pool.flipBits?.[i]).toBe(1); // the art faces left, so every bird is mirrored to face its flight
    }
  });

  it('makes smaller birds slower', () => {
    const sim = flock(2).layers[0];
    const buffers = makeRenderBuffers(sim.pool.capacity);
    computeRenderState(sim, buffers);
    const bySpeed = Array.from({ length: sim.count }, (_, i) => i).sort((a, b) => sim.pool.velX[a] - sim.pool.velX[b]);
    for (let k = 1; k < bySpeed.length; k++) {
      expect(buffers.size[bySpeed[k]]).toBeGreaterThanOrEqual(buffers.size[bySpeed[k - 1]] - 1e-3);
    }
    expect(buffers.size[bySpeed[0]]).toBeLessThan(buffers.size[bySpeed[bySpeed.length - 1]]);
  });

  it.each([10, 100, 1000])('holds the flock at exactly %i birds', (count) => {
    expect(flock(5, undefined, count).particleCount).toBe(count);
  });

  it('removes birds at the exit and replaces them on the left, keeping the count', () => {
    const fx = flock(20, 300); // 20 s: even the slowest birds (40 px/s) have crossed 300 px and been replaced
    const { pool, count } = fx.layers[0];
    expect(count).toBe(100);
    // One step's travel at the fastest speed is the most a bird can be past the exit before it's removed.
    for (let i = 0; i < count; i++) expect(pool.x[i]).toBeLessThanOrEqual(300 + BIRD_SPEED_MAX / 30);
  });

  it('fails fast when asked to move an exit a layer does not have', () => {
    const layerWithout = new Effect(portal()).layers[0].layer;
    expect(() => setBirdsExit(layerWithout, 10)).toThrow('has no exit kill zone');
  });
});

describe('swirlDoc', () => {
  // Roughly this window's geometry: attractors at a quarter and three quarters across, halfway down the open band,
  // with the emitter lower down at 0,0.
  const A = { x: -151, y: -220 };
  const B = { x: 151, y: -220 };

  function swirl(seconds: number, hostAttractor = true) {
    const fx = new Effect(swirlDoc(portal(), 'pull', SHEET, 1000));
    setSwirlAttractors(fx, fx.layers[0].layer, A, B);
    if (!hostAttractor) fx.clearAttractor();
    let near = 0;
    let left = 0;
    let samples = 0;
    for (let f = 0; f < seconds * 30; f++) {
      fx.step(1 / 30);
      if (f < 90) continue; // skip the first 3 s while the pull is still gathering skulls
      const { pool, count } = fx.layers[0];
      for (let i = 0; i < count; i++) {
        const [x, y] = [pool.x[i], pool.y[i]];
        if (Math.hypot(x - A.x, y - A.y) < 120 || Math.hypot(x - B.x, y - B.y) < 120) near++;
        if (x < 0) left++;
        samples++;
      }
    }
    return { fx, near: near / samples, left: left / samples };
  }

  it('is the cascade fountain with no gravity or floor, plus two matching straight-pull attractors', () => {
    const pull = layer(swirlDoc(portal(), 'pull', SHEET, 250), 'pull');
    expect(pull.shape).toMatchObject({ kind: 'cone', direction: -90, spread: 30 });
    expect(pull.emission.prewarm).toBe(false);
    expect(pull.overLifetime.velocity.gravity).toEqual({ x: 0, y: 0 });
    expect(pull.collision).toBeNull();
    expect(pull.attractor).toMatchObject({ tangential: null, falloff: 'smooth', killRadius: 0 });
    expect(pull.attractor?.strength).toEqual({ mode: 'constant', value: ATTRACTOR_STRENGTH });
    expect(pull.attractorInfluence).toBe(1); // the host attractor at full strength, matching the layer one
  });

  it('pulls most skulls in close to the two points, split evenly between them', () => {
    const { near, left } = swirl(6);
    expect(near).toBeGreaterThan(0.6);
    expect(left).toBeGreaterThan(0.4);
    expect(left).toBeLessThan(0.6);
  });

  it('really uses both attractors: without the host one, skulls all go to the layer attractor', () => {
    expect(swirl(6, false).left).toBeGreaterThan(0.8);
  });

  it('sizes the pull to reach the emitter, wherever the points are', () => {
    const fx = new Effect(swirlDoc(portal(), 'pull', SHEET, 100));
    const sim = fx.layers[0];
    setSwirlAttractors(fx, sim.layer, { x: -400, y: -300 }, { x: 400, y: -300 });
    expect(sim.layer.attractor?.radius).toBeCloseTo(ATTRACTOR_REACH * 500);
    expect([sim.layer.attractor?.x, sim.layer.attractor?.y]).toEqual([-400, -300]);
  });

  it('fails fast when asked to place attractors on a layer without one', () => {
    const fx = new Effect(portal());
    expect(() => setSwirlAttractors(fx, fx.layers[0].layer, A, B)).toThrow('has no attractor');
  });
});
