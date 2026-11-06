export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Move `cur` toward `target` by at most `step`. */
export function approach(cur: number, target: number, step: number): number {
  if (cur < target) return Math.min(cur + step, target);
  return Math.max(cur - step, target);
}

/** Frame-rate independent exponential smoothing factor. */
export const smoothing = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
