import { describe, expect, it } from 'vitest';
import { Effect } from '@particlr/runtime';
import { FloorSpin, hitFloor, MIN_REBOUND_SPEED, SPIN_MAX, SPIN_MIN } from './floorSpin';
import { cascadeDoc, FLOOR_Y } from './skullLayer';
import { portal, SHEET } from './testFixtures';

describe('hitFloor', () => {
  it('is a hit when on the floor and rebounding upward', () => {
    expect(hitFloor(FLOOR_Y, -200, FLOOR_Y)).toBe(true);
  });

  it('ignores a skull resting on the floor, which gravity re-presses into it every step', () => {
    expect(hitFloor(FLOOR_Y, -(MIN_REBOUND_SPEED - 1), FLOOR_Y)).toBe(false);
  });

  it('ignores skulls in the air, falling or rising', () => {
    expect(hitFloor(FLOOR_Y - 0.01, -200, FLOOR_Y)).toBe(false);
    expect(hitFloor(40, 200, FLOOR_Y)).toBe(false);
  });
});

describe('FloorSpin', () => {
  function run(frames: number, seed = 1) {
    const fx = new Effect(cascadeDoc(portal(), 'pull', SHEET, 250));
    const spin = new FloorSpin(FLOOR_Y, seed);
    const sim = fx.layers[0];
    const spinsAtHit: number[] = [];
    let airborneSpinning = 0;
    for (let f = 0; f < frames; f++) {
      fx.step(1 / 30);
      spin.apply(sim);
      const { pool } = sim;
      for (let i = 0; i < sim.count; i++) {
        if (hitFloor(pool.y[i], pool.velY[i], FLOOR_Y)) spinsAtHit.push(pool.angVel[i]);
        // A skull still on its first flight (rising, or falling before any bounce) has never touched the floor.
        else if (pool.velY[i] < 0 && pool.y[i] < 0 && pool.age[i] < 0.5 && pool.angVel[i] !== 0) airborneSpinning++;
      }
    }
    return { spinsAtHit, airborneSpinning, fx };
  }

  it('gives every skull that hits the floor a spin of 90-360 °/s in a random direction', () => {
    const { spinsAtHit } = run(120);
    expect(spinsAtHit.length).toBeGreaterThan(50);
    for (const s of spinsAtHit) {
      expect(Math.abs(s)).toBeGreaterThanOrEqual(SPIN_MIN);
      expect(Math.abs(s)).toBeLessThanOrEqual(SPIN_MAX);
    }
    const clockwise = spinsAtHit.filter((s) => s > 0).length / spinsAtHit.length;
    expect(clockwise).toBeGreaterThan(0.3);
    expect(clockwise).toBeLessThan(0.7);
    expect(new Set(spinsAtHit.map(Math.round)).size).toBeGreaterThan(spinsAtHit.length / 4); // rates vary too
  });

  it('leaves skulls that have not landed yet unspun', () => {
    expect(run(120).airborneSpinning).toBe(0);
  });

  it('turns the spin into rotation', () => {
    const { fx } = run(120);
    const { pool, count } = fx.layers[0];
    // A spinning skull with plenty of life left: slot i only changes particle if its own particle dies.
    const i = Array.from({ length: count }, (_, k) => k).find(
      (k) => pool.angVel[k] !== 0 && pool.lifetime[k] - pool.age[k] > 0.5,
    );
    if (i === undefined) throw new Error('expected a spinning skull with life left');
    const before = pool.rotation[i];
    fx.step(1 / 30);
    expect(Math.abs(pool.rotation[i] - before)).toBeGreaterThan(SPIN_MIN / 30 / 2);
  });

  it('is repeatable for a given seed', () => {
    expect(run(90, 7).spinsAtHit).toEqual(run(90, 7).spinsAtHit);
  });
});
