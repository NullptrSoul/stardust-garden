import type { PlatformStorage } from '../platform/types';
import { config } from './config';
import { ALL_STAGES } from './data/stages';
import { starCount } from './data/stages';
import { TALENTS, talentCost } from './data/talents';

/**
 * Progress on this device. No account needed: it lives in local storage
 * (localStorage on the web, wx storage on WeChat later).
 */
export interface EndlessRecord {
  /** Furthest wave reached. */
  bestWave: number;
  /** Kills in that best run, the tie-breaker. */
  bestKills: number;
  /** Character id of the best run. */
  character: string;
  runs: number;
}

/** Player options, kept with the save. */
export interface Settings {
  sound: boolean;
  music: boolean;
  shake: boolean;
  hitStop: boolean;
  screenFlash: boolean;
}

export const SETTING_KEYS: Array<keyof Settings> = ['sound', 'music', 'shake', 'hitStop', 'screenFlash'];

export interface SaveData {
  endless: EndlessRecord;
  /** Star bits per stage id (see STAR_* in data/stages). */
  stars: Record<string, number>;
  stardust: number;
  /** Talent levels by talent id. */
  talents: Record<string, number>;
  settings: Settings;
  /** One-time tips already shown (the tutorial). */
  tips: string[];
}

const KEY = 'stardust-garden.save.v1';

export function emptySave(): SaveData {
  return {
    endless: { bestWave: 0, bestKills: 0, character: '', runs: 0 },
    stars: {},
    stardust: 0,
    talents: {},
    settings: { sound: true, music: true, shake: true, hitStop: true, screenFlash: true },
    tips: [],
  };
}

export function loadSave(storage: PlatformStorage): SaveData {
  const save = emptySave();
  try {
    const raw = storage.get(KEY);
    if (!raw) return save;
    const data = JSON.parse(raw) as Partial<SaveData>;
    const e = data.endless;
    if (e) {
      save.endless.bestWave = num(e.bestWave);
      save.endless.bestKills = num(e.bestKills);
      save.endless.character = typeof e.character === 'string' ? e.character : '';
      save.endless.runs = num(e.runs);
    }
    for (const s of ALL_STAGES) {
      const bits = num(data.stars?.[s.id]) & 7;
      if (bits) save.stars[s.id] = bits;
    }
    save.stardust = num(data.stardust);
    for (const t of TALENTS) {
      const level = Math.min(t.max, num(data.talents?.[t.id]));
      if (level) save.talents[t.id] = level;
    }
    for (const key of SETTING_KEYS) {
      const v = data.settings?.[key];
      if (typeof v === 'boolean') save.settings[key] = v;
    }
    if (Array.isArray(data.tips)) save.tips = data.tips.filter((x): x is string => typeof x === 'string');
  } catch {
    // Corrupt save: start fresh rather than crash.
  }
  return save;
}

/** Copies the saved options into the live config. */
export function applySettings(s: Settings): void {
  for (const key of SETTING_KEYS) config[key] = s[key];
}

/** Wipes progress (stars, stardust, talents, records, tips) but keeps the options. */
export function resetProgress(save: SaveData): void {
  const settings = save.settings;
  Object.assign(save, emptySave(), { settings });
}

export function writeSave(storage: PlatformStorage, save: SaveData): void {
  storage.set(KEY, JSON.stringify(save));
}

/**
 * Updates the endless record. `firstTime` is false when the same run ends
 * again after a revive, so it isn't counted twice. Returns true on a new best.
 */
export function submitEndless(
  save: SaveData,
  result: { wave: number; kills: number; character: string },
  firstTime: boolean,
): boolean {
  const r = save.endless;
  if (firstTime) r.runs++;
  const better = result.wave > r.bestWave || (result.wave === r.bestWave && result.kills > r.bestKills);
  if (better) {
    r.bestWave = result.wave;
    r.bestKills = result.kills;
    r.character = result.character;
  }
  return better;
}

/** Adds earned star bits to a stage; returns how many stars are new. */
export function awardStars(save: SaveData, stageId: string, bits: number): number {
  const before = save.stars[stageId] ?? 0;
  const after = before | bits;
  save.stars[stageId] = after;
  return starCount(after) - starCount(before);
}

export function totalStars(save: SaveData): number {
  return ALL_STAGES.reduce((n, s) => n + starCount(save.stars[s.id] ?? 0), 0);
}

/** Stardust earned by a finished run, win or lose. */
export function stardustFor(result: { wavesCleared: number; cleared: boolean; newStars: number; stageIndex: number }): number {
  const clearBonus = result.cleared ? 10 + 5 * result.stageIndex : 0;
  return result.wavesCleared * 2 + clearBonus + result.newStars * 5;
}

export function buyTalent(save: SaveData, talentId: string): 'ok' | 'max' | 'poor' {
  const t = TALENTS.find((x) => x.id === talentId);
  if (!t) return 'max';
  const level = save.talents[t.id] ?? 0;
  if (level >= t.max) return 'max';
  const cost = talentCost(level);
  if (save.stardust < cost) return 'poor';
  save.stardust -= cost;
  save.talents[t.id] = level + 1;
  return 'ok';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}
