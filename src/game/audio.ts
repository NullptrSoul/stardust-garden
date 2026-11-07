import type { NoiseOptions, Platform, ToneOptions } from '../platform/types';
import { config } from './config';
import type { ShotKind } from './world';

/** Synthesized placeholder sounds. Each one is throttled so crowds don't stack 50 tones. */
export class Sfx {
  private readonly last = new Map<string, number>();
  private pickupStep = 0;

  constructor(private readonly platform: Platform) {}

  unlock(): void {
    this.platform.audio.unlock();
  }

  shoot(kind: ShotKind): void {
    if (kind === 'star') this.play('star', 70, { freq: 1200, slideTo: 1800, duration: 0.07, type: 'sine', volume: 0.04 });
    else if (kind === 'bubble') this.play('bubble', 90, { freq: 500, slideTo: 900, duration: 0.08, type: 'sine', volume: 0.05 });
    else this.play('fire', 120, { freq: 300, slideTo: 180, duration: 0.15, type: 'triangle', volume: 0.06 });
  }

  slash(): void {
    this.play('slash', 80, { freq: 900, slideTo: 300, duration: 0.1, type: 'sawtooth', volume: 0.03 }, { duration: 0.1, volume: 0.12, freq: 3200, q: 1.2 });
  }

  zap(): void {
    this.play('zap', 90, { freq: 1600, slideTo: 400, duration: 0.12, type: 'square', volume: 0.025 });
  }

  whoosh(): void {
    this.play('whoosh', 120, { freq: 220, slideTo: 520, duration: 0.18, type: 'triangle', volume: 0.05 });
  }

  /** A short "thwack": noise body plus a low thump. */
  hit(): void {
    this.play('hit', 35, { freq: 150, slideTo: 70, duration: 0.07, type: 'sine', volume: 0.12 }, { duration: 0.06, volume: 0.16, freq: 1500, q: 0.8 });
  }

  /** A juicy "pop" when a monster bursts. */
  kill(): void {
    this.play('kill', 45, { freq: 700, slideTo: 1400, duration: 0.1, type: 'sine', volume: 0.08 }, { duration: 0.13, volume: 0.2, freq: 650, q: 0.7 });
  }

  /** Crit: a brighter, sharper hit on top of the normal one. */
  crit(): void {
    this.play('crit', 60, { freq: 1800, slideTo: 2600, duration: 0.06, type: 'triangle', volume: 0.06 }, { duration: 0.05, volume: 0.14, freq: 4200, q: 1.5 });
  }

  /** Pickups climb in pitch while collected in quick succession. */
  pickup(): void {
    const now = this.platform.now();
    const prev = this.last.get('pickup') ?? -1e9;
    if (now - prev < 30) return;
    this.pickupStep = now - prev < 250 ? Math.min(this.pickupStep + 1, 12) : 0;
    this.last.set('pickup', now);
    if (!config.sound) return;
    this.platform.audio.tone({ freq: 880 * Math.pow(2, this.pickupStep / 12), duration: 0.06, type: 'sine', volume: 0.05 });
  }

  levelUp(): void {
    this.play('level', 300, { freq: 660, slideTo: 1320, duration: 0.3, type: 'sine', volume: 0.1 });
  }

  hurt(): void {
    this.play('hurt', 150, { freq: 220, slideTo: 90, duration: 0.25, type: 'sawtooth', volume: 0.09 }, { duration: 0.2, volume: 0.22, freq: 320, q: 0.6 });
  }

  dodge(): void {
    this.play('dodge', 150, { freq: 1400, slideTo: 2000, duration: 0.08, type: 'sine', volume: 0.05 });
  }

  /** Boss entrance: a low roar over a sub-bass drop and a dissonant growl. */
  bossAppear(): void {
    if (!this.play('boss', 1000, { freq: 110, slideTo: 45, duration: 1.1, type: 'sawtooth', volume: 0.16 }, { duration: 1, volume: 0.25, freq: 180, q: 0.5 })) return;
    const a = this.platform.audio;
    a.tone({ freq: 58, slideTo: 28, duration: 1.4, type: 'sine', volume: 0.24 });
    a.tone({ freq: 155, slideTo: 62, duration: 0.9, type: 'square', volume: 0.04 });
    a.noise({ duration: 1.3, volume: 0.18, freq: 70, q: 0.4 });
  }

  /** A heavy landing: thud, sub-bass and a burst of rubble. */
  slam(): void {
    if (!this.play('slam', 150, { freq: 120, slideTo: 35, duration: 0.45, type: 'sine', volume: 0.2 }, { duration: 0.4, volume: 0.28, freq: 240, q: 0.5 })) return;
    const a = this.platform.audio;
    a.tone({ freq: 62, slideTo: 30, duration: 0.6, type: 'sine', volume: 0.22 });
    a.noise({ duration: 0.25, volume: 0.16, freq: 1800, q: 0.7 });
  }

  /** A boss charging an attack. */
  warn(): void {
    this.play('warn', 250, { freq: 300, slideTo: 600, duration: 0.3, type: 'square', volume: 0.04 });
  }

  bossShoot(): void {
    this.play('bossShoot', 300, { freq: 400, slideTo: 200, duration: 0.2, type: 'square', volume: 0.04 });
  }

  /** Skill release: a quick rising chord. */
  skill(): void {
    if (!config.sound) return;
    const now = this.platform.now();
    const prev = this.last.get('skill');
    if (prev !== undefined && now - prev < 300) return;
    this.last.set('skill', now);
    for (const [freq, delay] of [
      [523.25, 0],
      [659.25, 0.06],
      [783.99, 0.12],
      [1046.5, 0.18],
    ] as const) {
      setTimeout(() => this.platform.audio.tone({ freq, duration: 0.35, type: 'triangle', volume: 0.08 }), delay * 1000);
    }
  }

  boom(): void {
    this.play('boom', 200, { freq: 160, slideTo: 40, duration: 0.6, type: 'sawtooth', volume: 0.14 }, { duration: 0.5, volume: 0.26, freq: 260, q: 0.5 });
  }

  waveEnd(): void {
    this.play('waveEnd', 500, { freq: 523, slideTo: 1046, duration: 0.4, type: 'sine', volume: 0.1 });
  }

  click(): void {
    this.play('click', 50, { freq: 700, duration: 0.04, type: 'sine', volume: 0.05 });
  }

  buy(): void {
    this.play('buy', 80, { freq: 988, slideTo: 1480, duration: 0.12, type: 'sine', volume: 0.08 });
  }

  error(): void {
    this.play('error', 150, { freq: 200, duration: 0.12, type: 'square', volume: 0.04 });
  }

  /** Plays unless muted or throttled; returns whether it played. */
  private play(key: string, gapMs: number, tone: ToneOptions, noise?: NoiseOptions): boolean {
    if (!config.sound) return false;
    const now = this.platform.now();
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < gapMs) return false;
    this.last.set(key, now);
    this.platform.audio.tone(tone);
    if (noise) this.platform.audio.noise(noise);
    return true;
  }
}
