import type { StatKey } from '../stats';

/** Level-up stat cards; values are per rarity (common, rare, epic, legendary). */
export const LEVEL_UPGRADES: { key: StatKey; values: [number, number, number, number] }[] = [
  { key: 'maxHp', values: [3, 6, 9, 12] },
  { key: 'regen', values: [1, 2, 3, 4] },
  { key: 'damage', values: [5, 8, 12, 16] },
  { key: 'meleeDamage', values: [8, 12, 18, 24] },
  { key: 'rangedDamage', values: [8, 12, 18, 24] },
  { key: 'attackSpeed', values: [5, 10, 15, 20] },
  { key: 'crit', values: [3, 5, 7, 9] },
  { key: 'range', values: [20, 40, 60, 80] },
  { key: 'armor', values: [1, 2, 3, 4] },
  { key: 'dodge', values: [3, 6, 9, 12] },
  { key: 'speed', values: [3, 6, 9, 12] },
  { key: 'pickup', values: [30, 50, 70, 90] },
  { key: 'luck', values: [5, 10, 15, 20] },
];

export const RARITY_NAMES = ['普通', '稀有', '史诗', '传说'];
export const RARITY_COLORS = ['#B9B3D9', '#7FB8FF', '#B48CFF', '#FFB938'];

/**
 * Chance of each rarity for a wave and luck value. Later waves and more luck
 * shift weight from common toward legendary.
 */
export function rarityWeights(wave: number, luck: number): [number, number, number, number] {
  const boost = Math.max(0, (wave - 1) * 0.04 + luck * 0.004);
  const rare = Math.min(0.45, 0.12 + boost);
  const epic = Math.min(0.3, 0.02 + boost * 0.6);
  const legendary = Math.min(0.15, Math.max(0, boost * 0.25 - 0.02));
  return [Math.max(0, 1 - rare - epic - legendary), rare, epic, legendary];
}

export function rollRarity(r: number, wave: number, luck: number): number {
  const w = rarityWeights(wave, luck);
  let acc = 0;
  for (let i = w.length - 1; i >= 0; i--) {
    acc += w[i];
    if (r < acc) return i;
  }
  return 0;
}
