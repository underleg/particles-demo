import type { LayerRenderBuffers, LayerSim } from '@particlr/runtime';

const DEG_TO_RAD = Math.PI / 180;

export interface ParticleTransform {
  x: number;
  y: number;
  rotation: number; // radians
  scaleX: number; // negative = mirrored
  scaleY: number;
  alpha: number;
  tint: number; // 0xRRGGBB
}

// Where and how particle i would be drawn, following the same rules as @particlr/runtime's Pixi renderer so a
// non-sprite stand-in (a Spine skull) lands, turns and mirrors exactly like the sprite it replaces. `side` is the
// stand-in's size in its own units at scale 1; a particle's render size in px maps onto it.
// Call computeRenderState(sim, buffers) for the frame first.
export function particleTransform(sim: LayerSim, buffers: LayerRenderBuffers, i: number, side: number): ParticleTransform {
  const { layer, pool } = sim;
  // The renderer takes rotation from the render buffer whenever `render` or `randomFlip` is set (it then holds the
  // velocity angle or the particle's own rotation), and straight from the pool otherwise.
  const degrees = layer.render !== null || layer.randomFlip !== null ? buffers.velAngle[i] : pool.rotation[i];
  const scale = buffers.size[i] / side;
  const flip = buffers.flip[i];
  return {
    x: pool.x[i],
    y: pool.y[i],
    rotation: degrees * DEG_TO_RAD,
    scaleX: flip & 1 ? -scale : scale,
    scaleY: flip & 2 ? -scale : scale,
    alpha: buffers.a[i],
    tint: (byte(buffers.r[i]) << 16) | (byte(buffers.g[i]) << 8) | byte(buffers.b[i]),
  };
}

function byte(v: number): number {
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
}
