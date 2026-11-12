import { validateParticle, type Effect, type Layer, type ParticleDoc } from '@particlr/runtime';
import type { Point } from './layout';

export interface FlipbookSheet {
  dataUrl: string;
  cols: number;
  rows: number;
  fps: number;
}

export const SKULL_TEXTURE = 'skull';

// The three emitter setups. Each is generated from portal.prt's pull layer by the functions below and shipped as
// public/effects/<setup>.prt (see export.html), which the app loads.
export const SETUPS = ['cascade', 'birds', 'swirl'] as const;
export type Setup = (typeof SETUPS)[number];
// The count each file is saved with. The app overrides it from the menu (withCount), so it only matters to anyone
// opening a file on its own, such as in Particlr's editor.
export const FILE_COUNT = 100;

// --- Cascade ---------------------------------------------------------------------------------------------------------

// Collision plane in the layer's local frame (y down, emitter at 0). Particlr collides particle *centres*, so anything
// drawing the floor must sit lower by about half a skull, or skulls appear to sink into it.
export const FLOOR_Y = 80;

export const LIFE_MIN = 2.5; // seconds
export const LIFE_MAX = 3.5;
export const FADE_OUT_SECONDS = 0.25;
export const PEAK_ALPHA = 0.9; // the original layer's peak opacity

// A skull fountain: fired up in a fan, falling under gravity, bouncing on a floor, growing as it ages. `count` is how
// many skulls are alive at once.
export function cascadeDoc(doc: ParticleDoc, layerId: string, sheet: FlipbookSheet, count: number): ParticleDoc {
  return skullDoc(doc, layerId, sheet, 'Skulls: Cascade', (layer) => {
    fountain(layer);
    setCount(layer, 'cascade', count);
    // Light gravity keeps the arc floaty: 300-360 px/s up against 450 px/s² peaks ~100-145 px above the emitter and
    // lands in ~1.7 s, leaving time in a 2.5-3.5 s life for a bounce or two.
    layer.overLifetime.velocity.gravity = { x: 0, y: 450 };
    // Each bounce keeps 55% of the vertical speed and 80% of the sideways speed, so skulls settle rather than skate.
    layer.collision = {
      shape: { kind: 'floor', y: FLOOR_Y },
      bounce: 0.55,
      dampen: 0.2,
      lifetimeLoss: 0,
      killOnCollide: false,
      minKillSpeed: 0,
    };
  });
}

// --- Swirl -----------------------------------------------------------------------------------------------------------

// Both attractors pull straight at their point with the same strength and the same smooth falloff, so neither wins.
// The pull must grow towards each point (a radius about the size of the gap between them) or it is near-uniform and
// the two cancel along the line between them, leaving skulls bobbing around the midpoint. Values tuned in simulation.
export const ATTRACTOR_STRENGTH = 3000; // px/s² at the point, easing smoothly to 0 at the radius
// The radius is this multiple of the emitter-to-attractor distance, so skulls launched from the emitter are always
// inside the pull whatever the window size (~320 px on an 800 px-wide window).
export const ATTRACTOR_REACH = 1.2;
// Without drag a pulled skull keeps its launch speed and swings straight through the point and out again; mild drag
// lets it spiral in. In simulation drag 1 took the share of skulls near an attractor from ~5% to ~75%.
export const SWIRL_DRAG = 1;

// The cascade's fountain with no gravity and no floor, pulled by two attractors instead. Particlr gives a layer one
// attractor of its own (`attractor`, in the document) plus one host attractor (`Effect.setAttractor`, scaled by the
// layer's `attractorInfluence`), applied one after the other with the same force formula, so using one of each gives
// two matching attractors. Their positions depend on the screen, so the host sets both with setSwirlAttractors.
export function swirlDoc(doc: ParticleDoc, layerId: string, sheet: FlipbookSheet, count: number): ParticleDoc {
  return skullDoc(doc, layerId, sheet, 'Skulls: Swirl', (layer) => {
    fountain(layer);
    setCount(layer, 'swirl', count);
    // The host sways the emitter. In local space Particlr would carry every skull in flight (and the attractors) along
    // with it; in world space skulls are born where the emitter is and then stay in the effect's frame.
    layer.space = 'world';
    layer.overLifetime.velocity.gravity = { x: 0, y: 0 };
    layer.overLifetime.velocity.drag = { mode: 'constant', value: SWIRL_DRAG };
    layer.collision = null;
    layer.attractor = {
      x: 0, // placeholders; setSwirlAttractors sets position and radius for the screen
      y: 0,
      strength: { mode: 'constant', value: ATTRACTOR_STRENGTH },
      tangential: null, // a straight pull: no sideways push, which the host attractor couldn't match
      radius: 1,
      falloff: 'smooth', // the host attractor's falloff is fixed at smooth
      killRadius: 0,
    };
    layer.attractorInfluence = 1; // the host attractor at full strength
  });
}

// Places the two attractors in the effect's frame, whose origin is the emitter's centre position (it sways either
// side of it). The layer is world space, so both attractors use those coordinates as they are. Particlr reads the
// layer attractor every step and the host one is set per step, so calling this on resize takes effect immediately.
export function setSwirlAttractors(fx: Effect, layer: Layer, a: Point, b: Point): void {
  if (!layer.attractor) throw new Error(`Layer "${layer.id}" has no attractor`);
  // One radius for both, so they stay matched even if the points aren't placed symmetrically. Measured from the
  // emitter's centre position, so skulls launched there are always inside the pull.
  const radius = ATTRACTOR_REACH * Math.max(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y));
  layer.attractor.x = a.x;
  layer.attractor.y = a.y;
  layer.attractor.radius = radius;
  fx.setAttractor(b.x, b.y, ATTRACTOR_STRENGTH, radius);
}

// --- Fountain (shared by cascade and swirl) --------------------------------------------------------------------------

// A fan of skulls fired up from the emitter, growing as they age, with a random tilt and facing.
function fountain(layer: Layer): void {
  // Each skull gets a random tilt and faces left or right at random. The mirror is a negative x scale, so it flips
  // the art itself, not just its angle.
  layer.initial.rotation = { mode: 'range', min: -180, max: 180 };
  layer.randomFlip = { x: 0.5, y: 0 };
  // A 30° fan pointing straight up (-90°: y is down). Radius 0 fires every skull from the emitter itself.
  layer.shape = { kind: 'cone', direction: -90, spread: 30, radius: 0, arcMode: 'random', arcSpeed: 1, emitFrom: 'volume' };
  layer.initial.speed = { mode: 'range', min: 300, max: 360 };
  layer.initial.life = { mode: 'range', min: LIFE_MIN, max: LIFE_MAX };
  // Starts empty and fills from the emitter, rather than opening already in full flow (the original layer prewarms).
  layer.emission.prewarm = false;
  layer.initial.size = { mode: 'range', min: 56, max: 80 };
  // Grow from half size to full over life, so skulls start small at the emitter and are largest at the end.
  layer.overLifetime.size = {
    mode: 'curve',
    keys: [
      { t: 0, v: 0.5, ease: 'easeIn' },
      { t: 1, v: 1 },
    ],
  };
  // Fade in over the first 15% of life (as the original did), then hold until the last FADE_OUT_SECONDS. Gradient
  // keys are fractions of each skull's own life, so a fixed key can't be an exact time for every lifetime: placing it
  // against the longest life makes the fade 179-250 ms, never longer than 250 ms.
  const fadeOutStart = 1 - FADE_OUT_SECONDS / LIFE_MAX;
  layer.overLifetime.color = {
    keys: [
      { t: 0, r: 1, g: 1, b: 1, a: 0 },
      { t: 0.15, r: 1, g: 1, b: 1, a: PEAK_ALPHA },
      { t: fadeOutStart, r: 1, g: 1, b: 1, a: PEAK_ALPHA },
      { t: 1, r: 1, g: 1, b: 1, a: 0 },
    ],
  };
}

// --- Migrating birds -------------------------------------------------------------------------------------------------

export const BIRD_BAND = 300; // px height of the spawn line; birds keep their height, so this is the flock's height
export const BIRD_SPEED_MIN = 40; // px/s
export const BIRD_SPEED_MAX = 120;
export const BIRD_SIZE = 90; // px, the fastest bird; the slowest is 35% of this
const BIRD_SIZE_SLOWEST = 0.35;

// A flock flying left to right, the layer's origin being the spawn line just off the left of the screen. Size is
// tied to speed through Particlr's bySpeed remap (speed and size are otherwise independent random draws), so smaller
// birds are slower, reading as further away. Birds die only on reaching the exit kill zone, whose x the host keeps
// just past the right edge with setBirdsExit as the window resizes. `count` is the flock size.
export function birdsDoc(doc: ParticleDoc, layerId: string, sheet: FlipbookSheet, count: number): ParticleDoc {
  return skullDoc(doc, layerId, sheet, 'Skulls: Migrating Birds', (layer) => {
    layer.initial.rotation = { mode: 'constant', value: 0 };
    // The skull art faces left; mirror every bird so it faces the way it flies.
    layer.randomFlip = { x: 1, y: 0 };
    // A vertical line drawn top to bottom: polyline "normal" fires along its CCW normal (dy, -dx), which for a
    // downward segment is +x. Edge and rect shapes can only fire straight up.
    layer.shape = {
      kind: 'polyline',
      points: [
        { x: 0, y: -BIRD_BAND / 2 },
        { x: 0, y: BIRD_BAND / 2 },
      ],
      closed: false,
      smoothing: 0,
      direction: 'normal',
      emitFrom: 'volume',
    };
    layer.initial.speed = { mode: 'range', min: BIRD_SPEED_MIN, max: BIRD_SPEED_MAX };
    // Longer than the slowest crossing of any screen, so lifetime never ends a flight; the exit zone does.
    layer.initial.life = { mode: 'constant', value: 600 };
    layer.overLifetime.velocity.gravity = { x: 0, y: 0 };
    layer.initial.size = { mode: 'constant', value: BIRD_SIZE };
    layer.overLifetime.size = null;
    layer.bySpeed = {
      range: { min: BIRD_SPEED_MIN, max: BIRD_SPEED_MAX },
      size: {
        mode: 'curve',
        keys: [
          { t: 0, v: BIRD_SIZE_SLOWEST },
          { t: 1, v: 1 },
        ],
      },
      color: null,
      rotation: null,
    };
    setCount(layer, 'birds', count);
    // Placeholder x; setBirdsExit moves it to the screen's right edge. Tall enough to catch any bird.
    layer.killZones = [{ x: 1e6, y: -1e4, width: 1e6, height: 2e4 }];
    // Birds enter and leave off screen, so no fading.
    layer.overLifetime.color = {
      keys: [
        { t: 0, r: 1, g: 1, b: 1, a: 1 },
        { t: 1, r: 1, g: 1, b: 1, a: 1 },
      ],
    };
  });
}

// Particlr reads kill zones every step, so moving this one takes effect immediately.
export function setBirdsExit(layer: Layer, x: number): void {
  const zone = layer.killZones?.[0];
  if (!zone) throw new Error(`Layer "${layer.id}" has no exit kill zone`);
  zone.x = x;
}

// --- Shared ----------------------------------------------------------------------------------------------------------

// A copy of a one-layer skull effect (as loaded from its .prt) set to hold `count` skulls. A file stores one count,
// but the menu offers several, and Particlr fixes a pool's size when its effect is built, so the count is set on the
// document before building.
export function withCount(doc: ParticleDoc, setup: Setup, count: number): ParticleDoc {
  const copy = structuredClone(doc);
  if (copy.layers.length !== 1) throw new Error(`"${doc.meta.name}" should have one layer, not ${copy.layers.length}`);
  setCount(copy.layers[0], setup, count);
  return validated(copy);
}

// The cap holds the count, so births are set to outpace deaths and the cap just blocks the extra while full.
function setCount(layer: Layer, setup: Setup, count: number): void {
  layer.emission.maxParticles = count;
  const rate =
    setup === 'birds'
      ? // A bird takes at least a few seconds to cross, so births of half the flock per second far outpace departures,
        // and each bird that exits right is replaced on the left within a frame or two.
        count / 2
      : // Births outpace deaths by half again (rate x mean life = 1.5 x count); with only a small margin the count
        // sags below the cap between births.
        (1.5 * count) / ((LIFE_MIN + LIFE_MAX) / 2);
  layer.emission.rateOverTime = { mode: 'constant', value: rate };
}

function validated(doc: ParticleDoc): ParticleDoc {
  const result = validateParticle(doc);
  if (!result.ok) {
    const issues = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Skull layer produced an invalid effect: ${issues}`);
  }
  return result.doc;
}

// Reduces the effect to one layer drawn with the baked skull sheet, then lets `configure` shape its motion. Both
// skull drawing modes share the resulting document (and so one simulation), which is what lets the menu flip between
// them without the particles jumping: the flipbook mode draws the layer's own sprites with the sheet, the Spine mode
// hides them and draws a Spine skull at each particle instead.
function skullDoc(
  doc: ParticleDoc,
  layerId: string,
  sheet: FlipbookSheet,
  name: string,
  configure: (layer: Layer) => void,
): ParticleDoc {
  const copy = structuredClone(doc);
  const layer = copy.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error(`No layer "${layerId}" in "${doc.meta.name}"`);

  copy.layers = [layer];
  copy.meta = {
    ...copy.meta,
    name,
    notes: `Generated by particles_demo (src/skullLayer.ts, export.html) from the "${doc.meta.name}" preset's "${layerId}" layer. Positions marked as placeholders are set by the app for the screen.`,
  };
  copy.textures = { ...copy.textures, [SKULL_TEXTURE]: sheet.dataUrl };
  layer.texture = {
    ref: `user:${SKULL_TEXTURE}`,
    frames: {
      cols: sheet.cols,
      rows: sheet.rows,
      fps: sheet.fps,
      mode: 'loop',
      randomStartFrame: true, // so the skulls don't all chomp in step
      frameOverLife: null,
    },
  };
  // Additive blending would make the skulls glow and show through each other; they are opaque art.
  layer.blend = 'normal';
  // The original dots are stretched and turned along their velocity; skulls keep their own shape and angle.
  layer.render = null;
  layer.initial.angularVelocity = { mode: 'constant', value: 0 };
  // The original's orbital swirl is added to position without touching velocity: it would drag cascade skulls
  // through the floor and bend the birds' straight flight.
  layer.overLifetime.velocity.orbital = null;
  configure(layer);
  return validated(copy);
}
