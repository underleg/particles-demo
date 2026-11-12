import { mulberry32, type LayerSim, type Rng } from '@particlr/runtime';

export const SPIN_MIN = 90; // deg/s
export const SPIN_MAX = 360;
// Rebounds slower than this aren't counted as hits. A skull resting on the floor is pressed back into it by gravity
// every step and "bounces" at a few px/s; without this it would re-roll its spin every frame and jitter.
export const MIN_REBOUND_SPEED = 30; // px/s, upward, after the bounce

// Whether particle i hit the floor in the step just taken. Particlr's floor collision snaps a hitting particle's
// centre exactly onto the floor and reflects its vertical speed upward, so "on the floor and moving up" is a hit.
// Nothing else puts a particle exactly on the floor: one that hit a step earlier has since moved up off it.
export function hitFloor(y: number, velY: number, floorY: number): boolean {
  return y === floorY && velY < -MIN_REBOUND_SPEED;
}

// Gives each skull a new random spin (direction and rate) every time it hits the floor. Particlr's collision module
// can bounce, dampen or kill on impact but not change spin, and its collision events only carry a stable particle id
// on sub-emitter layers, so this checks the pool directly after each step. Seeded, so a run is repeatable.
export class FloorSpin {
  private readonly random: Rng;

  constructor(
    private readonly floorY: number,
    seed: number,
  ) {
    this.random = mulberry32(seed);
  }

  // Call after every effect.step(). Particlr's step never sub-steps, so no hit is missed between calls.
  apply(sim: LayerSim): void {
    const { pool } = sim;
    for (let i = 0; i < sim.count; i++) {
      if (!hitFloor(pool.y[i], pool.velY[i], this.floorY)) continue;
      const rate = SPIN_MIN + this.random() * (SPIN_MAX - SPIN_MIN);
      pool.angVel[i] = this.random() < 0.5 ? -rate : rate; // Particlr adds angVel x dt to rotation each step
    }
  }
}
