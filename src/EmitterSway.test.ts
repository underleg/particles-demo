import { describe, expect, it } from 'vitest';
import { Effect } from '@particlr/runtime';
import { EmitterSway, swayX } from './EmitterSway';
import { setSwirlAttractors, swirlDoc } from './skullLayer';
import { portal, SHEET } from './testFixtures';

describe('swayX', () => {
  it('traces one full sine wave per period: centre, right, centre, left, centre', () => {
    const at = (t: number) => swayX(t, 100, 2);
    expect(at(0)).toBeCloseTo(0);
    expect(at(0.5)).toBeCloseTo(100);
    expect(at(1)).toBeCloseTo(0);
    expect(at(1.5)).toBeCloseTo(-100);
    expect(at(2)).toBeCloseTo(0);
  });
});

describe('EmitterSway on the swirl', () => {
  function swaying(seconds: number) {
    const fx = new Effect(swirlDoc(portal(), 'pull', SHEET, 1000));
    setSwirlAttractors(fx, fx.layers[0].layer, { x: -151, y: -220 }, { x: 151, y: -220 });
    const sway = new EmitterSway(2);
    sway.amplitude = 150;
    const emitter: { x: number; y: number }[] = [];
    for (let f = 0; f < seconds * 30; f++) {
      fx.step(1 / 30);
      sway.advance(fx, 1 / 30);
      emitter.push({ x: fx.emitterX, y: fx.emitterY });
    }
    return { fx, emitter };
  }

  it('moves the emitter along x only, between ±amplitude, on a 2 s cycle', () => {
    const { emitter } = swaying(4);
    expect(emitter.every((p) => p.y === 0)).toBe(true);
    expect(Math.max(...emitter.map((p) => p.x))).toBeCloseTo(150, 0);
    expect(Math.min(...emitter.map((p) => p.x))).toBeCloseTo(-150, 0);
    // 60 frames = 2 s apart, the emitter is back at the same x.
    expect(emitter[90].x).toBeCloseTo(emitter[30].x, 3);
  });

  it('spawns newborn skulls where the emitter is, and leaves older ones where they were', () => {
    const { fx } = swaying(3);
    const { pool, count } = fx.layers[0];
    // Births spread along the emitter's path, which spans ±150 px, so newborns are spread sideways that far.
    const newbornX = Array.from({ length: count }, (_, i) => i).filter((i) => pool.age[i] < 1 / 30).map((i) => pool.x[i]);
    expect(newbornX.length).toBeGreaterThan(0);
    // Within one step's travel of the emitter: at most 150 x 2π / 2 s ≈ 471 px/s, so ~16 px per 1/30 s step.
    for (const x of newbornX) expect(Math.abs(x - fx.emitterX)).toBeLessThan(20);
    // World space: moving the emitter doesn't drag skulls already in flight with it.
    const before = Array.from(pool.x.slice(0, count));
    fx.setEmitterPosition(fx.emitterX + 500, 0);
    fx.step(1e-6); // a tiny step: positions barely move on their own
    const dragged = before.filter((x, i) => Math.abs(pool.x[i] - x) > 100).length;
    expect(dragged).toBe(0);
  });
});
