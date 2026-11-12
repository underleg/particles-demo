import { MAX_DT, type Effect } from '@particlr/runtime';

// Emitter x offset at time t: a sine wave of the given period and amplitude, starting at the centre moving right.
export function swayX(seconds: number, amplitude: number, periodSeconds: number): number {
  return amplitude * Math.sin((2 * Math.PI * seconds) / periodSeconds);
}

// Moves an effect's emitter back and forth along x, keeping y at 0. Keeps its own clock rather than reading
// Effect.time, which wraps at the effect's (3 s) duration and would put a jump in a 2 s wave.
export class EmitterSway {
  amplitude = 0; // px either side of centre; set by the host from the screen width
  private seconds = 0;

  constructor(private readonly periodSeconds: number) {}

  // Call after each effect.step(seconds) with the same seconds: it sets where the emitter will be at the end of the
  // next step, and Particlr spreads that step's births along the move, so the stream stays continuous.
  advance(fx: Effect, seconds: number): void {
    this.seconds += Math.min(seconds, MAX_DT); // Particlr clamps each step to MAX_DT; keep the wave in step with it
    fx.setEmitterPosition(swayX(this.seconds, this.amplitude, this.periodSeconds), 0);
  }
}
