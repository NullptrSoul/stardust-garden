import { lerp } from '../engine/math';
import { config } from './config';
import { BOSS_BY_WAVE } from './data/enemies';
import type { StageDef } from './data/stages';

/** stage: one short level of a chapter. endless: keeps going until the player falls. */
export type GameMode = 'stage' | 'endless';

export const MODE_NAMES: Record<GameMode, string> = { stage: '章节冒险', endless: '无尽模式' };

/** What the wave rules need to know about a run. */
export interface WaveContext {
  wave: number;
  mode: GameMode;
  stage: StageDef | null;
}

/** Past wave 10, endless mode brings a boss back every this many waves. */
const ENDLESS_BOSS_EVERY = 5;
const ENDLESS_BOSSES = ['king', 'darkKnight', 'queen'];
/** Seconds per regular endless wave after wave 10. */
const ENDLESS_WAVE_TIME = 40;
/**
 * Past wave 10, endless monsters get this much tougher again every wave, on
 * top of the normal growth. Builds stop growing at some point, so every run
 * ends somewhere: that spread is what the leaderboard ranks.
 */
const ENDLESS_RAMP = 1.15;
/** Same idea for monster damage (contact and bullets). */
const ENDLESS_DAMAGE_RAMP = 1.12;
/** Seconds an endless boss stays before it leaves. */
const ENDLESS_BOSS_TIME = 90;
/** Endless shop prices past wave 10, per wave. */
const ENDLESS_PRICE_RAMP = 1.1;
/** Endless starts with no shards to spend, so its first bosses go easier. */
const ENDLESS_EARLY_BOSS_HP = 0.45;
/** Endless spawns speed up by this share per wave, down to half the wave-10 pace. */
const ENDLESS_SPAWN_SPEEDUP = 0.03;
const MAX_ELITE_CHANCE = 0.5;
const ELITE_RUSH_CHANCE = 0.35;

/** Bosses that open this wave; empty for a regular wave. */
export function bossesForWave(r: WaveContext): string[] {
  if (r.stage) return r.stage.bosses[r.wave] ?? [];
  if (r.wave <= config.waveCount) {
    const boss = BOSS_BY_WAVE[r.wave];
    return boss ? [boss] : [];
  }
  if (r.wave % ENDLESS_BOSS_EVERY !== 0) return [];
  const n = r.wave / ENDLESS_BOSS_EVERY - Math.floor(config.waveCount / ENDLESS_BOSS_EVERY) - 1;
  return [ENDLESS_BOSSES[n % ENDLESS_BOSSES.length]];
}

/** Seconds the wave lasts; 0 means it lasts until every boss is down. */
export function waveDuration(r: WaveContext): number {
  if (bossesForWave(r).length > 0) return 0;
  if (r.stage) return r.stage.waveTime[r.wave - 1] || 30;
  if (r.wave <= config.waveCount) return config.waveDurations[r.wave - 1] || 30;
  return ENDLESS_WAVE_TIME;
}

/**
 * Seconds before an unbeaten boss leaves, or 0 for no limit. Only endless has
 * one: deep in, a boss can outlast any build, and kiting it forever is no fun.
 */
export function bossTimeLimit(r: WaveContext): number {
  return r.mode === 'endless' ? ENDLESS_BOSS_TIME : 0;
}

/** Clearing this wave wins the run. Endless mode has no final wave. */
export function isFinalWave(r: WaveContext): boolean {
  return r.stage !== null && r.wave >= r.stage.waves;
}

export function isEliteRush(r: WaveContext): boolean {
  return r.stage !== null && r.stage.eliteRush === r.wave;
}

/**
 * Share of a stage's level that applies on waves 1–4 (full from wave 5).
 * A fresh build can't take a late stage at full strength right away.
 */
const LEVEL_RAMP = [0.35, 0.55, 0.75, 0.9];

/** The wave number monster strength follows; later stages start further along. */
export function difficultyWave(r: WaveContext): number {
  const level = r.stage?.level ?? 0;
  return r.wave + level * (LEVEL_RAMP[r.wave - 1] ?? 1);
}

/** Monster HP growth at a difficulty wave (1 at wave 1). */
function hpCurve(wave: number): number {
  const n = Math.max(0, wave - 1);
  return 1 + config.enemyHpGrowth * n + config.enemyHpQuad * n * n;
}

/** Endless mode's extra toughness past wave 10 (1 before that, and in stages). */
function endlessRamp(r: WaveContext): number {
  if (r.mode !== 'endless') return 1;
  return ENDLESS_RAMP ** Math.max(0, r.wave - config.waveCount);
}

/**
 * Shop price multiplier. Endless prices also climb with the monster ramp past
 * wave 10, so late-game shards can't buy unlimited stacks of items.
 */
export function priceScale(r: WaveContext): number {
  const ramp = r.mode === 'endless' ? ENDLESS_PRICE_RAMP ** Math.max(0, r.wave - config.waveCount) : 1;
  return (1 + config.priceGrowth * (r.wave - 1)) * ramp;
}

/** A monster's hit (contact or bullet) on this wave, from its wave-1 value. */
export function enemyDamage(r: WaveContext, base: number): number {
  const bonus = Math.floor((difficultyWave(r) - 1) / config.enemyDamageEvery);
  const ramp = r.mode === 'endless' ? ENDLESS_DAMAGE_RAMP ** Math.max(0, r.wave - config.waveCount) : 1;
  return Math.round((base + bonus) * ramp);
}

/** HP multiplier for regular monsters. */
export function enemyHpScale(r: WaveContext): number {
  return hpCurve(difficultyWave(r)) * endlessRamp(r);
}

/**
 * HP multiplier for a boss whose base HP is tuned for `homeWave`. Met later
 * (a harder stage, deep in endless) it grows like everything else.
 */
export function bossHpScale(r: WaveContext, homeWave: number): number {
  let scale = hpCurve(difficultyWave(r)) / hpCurve(homeWave);
  if (r.stage) {
    // Hand-tuned per stage and wave: a last boss meets the strongest build.
    scale *= r.stage.bossHp?.[r.wave] ?? 1;
  } else if (r.mode === 'endless' && r.wave <= config.waveCount) {
    scale *= ENDLESS_EARLY_BOSS_HP;
  }
  return scale * endlessRamp(r);
}

/** Seconds between spawn groups. */
export function spawnInterval(r: WaveContext, bossWave: boolean): number {
  const wave = difficultyWave(r);
  const t = Math.min(1, (wave - 1) / Math.max(1, config.waveCount - 1));
  let interval = lerp(config.spawnIntervalFirst, config.spawnIntervalLast, t);
  if (r.mode === 'endless' && r.wave > config.waveCount) {
    interval *= Math.max(0.5, 1 - ENDLESS_SPAWN_SPEEDUP * (r.wave - config.waveCount));
  }
  return interval * (bossWave ? 1.8 : 1);
}

export function eliteChance(r: WaveContext): number {
  if (isEliteRush(r)) return ELITE_RUSH_CHANCE;
  const wave = difficultyWave(r);
  if (wave < config.eliteFirstWave) return 0;
  return Math.min(MAX_ELITE_CHANCE, config.eliteChance + config.eliteChancePerWave * (wave - config.eliteFirstWave));
}
