import { clamp } from '../engine/math';

export type StatKey =
  | 'maxHp'
  | 'regen'
  | 'damage'
  | 'meleeDamage'
  | 'rangedDamage'
  | 'attackSpeed'
  | 'crit'
  | 'range'
  | 'armor'
  | 'dodge'
  | 'speed'
  | 'pickup'
  | 'luck'
  | 'xpGain';

export type Stats = Record<StatKey, number>;
export type StatMods = Partial<Stats>;

export const BASE_STATS: Stats = {
  maxHp: 20,
  regen: 0,
  damage: 0,
  meleeDamage: 0,
  rangedDamage: 0,
  attackSpeed: 0,
  crit: 5,
  range: 0,
  armor: 0,
  dodge: 0,
  speed: 0,
  pickup: 0,
  luck: 0,
  xpGain: 0,
};

export const STAT_ORDER: StatKey[] = [
  'maxHp',
  'regen',
  'damage',
  'meleeDamage',
  'rangedDamage',
  'attackSpeed',
  'crit',
  'range',
  'armor',
  'dodge',
  'speed',
  'pickup',
  'luck',
  'xpGain',
];

export const STAT_INFO: Record<StatKey, { name: string; percent: boolean }> = {
  maxHp: { name: '生命上限', percent: false },
  regen: { name: '生命回复', percent: false },
  damage: { name: '伤害', percent: true },
  meleeDamage: { name: '近战伤害', percent: true },
  rangedDamage: { name: '远程伤害', percent: true },
  attackSpeed: { name: '攻速', percent: true },
  crit: { name: '暴击', percent: true },
  range: { name: '范围', percent: false },
  armor: { name: '护甲', percent: false },
  dodge: { name: '闪避', percent: true },
  speed: { name: '移速', percent: true },
  pickup: { name: '拾取范围', percent: false },
  luck: { name: '幸运', percent: false },
  xpGain: { name: '经验', percent: true },
};

export const MAX_DODGE = 60;

export function addMods(stats: Stats, mods: StatMods): void {
  for (const key of STAT_ORDER) {
    const v = mods[key];
    if (v) stats[key] += v;
  }
}

/** "+8% 伤害", "-3 生命上限" */
export function formatMod(key: StatKey, value: number): string {
  const info = STAT_INFO[key];
  return `${value > 0 ? '+' : ''}${value}${info.percent ? '%' : ''} ${info.name}`;
}

export function describeMods(mods: StatMods): string[] {
  const lines: string[] = [];
  for (const key of STAT_ORDER) {
    const v = mods[key];
    if (v) lines.push(formatMod(key, v));
  }
  return lines;
}

export function damageMultiplier(s: Stats, weaponClass: 'melee' | 'ranged'): number {
  const bonus = s.damage + (weaponClass === 'melee' ? s.meleeDamage : s.rangedDamage);
  return Math.max(0.1, 1 + bonus / 100);
}

export function cooldownMultiplier(s: Stats): number {
  return 1 / Math.max(0.25, 1 + s.attackSpeed / 100);
}

export function speedMultiplier(s: Stats): number {
  return Math.max(0.3, 1 + s.speed / 100);
}

/** Damage the player actually takes; armor reduces it, never below 1. */
export function damageTaken(raw: number, armor: number): number {
  const factor = armor >= 0 ? 10 / (10 + armor) : 1 + -armor / 10;
  return Math.max(1, Math.round(raw * factor));
}

export function dodgeChance(s: Stats): number {
  return clamp(s.dodge, 0, MAX_DODGE) / 100;
}

export function critChance(s: Stats): number {
  return clamp(s.crit, 0, 100) / 100;
}
