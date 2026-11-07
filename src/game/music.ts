import type { Platform, Waveform } from '../platform/types';

/**
 * Background music, synthesized live (no audio files, so no licensing issues).
 * A 16-step sequencer schedules notes a little ahead on the audio clock.
 * Moods switch on the next bar so the music never cuts off mid-phrase.
 */
export type MusicMood = 'menu' | 'battle' | 'boss';

interface MoodDef {
  bpm: number;
  /** Chords as MIDI note numbers, one chord per `barsPerChord` bars. */
  chords: number[][];
  barsPerChord: number;
  bass: number[];
  kick: number[];
  /** Steps (out of 16) that play an arpeggio note. */
  arp: number[];
  arpType: Waveform;
  arpVolume: number;
  /** Chance per bar of a soft melody line. */
  melody: number;
}

const MOODS: Record<MusicMood, MoodDef> = {
  // A minor, slow and airy: Am - F - C - G
  menu: {
    bpm: 72,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    barsPerChord: 2,
    bass: [],
    kick: [],
    arp: [0, 6, 8, 14],
    arpType: 'triangle',
    arpVolume: 0.022,
    melody: 0.6,
  },
  // A minor with a dark E major turn: Am - F - Dm - E
  battle: {
    bpm: 96,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [50, 53, 57],
      [52, 56, 59],
    ],
    barsPerChord: 1,
    bass: [0, 6, 8, 14],
    kick: [0, 8],
    arp: [0, 2, 4, 6, 8, 10, 12, 14],
    arpType: 'triangle',
    arpVolume: 0.024,
    melody: 0.4,
  },
  // D minor, driving: Dm - Bb - Gm - A
  boss: {
    bpm: 118,
    chords: [
      [50, 53, 57],
      [46, 50, 53],
      [43, 46, 50],
      [45, 49, 52],
    ],
    barsPerChord: 1,
    bass: [0, 3, 6, 8, 11, 14],
    kick: [0, 4, 8, 12],
    arp: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    arpType: 'square',
    arpVolume: 0.012,
    melody: 0,
  },
};

const LOOKAHEAD = 0.25;

function mtof(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export class Music {
  private mood: MusicMood = 'menu';
  private next: MusicMood = 'menu';
  private step = 0;
  private bar = 0;
  /** Audio-clock time of the next step; 0 until audio starts. */
  private at = 0;
  private enabled = true;
  private seed = 1;

  constructor(private readonly platform: Platform) {}

  /** Asks for a mood; it takes over at the start of the next bar. */
  setMood(mood: MusicMood): void {
    this.next = mood;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.platform.audio.setMusicVolume(on ? 0.6 : 0);
  }

  update(): void {
    const audio = this.platform.audio;
    const now = audio.time();
    if (now <= 0) return;
    // First run, or catching up after the tab slept: restart the clock.
    if (this.at < now - 0.5) this.at = now + 0.05;
    while (this.at < now + LOOKAHEAD) {
      this.playStep(this.at);
      this.at += 60 / MOODS[this.mood].bpm / 4;
      this.step++;
      if (this.step === 16) {
        this.step = 0;
        this.bar++;
        if (this.next !== this.mood) {
          this.mood = this.next;
          this.bar = 0;
        }
      }
    }
  }

  private playStep(t: number): void {
    if (!this.enabled) return;
    const audio = this.platform.audio;
    const m = MOODS[this.mood];
    const stepDur = 60 / m.bpm / 4;
    const chord = m.chords[Math.floor(this.bar / m.barsPerChord) % m.chords.length];
    const root = chord[0];

    // Pad: a soft chord held for the whole bar, plus a darker layer an octave down.
    if (this.step === 0) {
      const len = stepDur * 16 * 1.02;
      for (const n of chord) {
        audio.note({ freq: mtof(n), at: t, duration: len, type: 'triangle', volume: 0.022, attack: 0.35, release: 0.5, cutoff: 1400 });
      }
      audio.note({ freq: mtof(root - 12), at: t, duration: len, type: 'sawtooth', volume: 0.014, attack: 0.5, release: 0.6, cutoff: 500 });
    }
    if (m.bass.includes(this.step)) {
      audio.note({ freq: mtof(root - 24), at: t, duration: stepDur * 1.8, type: 'triangle', volume: 0.07, attack: 0.005, release: 0.12, cutoff: 700 });
    }
    if (m.kick.includes(this.step)) {
      audio.note({ freq: 120, slideTo: 42, at: t, duration: 0.16, type: 'sine', volume: 0.1, attack: 0.002, release: 0.12 });
    }
    if (m.arp.includes(this.step)) {
      const i = m.arp.indexOf(this.step);
      const note = chord[i % chord.length] + 12 + (this.rand() < 0.15 ? 12 : 0);
      audio.note({
        freq: mtof(note),
        at: t,
        duration: stepDur * (this.mood === 'boss' ? 0.8 : 1.6),
        type: m.arpType,
        volume: m.arpVolume,
        attack: 0.004,
        release: stepDur * 0.6,
        cutoff: this.mood === 'boss' ? 1800 : 2800,
      });
    }
    // An occasional slow melody note from the chord, an octave up.
    if (m.melody > 0 && (this.step === 4 || this.step === 12) && this.rand() < m.melody) {
      const note = chord[Math.floor(this.rand() * chord.length)] + 24;
      audio.note({ freq: mtof(note), at: t, duration: stepDur * 6, type: 'sine', volume: 0.028, attack: 0.08, release: stepDur * 3 });
    }
  }

  /** Small deterministic random, so the music doesn't use the game's RNG. */
  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
}
