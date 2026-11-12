import { describe, expect, it } from 'vitest';
import { Effect, type ParticleDoc } from '@particlr/runtime';
import { ascendingBy, byAge, bySpeedX, SortedSprites, type SortKey } from './drawOrder';
import { birdsDoc, cascadeDoc } from './skullLayer';
import { portal, SHEET } from './testFixtures';

describe('ascendingBy', () => {
  it('orders the live prefix by key, lowest first', () => {
    expect(ascendingBy([0.5, 0.1, 2, 0.3, 9], 4)).toEqual([1, 3, 0, 2]);
  });

  it('handles an empty layer', () => {
    expect(ascendingBy([], 0)).toEqual([]);
  });
});

// Mirrors PixiParticleRenderer.syncRenderList: it trims or extends particleChildren by index, assuming entry j is
// pool slot j, so this is exactly the behaviour SortedSprites must not break.
function rendererSync(children: number[], sprites: number[], count: number): void {
  if (count < children.length) children.length = count;
  else for (let j = children.length; j < count; j++) children.push(sprites[j]);
}

function runSorted(doc: ParticleDoc, key: SortKey, frames: number): void {
  const fx = new Effect(doc);
  const sim = fx.layers[0];
  const sprites = Array.from({ length: sim.pool.capacity }, (_, j) => j); // sprite j stands for pool slot j
  const container = { particleChildren: [] as number[] };
  const order = new SortedSprites(container, sim, key);

  for (let frame = 0; frame < frames; frame++) {
    fx.step(1 / 30);
    order.beforeSync();
    // Whatever the previous frame sorted, the renderer must see slots 0..n-1 in order before it trims/extends.
    expect(container.particleChildren).toEqual(sprites.slice(0, container.particleChildren.length));
    rendererSync(container.particleChildren, sprites, sim.count);
    order.afterSync();

    const drawn = container.particleChildren;
    expect([...drawn].sort((a, b) => a - b)).toEqual(sprites.slice(0, sim.count)); // every live skull, once
    const keys = key(sim.pool);
    for (let k = 1; k < drawn.length; k++) expect(keys[drawn[k]]).toBeGreaterThanOrEqual(keys[drawn[k - 1]]);
  }
}

describe('SortedSprites', () => {
  it('draws cascade skulls oldest last, and gives the renderer back pool order every frame', () => {
    runSorted(cascadeDoc(portal(), 'pull', SHEET, 250), byAge, 90);
  });

  it('draws birds fastest last', () => {
    runSorted(birdsDoc(portal(), 'pull', SHEET, 100), bySpeedX, 90);
  });

  it('refuses a non-flipbook layer, whose texture coordinates would not follow a reorder', () => {
    const sim = new Effect(portal()).layers[0];
    expect(() => new SortedSprites({ particleChildren: [] }, sim, byAge)).toThrow('must be a flipbook layer');
  });
});
