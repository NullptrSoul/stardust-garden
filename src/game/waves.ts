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
  /** Seconds of battle so far this run (endless uses it for the tide). */
  playTime?: number;
  /** Endless prices stop climbing after this wave (a blessing), or null. */
  priceFreezeWave?: number | null;
}

/** Past wave 10, endless mode brings a boss back every this many waves. */
const ENDLESS_BOSS_EVERY = 5;
const ENDLESS_BOSSES = ['king', 'darkKnight', 'queen'];
/** Seconds per regular endless wave after wave 10, and after ENDLESS_LATE_WAVE. */
const ENDLESS_WAVE_TIME = 30;
const ENDLESS_LATE_WAVE_TIME = 25;
const ENDLESS_LATE_WAVE = 30;
/**
 * Endless monster HP past wave 10, on top of the normal growth: one step at
 * wave 11, a fast ramp while builds still grow fast, then a slow one.
 *
 * Measured with the sim's power report (2026-11-07): builds grow ~20% a
 * wave up to wave 20 but only ~7% after (levels slow down, prices climb).
 * With a flat 1.15 the monsters kept growing ~22% a wave, so clearing a pack
 * went from 1.4 s at wave 20 to 4-6 s past wave 30 and playtesters said the
 * monsters became unkillable. Now HP roughly keeps pace with the build after
 * wave 20, and runs end on monster damage and numbers instead.
 */
const ENDLESS_HP_STEP = 1.6;
const ENDLESS_RAMP = 1.15;
/** Waves past 10 that use the fast ramp; after that the slow one. */
const ENDLESS_FAST_WAVES = 10;
const ENDLESS_SLOW_RAMP = 1.05;
/**
 * Same idea for monster damage (contact and bullets). Past wave 20 it slows
 * down, so dodging and a good build can hold out for a while: that spread is
 * what the leaderboard ranks. The tide below still ends every run.
 */
const ENDLESS_DAMAGE_STEP = 1.3;
const ENDLESS_DAMAGE_RAMP = 1.12;
const ENDLESS_LATE_DAMAGE_RAMP = 1.06;
const ENDLESS_LATE_DAMAGE_WAVE = 20;
/** Seconds an endless boss stays before it leaves. */
const ENDLESS_BOSS_TIME = 60;
/** Endless shop prices past wave 10, per wave. */
const ENDLESS_PRICE_RAMP = 1.1;
/**
 * The abyss tide: after this many seconds of endless battle, monster HP and
 * damage double every TIDE_DOUBLING seconds. It caps a run at about 30
 * minutes however strong the build is; how many waves a player fits in
 * before that is what the leaderboard ranks.
 */
export const TIDE_START = 25 * 60;
const TIDE_DOUBLING = 90;
/** Endless starts with no shards to spend, so its first bosses go easier. */
const ENDLESS_EARLY_BOSS_HP = 0.45;
/** Endless spawns jump to this share of the wave-10 pace at wave 11... */
const ENDLESS_SPAWN_STEP = 0.85;
/** ...then speed up by this share per wave, down to half the wave-10 pace. */
const ENDLESS_SPAWN_SPEEDUP = 0.025;
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
  return r.wave > ENDLESS_LATE_WAVE ? ENDLESS_LATE_WAVE_TIME : ENDLESS_WAVE_TIME;
}

/**
 * Endless only: how much stronger the abyss tide makes monsters right now
 * (1 before it starts).
 */
export function tideScale(r: WaveContext): number {
  const over = (r.playTime ?? 0) - TIDE_START;
  if (r.mode !== 'endless' || over <= 0) return 1;
  return 2 ** (over / TIDE_DOUBLING);
}

/**
 * Endless only: a boss beaten from wave 10 on grants an abyss blessing (one
 * of three to choose). A boss that runs out of time and leaves grants none.
 */
export function isBlessingWave(r: WaveContext): boolean {
  return r.mode === 'endless' && r.wave >= config.waveCount && bossesForWave(r).length > 0;
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
  const past = r.wave - config.waveCount;
  if (r.mode !== 'endless' || past <= 0) return 1;
  const fast = Math.min(past - 1, ENDLESS_FAST_WAVES - 1);
  const slow = Math.max(0, past - ENDLESS_FAST_WAVES);
  return ENDLESS_HP_STEP * ENDLESS_RAMP ** fast * ENDLESS_SLOW_RAMP ** slow;
}

/**
 * Shop price multiplier. Endless prices also climb with the monster ramp past
 * wave 10, so late-game shards can't buy unlimited stacks of items.
 */
export function priceScale(r: WaveContext): number {
  // The price-freeze blessing stops prices where they were.
  const wave = r.priceFreezeWave ? Math.min(r.wave, r.priceFreezeWave) : r.wave;
  const ramp = r.mode === 'endless' ? ENDLESS_PRICE_RAMP ** Math.max(0, wave - config.waveCount) : 1;
  return (1 + config.priceGrowth * (wave - 1)) * ramp;
}

/** A monster's hit (contact or bullet) on this wave, from its wave-1 value. */
export function enemyDamage(r: WaveContext, base: number): number {
  const bonus = Math.floor((difficultyWave(r) - 1) / config.enemyDamageEvery);
  const past = r.wave - config.waveCount;
  let ramp = 1;
  if (r.mode === 'endless' && past > 0) {
    const fast = Math.min(past - 1, ENDLESS_LATE_DAMAGE_WAVE - config.waveCount - 1);
    const slow = Math.max(0, r.wave - ENDLESS_LATE_DAMAGE_WAVE);
    ramp = ENDLESS_DAMAGE_STEP * ENDLESS_DAMAGE_RAMP ** fast * ENDLESS_LATE_DAMAGE_RAMP ** slow;
  }
  return Math.round((base + bonus) * ramp * tideScale(r));
}

/** HP multiplier for regular monsters. */
export function enemyHpScale(r: WaveContext): number {
  return hpCurve(difficultyWave(r)) * endlessRamp(r) * tideScale(r);
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
  return scale * endlessRamp(r) * tideScale(r);
}

/** Seconds between spawn groups. */
export function spawnInterval(r: WaveContext, bossWave: boolean): number {
  const wave = difficultyWave(r);
  const t = Math.min(1, (wave - 1) / Math.max(1, config.waveCount - 1));
  let interval = lerp(config.spawnIntervalFirst, config.spawnIntervalLast, t);
  if (r.mode === 'endless' && r.wave > config.waveCount) {
    interval *= Math.max(0.5, ENDLESS_SPAWN_STEP - ENDLESS_SPAWN_SPEEDUP * (r.wave - config.waveCount - 1));
  }
  return interval * (bossWave ? 1.8 : 1);
}

export function eliteChance(r: WaveContext): number {
  if (isEliteRush(r)) return ELITE_RUSH_CHANCE;
  const wave = difficultyWave(r);
  if (wave < config.eliteFirstWave) return 0;
  return Math.min(MAX_ELITE_CHANCE, config.eliteChance + config.eliteChancePerWave * (wave - config.eliteFirstWave));
}
