import type { StatMods } from '../stats';

/** Permanent upgrades bought with stardust between runs. Kept small on purpose. */
export interface TalentDef {
  id: string;
  name: string;
  /** What one level gives, for the card. */
  desc: string;
  mods?: StatMods;
  /** Starting shards per level. */
  shards?: number;
  max: number;
}

export const TALENTS: TalentDef[] = [
  { id: 'vitality', name: '生命', desc: '生命上限 +3', mods: { maxHp: 3 }, max: 5 },
  { id: 'power', name: '力量', desc: '伤害 +3%', mods: { damage: 3 }, max: 5 },
  { id: 'swift', name: '轻盈', desc: '移速 +3%', mods: { speed: 3 }, max: 5 },
  { id: 'fortune', name: '财运', desc: '开局星屑 +8', shards: 8, max: 5 },
  { id: 'luck', name: '好运', desc: '幸运 +5', mods: { luck: 5 }, max: 5 },
  { id: 'scholar', name: '博学', desc: '经验 +5%', mods: { xpGain: 5 }, max: 5 },
];

/** Stardust to go from `level` to `level + 1`. */
export function talentCost(level: number): number {
  return 15 + level * 15;
}

/** Total stat bonus from talent levels. */
export function talentMods(levels: Readonly<Record<string, number>>): StatMods {
  const out: StatMods = {};
  for (const t of TALENTS) {
    const n = levels[t.id] ?? 0;
    if (!n || !t.mods) continue;
    for (const [key, v] of Object.entries(t.mods) as Array<[keyof StatMods, number]>) {
      out[key] = (out[key] ?? 0) + v * n;
    }
  }
  return out;
}

export function talentShards(levels: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const t of TALENTS) total += (t.shards ?? 0) * (levels[t.id] ?? 0);
  return total;
}
