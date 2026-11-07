import { describe, expect, it } from 'vitest';
import type { NoteOptions, Platform } from '../platform/types';
import { Music } from './music';

/** A fake platform whose audio clock we move by hand and whose notes we record. */
function fakePlatform() {
  const notes: NoteOptions[] = [];
  let clock = 0;
  let volume = 0.6;
  const audio = {
    unlock() {},
    tone() {},
    noise() {},
    time: () => clock,
    note: (o: NoteOptions) => notes.push(o),
    setMusicVolume: (v: number) => (volume = v),
  };
  const platform = { audio } as unknown as Platform;
  return {
    platform,
    notes,
    volume: () => volume,
    advance(seconds: number, music: Music) {
      // Step the clock like ~60 fps frames.
      for (let t = 0; t < seconds; t += 1 / 60) {
        clock += 1 / 60;
        music.update();
      }
    },
  };
}

describe('Music', () => {
  it('stays silent until the audio clock runs', () => {
    const f = fakePlatform();
    const music = new Music(f.platform);
    music.update();
    expect(f.notes).toHaveLength(0);
  });

  it('schedules notes ahead of time, never in the past', () => {
    const f = fakePlatform();
    const music = new Music(f.platform);
    f.advance(0.1, music);
    f.advance(4, music);
    // The menu theme is sparse: about 10 notes per 3.3-second bar.
    expect(f.notes.length).toBeGreaterThan(10);
    for (const n of f.notes) expect(n.duration).toBeGreaterThan(0);
  });

  it('adds a kick drum in battle and switches mood on a bar line', () => {
    const f = fakePlatform();
    const music = new Music(f.platform);
    f.advance(0.1, music);
    f.advance(3, music);
    // Menu music has no kick (the only notes that slide down).
    expect(f.notes.some((n) => n.slideTo)).toBe(false);
    music.setMood('battle');
    f.advance(8, music);
    expect(f.notes.some((n) => n.slideTo)).toBe(true);
  });

  it('mutes through the music volume', () => {
    const f = fakePlatform();
    const music = new Music(f.platform);
    music.setEnabled(false);
    expect(f.volume()).toBe(0);
    music.setEnabled(true);
    expect(f.volume()).toBeGreaterThan(0);
  });
});
