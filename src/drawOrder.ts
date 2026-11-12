import type { LayerSim, ParticlePool } from '@particlr/runtime';

// A per-particle value to draw in ascending order: the highest is drawn last, so it appears in front.
// Both keys below are stable between any two particles (they age at the same rate; a bird's speed never changes),
// so sorting never makes particles pop in front of each other.
export type SortKey = (pool: ParticlePool) => ArrayLike<number>;

// Cascade: oldest in front. Skulls grow with age, so this is also roughly small-behind-large.
export const byAge: SortKey = (pool) => pool.age;
// Birds: fastest in front. Birds fly straight right and their size is tied to speed, so slow = small = behind.
export const bySpeedX: SortKey = (pool) => pool.velX;

// Pool indices 0..count-1 in ascending key order.
export function ascendingBy(keys: ArrayLike<number>, count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  return order.sort((a, b) => keys[a] - keys[b]);
}

// Draws a Particlr layer's sprites in key order. Particlr's renderer draws them in pool order, which the pool's
// swap-compaction shuffles, and it keeps `particleChildren` in that order on purpose: it trims and extends the list
// by index, assuming entry j is pool slot j. So the sorted order is undone before each renderer sync and reapplied
// after it. Generic over the sprite type so it can be tested without a GPU.
export class SortedSprites<T> {
  private poolOrder: T[] = [];

  constructor(
    private readonly sprites: { particleChildren: T[] },
    private readonly sim: LayerSim,
    private readonly key: SortKey,
  ) {
    // Reordering is only safe if every per-sprite attribute is re-uploaded each frame. Particlr marks texture
    // coordinates dynamic only on flipbook layers; on any other layer they'd stay with the old list positions.
    if (sim.layer.texture.frames === null) {
      throw new Error(`Layer "${sim.layer.id}" must be a flipbook layer to reorder its sprites`);
    }
  }

  // Call immediately before PixiParticleRenderer.sync().
  beforeSync(): void {
    const children = this.sprites.particleChildren;
    // A loop, not push(...poolOrder): spreading a large list as call arguments can overflow the call stack.
    children.length = this.poolOrder.length;
    for (let j = 0; j < this.poolOrder.length; j++) children[j] = this.poolOrder[j];
  }

  // Call immediately after PixiParticleRenderer.sync(); entry j is then pool slot j.
  afterSync(): void {
    const children = this.sprites.particleChildren;
    this.poolOrder = children.slice();
    const order = ascendingBy(this.key(this.sim.pool), children.length);
    for (let k = 0; k < order.length; k++) children[k] = this.poolOrder[order[k]];
  }
}
