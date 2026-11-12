import { describe, expect, it } from 'vitest';
import { computeRenderState, Effect, makeRenderBuffers, type LayerSim } from '@particlr/runtime';
import { particleTransform } from './particleTransform';
import { cascadeDoc } from './skullLayer';
import { portal, SHEET } from './testFixtures';

function settled(fx: Effect, id: string): LayerSim {
  for (let i = 0; i < 60; i++) fx.step(1 / 30);
  const sim = fx.layers.find((s) => s.layer.id === id);
  if (!sim) throw new Error(`no layer ${id}`);
  return sim;
}

describe('particleTransform', () => {
  it('mirrors exactly the particles Particlr flips, and keeps their own tilt', () => {
    const sim = settled(new Effect(cascadeDoc(portal(), 'pull', SHEET, 250)), 'pull');
    const buffers = makeRenderBuffers(sim.pool.capacity);
    computeRenderState(sim, buffers);
    const flips = sim.pool.flipBits;
    if (!flips) throw new Error('randomFlip should allocate the flip column');

    for (let i = 0; i < sim.count; i++) {
      const t = particleTransform(sim, buffers, i, 100);
      const scale = buffers.size[i] / 100;
      expect(t.scaleX).toBeCloseTo(flips[i] & 1 ? -scale : scale);
      expect(t.scaleY).toBeCloseTo(scale);
      // With randomFlip set Particlr reads the angle from the render buffer; for a non-velocity-aligned layer that
      // is the particle's own rotation.
      expect(t.rotation).toBeCloseTo((sim.pool.rotation[i] * Math.PI) / 180);
      expect([t.x, t.y]).toEqual([sim.pool.x[i], sim.pool.y[i]]);
    }
  });

  it('reads rotation straight from the pool when neither render nor randomFlip is set', () => {
    // Portal's core-glow layer has neither, so velAngle is never written and must not be used.
    const sim = settled(new Effect(portal()), 'core-glow');
    expect(sim.layer.render).toBeNull();
    expect(sim.layer.randomFlip).toBeNull();
    const buffers = makeRenderBuffers(sim.pool.capacity);
    buffers.velAngle.fill(999); // would show up if wrongly read
    computeRenderState(sim, buffers);

    const t = particleTransform(sim, buffers, 0, 100);
    expect(t.rotation).toBeCloseTo((sim.pool.rotation[0] * Math.PI) / 180);
    expect(t.scaleX).toBeGreaterThan(0);
  });

  it('packs the render colour into a 0xRRGGBB tint', () => {
    const sim = settled(new Effect(cascadeDoc(portal(), 'pull', SHEET, 250)), 'pull');
    const buffers = makeRenderBuffers(sim.pool.capacity);
    computeRenderState(sim, buffers);
    // The skull layer's colour ramp is white, so every live skull is untinted.
    expect(particleTransform(sim, buffers, 0, 100).tint).toBe(0xffffff);
  });
});
