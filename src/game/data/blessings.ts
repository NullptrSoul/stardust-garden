import type { StatMods } from '../stats';

/**
 * Abyss blessings: endless mode only. Beating a boss from wave 10 on offers
 * three; the player keeps one. They let a build keep growing late in a run,
 * when levels come slowly and shop prices have climbed.
 */
export type BlessingId = 'might' | 'resonance' | 'vigor' | 'bulwark' | 'gale' | 'harvest' | 'freeze' | 'bloodpact';

export interface BlessingDef {
  id: BlessingId;
  name: string;
  icon: string;
  /** What it does, in one short line. */
  desc: string;
  /** Plain stat bonuses; the rest is handled where the effect happens. */
  mods?: StatMods;
  /** Can only be taken once per run. */
  once?: boolean;
}

/** Extra damage for class-fitting weapons per resonance blessing (on top of CLASS_WEAPON_BONUS). */
export const RESONANCE_BONUS = 0.15;
/** Extra shards per harvest blessing. */
export const HARVEST_BONUS = 0.3;
/** Chance per kill to heal 1, per blood pact blessing. */
export const BLOODPACT_CHANCE = 0.05;

export const BLESSINGS: BlessingDef[] = [
  { id: 'might', name: '深渊之力', icon: '💥', desc: '伤害 +15%', mods: { damage: 15 } },
  { id: 'resonance', name: '契合共鸣', icon: '✨', desc: '契合武器的伤害再 +15%' },
  { id: 'vigor', name: '不灭之心', icon: '❤️', desc: '生命上限 +15，生命回复 +2', mods: { maxHp: 15, regen: 2 } },
  { id: 'bulwark', name: '深渊铁壁', icon: '🛡️', desc: '护甲 +4', mods: { armor: 4 } },
  { id: 'gale', name: '疾风', icon: '🌀', desc: '移速 +8%，攻速 +10%', mods: { speed: 8, attackSpeed: 10 } },
  { id: 'harvest', name: '星屑丰收', icon: '💎', desc: '捡到的星屑 +30%' },
  { id: 'freeze', name: '物价冻结', icon: '🧊', desc: '此后商店价格不再上涨（限一次）', once: true },
  { id: 'bloodpact', name: '鲜血契约', icon: '🩸', desc: '击杀时 5% 概率回复 1 生命' },
];

export function blessingById(id: string): BlessingDef {
  const b = BLESSINGS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown blessing: ${id}`);
  return b;
}
