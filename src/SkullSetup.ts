import { ParticleContainer } from 'pixi.js';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Effect, MAX_DT, type LayerSim, type ParticleDoc } from '@particlr/runtime';
import { PixiParticleRenderer } from '@particlr/runtime/pixi';
import { SortedSprites, type SortKey } from './drawOrder';
import { SpineParticleLayer } from './SpineParticleLayer';

export type SkullMode = 'spine' | 'flipbook';

// Host behaviour run after every simulation step, for things Particlr has no setting for. `seconds` is the step asked for.
export type StepHook = (fx: Effect, sim: LayerSim, seconds: number) => void;

// One emitter setup: its own simulation, the Particlr renderer for its flipbook skulls, the Spine stand-ins, and the
// draw order shared by both. Setups are built once and kept, so switching between them is instant and each resumes
// where it was left.
export class SkullSetup {
  readonly fx: Effect;
  readonly sim: LayerSim;
  readonly view: PixiParticleRenderer;
  private readonly flipbook: ParticleContainer;
  private readonly order: SortedSprites<ParticleContainer['particleChildren'][number]>;
  private readonly spine: SpineParticleLayer;

  private constructor(
    doc: ParticleDoc,
    layerId: string,
    sortKey: SortKey,
    createSpine: () => Spine,
    private readonly afterStep?: StepHook,
  ) {
    this.fx = new Effect(doc);
    const sim = this.fx.layers.find((s) => s.layer.id === layerId);
    if (!sim) throw new Error(`No layer "${layerId}" in the effect`);
    this.sim = sim;
    this.view = new PixiParticleRenderer(this.fx);
    this.flipbook = layerParticleContainer(this.view, this.fx, layerId);
    // Runs in both skull modes, not only while the flipbook is shown, so its saved pool order is never stale.
    this.order = new SortedSprites(this.flipbook, sim, sortKey);
    this.spine = new SpineParticleLayer(this.fx, layerId, createSpine, sortKey);
    // Directly above the layer it replaces, so both modes stack the same way against any other layers.
    this.view.container.addChildAt(this.spine.container, this.view.container.getChildIndex(this.flipbook) + 1);
  }

  static async create(
    doc: ParticleDoc,
    layerId: string,
    sortKey: SortKey,
    createSpine: () => Spine,
    afterStep?: StepHook,
  ): Promise<SkullSetup> {
    const setup = new SkullSetup(doc, layerId, sortKey, createSpine, afterStep);
    await setup.view.ready; // the baked sheet decodes asynchronously
    // A failed decode would silently fall back to a soft circle; this demo exists to show the skulls, so stop instead.
    if (setup.view.warnings.length > 0) throw new Error(`Particle renderer: ${setup.view.warnings.join('; ')}`);
    return setup;
  }

  setSkullMode(mode: SkullMode): void {
    this.spine.container.visible = mode === 'spine';
    this.flipbook.visible = mode === 'flipbook';
  }

  step(seconds: number): void {
    this.fx.step(seconds);
    this.afterStep?.(this.fx, this.sim, seconds);
    this.order.beforeSync();
    this.view.sync();
    this.order.afterSync();
    // Only pose the Spine skulls while they're shown, so the readout compares the two modes' real costs.
    if (this.spine.container.visible) this.spine.sync();
  }

  // Frees the renderer's sprites and the Spine stand-ins; the shared skull sheet stays cached for the next setup.
  destroy(): void {
    this.view.container.removeFromParent();
    this.view.destroy();
  }

  // Simulates ahead without drawing, for a setup whose steady state takes longer than its prewarm to reach.
  // Particlr clamps each step to MAX_DT, so larger steps would silently simulate less time than asked.
  warmUp(seconds: number): void {
    for (let t = 0; t < seconds; t += MAX_DT) {
      this.fx.step(MAX_DT);
      this.afterStep?.(this.fx, this.sim, MAX_DT);
    }
  }
}

// PixiParticleRenderer exposes no per-layer handle, but builds one ParticleContainer per layer in layer order.
// The count check fails fast if a future runtime version changes that layout.
function layerParticleContainer(view: PixiParticleRenderer, fx: Effect, layerId: string): ParticleContainer {
  const containers = view.container.children.filter((c) => c instanceof ParticleContainer);
  const index = fx.layers.findIndex((s) => s.layer.id === layerId);
  if (containers.length !== fx.layers.length || index < 0) {
    throw new Error(`Cannot find the particle container for layer "${layerId}"`);
  }
  return containers[index];
}
