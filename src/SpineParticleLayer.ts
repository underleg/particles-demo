import { Container } from 'pixi.js';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import { computeRenderState, makeRenderBuffers, type Effect, type LayerRenderBuffers, type LayerSim } from '@particlr/runtime';
import type { SortKey } from './drawOrder';
import type { Rect } from './layout';
import { particleTransform } from './particleTransform';
import { animationDuration, localBounds, poseAt } from './spineAnimation';

// Draws a Spine instance at every live particle of one layer, in place of that layer's own sprites.
// Particlr can only draw textured quads, but its simulation is public: the pool holds each particle's position and
// age, and computeRenderState gives the size, colour, angle and mirroring the built-in renderer would draw.
export class SpineParticleLayer {
  readonly container = new Container();
  private readonly sim: LayerSim;
  private readonly buffers: LayerRenderBuffers;
  private readonly instances: Spine[] = [];
  private readonly duration: number;
  private readonly bounds: Rect;
  private readonly side: number; // larger side of the animation's bounds; a particle's size maps onto it, as for a square sprite

  constructor(
    private readonly effect: Effect,
    layerId: string,
    private readonly createInstance: () => Spine,
    private readonly sortKey: SortKey,
  ) {
    const sim = effect.layers.find((s) => s.layer.id === layerId);
    if (!sim) throw new Error(`No layer "${layerId}" in the effect`);
    this.sim = sim;
    this.buffers = makeRenderBuffers(sim.pool.capacity);
    // Same draw order as the flipbook mode's SortedSprites: each instance's zIndex is its particle's sort key.
    this.container.sortableChildren = true;

    const first = createInstance();
    this.duration = animationDuration(first);
    this.bounds = localBounds(first);
    this.side = Math.max(this.bounds.width, this.bounds.height);
    this.adopt(first);
  }

  // Call after effect.step(). The pool swap-compacts as particles die, so slot i is not the same particle from frame
  // to frame; each instance is therefore posed purely from its slot's particle (its age), never from its own history.
  sync(): void {
    // Placed exactly as the built-in renderer places the layer: a local layer rides the emitter (its particles are
    // relative to it); a world layer stays at the origin (its particles are already in the effect's frame, which is
    // what lets a moving emitter leave them behind).
    if (this.sim.layer.space === 'world') this.container.position.set(0, 0);
    else this.container.position.set(this.effect.emitterX, this.effect.emitterY);
    computeRenderState(this.sim, this.buffers);
    const { pool } = this.sim;
    const count = this.sim.count;
    const keys = this.sortKey(pool);
    while (this.instances.length < count) this.adopt(this.createInstance());

    for (let i = 0; i < this.instances.length; i++) {
      const spine = this.instances[i];
      spine.visible = i < count;
      if (!spine.visible) continue;
      const t = particleTransform(this.sim, this.buffers, i, this.side);
      spine.position.set(t.x, t.y);
      spine.scale.set(t.scaleX, t.scaleY);
      spine.rotation = t.rotation;
      spine.alpha = t.alpha;
      spine.tint = t.tint;
      spine.zIndex = keys[i];
      // frameRand gives each particle its own start point in the loop, matching the flipbook's randomStartFrame.
      poseAt(spine, pool.age[i] + pool.frameRand[i] * this.duration);
    }
  }

  private adopt(spine: Spine): void {
    // Particles are drawn centred on their position, so centre the skeleton's bounds on it too.
    spine.pivot.set(this.bounds.x + this.bounds.width / 2, this.bounds.y + this.bounds.height / 2);
    this.instances.push(spine);
    this.container.addChild(spine);
  }
}
