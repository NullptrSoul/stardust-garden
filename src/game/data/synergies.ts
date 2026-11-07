import { STAT_ORDER, describeMods, type StatMods } from '../stats';
import { weaponById, type WeaponTag } from './weapons';

export const TAG_ORDER: WeaponTag[] = ['arcane', 'shooter', 'melee', 'element'];

export const TAG_INFO: Record<WeaponTag, { name: string; color: string }> = {
  arcane: { name: '法术', color: '#9C6BFF' },
  shooter: { name: '射击', color: '#3D8FE0' },
  melee: { name: '近战', color: '#E0567A' },
  element: { name: '元素', color: '#22A586' },
};

/** Owning `count` weapons with a tag gives `mods`. A higher tier replaces the lower one. */
export interface SetTier {
  count: number;
  mods: StatMods;
}

export const SET_TIERS: Record<WeaponTag, SetTier[]> = {
  arcane: [
    { count: 2, mods: { damage: 8 } },
    { count: 4, mods: { damage: 18, attackSpeed: 8 } },
    { count: 6, mods: { damage: 35, attackSpeed: 15 } },
  ],
  shooter: [
    { count: 2, mods: { range: 30, rangedDamage: 5 } },
    { count: 4, mods: { range: 60, rangedDamage: 15 } },
    { count: 6, mods: { range: 100, rangedDamage: 30 } },
  ],
  melee: [
    { count: 2, mods: { meleeDamage: 8, armor: 1 } },
    { count: 4, mods: { meleeDamage: 18, armor: 3 } },
    { count: 6, mods: { meleeDamage: 35, armor: 5, maxHp: 10 } },
  ],
  element: [
    { count: 2, mods: { crit: 4, attackSpeed: 4 } },
    { count: 4, mods: { crit: 8, attackSpeed: 10 } },
    { count: 6, mods: { crit: 15, attackSpeed: 18, luck: 10 } },
  ],
};

export type ClassId = 'support' | 'ranger' | 'warrior' | 'mage' | 'controller' | 'tank';

/** A character's class: every weapon with the class tag adds `perWeapon`. */
export interface ClassDef {
  name: string;
  tag: WeaponTag;
  perWeapon: StatMods;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  support: { name: '辅助', tag: 'arcane', perWeapon: { regen: 1, maxHp: 2 } },
  ranger: { name: '游侠', tag: 'element', perWeapon: { crit: 4, dodge: 2 } },
  warrior: { name: '战士', tag: 'melee', perWeapon: { meleeDamage: 8, armor: 1 } },
  mage: { name: '法师', tag: 'arcane', perWeapon: { damage: 6, attackSpeed: 3 } },
  controller: { name: '控场', tag: 'element', perWeapon: { range: 20, attackSpeed: 3 } },
  tank: { name: '坦克', tag: 'shooter', perWeapon: { armor: 1, maxHp: 3 } },
};

/** How many owned weapons carry each tag. Every weapon slot counts. */
export function countTags(weaponIds: readonly string[]): Record<WeaponTag, number> {
  const counts: Record<WeaponTag, number> = { arcane: 0, shooter: 0, melee: 0, element: 0 };
  for (const id of weaponIds) for (const tag of weaponById(id).tags) counts[tag]++;
  return counts;
}

/** Index into SET_TIERS[tag] of the active tier, or -1 below the first one. */
export function activeTier(tag: WeaponTag, count: number): number {
  let tier = -1;
  SET_TIERS[tag].forEach((t, i) => {
    if (count >= t.count) tier = i;
  });
  return tier;
}

/** The weapon count that unlocks the next tier, or null when the top tier is reached. */
export function nextThreshold(tag: WeaponTag, count: number): number | null {
  return SET_TIERS[tag].find((t) => t.count > count)?.count ?? null;
}

function addInto(into: StatMods, mods: StatMods, times = 1): void {
  for (const key of STAT_ORDER) {
    const v = mods[key];
    if (v) into[key] = (into[key] ?? 0) + v * times;
  }
}

/** All stat bonuses from set tiers plus the character's class. */
export function synergyMods(cls: ClassId, weaponIds: readonly string[]): StatMods {
  const counts = countTags(weaponIds);
  const mods: StatMods = {};
  for (const tag of TAG_ORDER) {
    const tier = activeTier(tag, counts[tag]);
    if (tier >= 0) addInto(mods, SET_TIERS[tag][tier].mods);
  }
  const c = CLASSES[cls];
  addInto(mods, c.perWeapon, counts[c.tag]);
  return mods;
}

/** "每带一把「法术」武器：+6% 伤害，+3% 攻速" */
/** Weapons that carry the character's class tag hit this much harder. */
export const CLASS_WEAPON_BONUS = 0.15;

/** True when the weapon carries the character's class tag. */
export function fitsClass(cls: ClassId, weaponId: string): boolean {
  return weaponById(weaponId).tags.includes(CLASSES[cls].tag);
}

export function describeClass(cls: ClassId): string {
  const c = CLASSES[cls];
  const tag = TAG_INFO[c.tag].name;
  return `「${tag}」武器伤害 +${Math.round(CLASS_WEAPON_BONUS * 100)}%；每带一把再加 ${describeMods(c.perWeapon).join('，')}`;
}

export type ComboId =
  | 'starfire'
  | 'galaxy'
  | 'windblade'
  | 'moonbook'
  | 'conductive'
  | 'thunderwind'
  | 'frostbow'
  | 'meteor'
  | 'superconduct'
  | 'toxicwind'
  | 'acid'
  | 'twinblade'
  | 'starbook'
  | 'guardian'
  | 'lance'
  | 'reaper';

/** Owning both weapons (any tier) unlocks a unique effect, handled in world.ts. */
export interface ComboDef {
  id: ComboId;
  name: string;
  weapons: [string, string];
  desc: string;
}

/** Every weapon is part of at least two combos. */
export const COMBOS: ComboDef[] = [
  { id: 'starfire', name: '星火', weapons: ['staff', 'tome'], desc: '星光弹命中时溅射周围敌人' },
  { id: 'galaxy', name: '泡泡星河', weapons: ['staff', 'bubble'], desc: '泡泡多 1 颗，星光弹多穿透 1 个' },
  { id: 'windblade', name: '风刃', weapons: ['crescent', 'fan'], desc: '月牙刃和清风扇范围 +20%' },
  { id: 'moonbook', name: '月下书斋', weapons: ['crescent', 'tome'], desc: '月牙刃挥砍时 30% 概率放出火球' },
  { id: 'conductive', name: '导电水泡', weapons: ['talisman', 'bubble'], desc: '泡泡命中时 25% 概率引出闪电' },
  { id: 'thunderwind', name: '风雷', weapons: ['talisman', 'fan'], desc: '清风扇每吹一次，雷符冷却减半' },
  { id: 'frostbow', name: '寒霜箭', weapons: ['bow', 'frost'], desc: '星弓的箭让敌人减速 1.5 秒' },
  { id: 'meteor', name: '流星雨', weapons: ['bow', 'staff'], desc: '星光杖和星弓攻速 +15%' },
  { id: 'superconduct', name: '超导', weapons: ['frost', 'talisman'], desc: '雷符对减速的敌人伤害翻倍' },
  { id: 'toxicwind', name: '毒雾', weapons: ['flask', 'fan'], desc: '毒池范围 +40%' },
  { id: 'acid', name: '酸泡', weapons: ['flask', 'bubble'], desc: '泡泡对中毒的敌人伤害 +50%' },
  { id: 'twinblade', name: '双锋', weapons: ['scythe', 'spear'], desc: '死神镰和长枪暴击率 +15%' },
  { id: 'starbook', name: '星火书', weapons: ['spirit', 'tome'], desc: '星灵撞到敌人时 20% 放出火球' },
  { id: 'guardian', name: '星灵守护', weapons: ['spirit', 'staff'], desc: '多 1 颗星灵' },
  { id: 'lance', name: '枪刃', weapons: ['spear', 'crescent'], desc: '长枪刺得更远，月牙刃更宽' },
  { id: 'reaper', name: '亡魂', weapons: ['scythe', 'flask'], desc: '死神镰击杀处留下毒池' },
];

export function activeCombos(weaponIds: readonly string[]): ComboDef[] {
  return COMBOS.filter((c) => weaponIds.includes(c.weapons[0]) && weaponIds.includes(c.weapons[1]));
}

/** Combos that adding this weapon would newly unlock. */
export function combosUnlockedBy(weaponIds: readonly string[], id: string): ComboDef[] {
  if (weaponIds.includes(id)) return [];
  return activeCombos([...weaponIds, id]).filter((c) => c.weapons.includes(id));
}

export function tagNames(tags: readonly WeaponTag[]): string {
  return tags.map((t) => TAG_INFO[t].name).join(' · ');
}
