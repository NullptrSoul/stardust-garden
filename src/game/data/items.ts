import type { StatMods } from '../stats';

/**
 * Effects plain stat mods can't express; world.ts / run.ts handle each one.
 * fang: kills sometimes heal. thornring: getting hit hurts nearby monsters.
 * hourglass: waves start with extra skill energy. piggy: interest on shards
 * at the end of each wave. feather: survive one lethal hit (used up).
 * orb: a lightning bolt strikes the nearest monster every few seconds.
 */
export type ItemEffect = 'fang' | 'thornring' | 'hourglass' | 'piggy' | 'feather' | 'orb';

export interface ItemDef {
  id: string;
  name: string;
  /** Placeholder icon until item art exists. */
  icon: string;
  mods: StatMods;
  price: number;
  effect?: ItemEffect;
  /** One line describing the effect, for the shop card. Stacks with more copies. */
  note?: string;
  /** Most copies one run can hold; at the cap it stops showing up in shops and chests. */
  max?: number;
}

/** Most items carry a cost, so buying is a trade-off rather than a free upgrade. */
export const ITEMS: ItemDef[] = [
  { id: 'candy', name: '星星糖', icon: '🍬', mods: { damage: 8 }, price: 20 },
  { id: 'hairpin', name: '魔力发卡', icon: '🎀', mods: { attackSpeed: 10, damage: -3 }, price: 22 },
  { id: 'pillow', name: '软绵绵抱枕', icon: '🧸', mods: { maxHp: 5, speed: -3 }, price: 18 },
  { id: 'bell', name: '猫铃铛', icon: '🔔', mods: { dodge: 6 }, price: 20 },
  { id: 'lace', name: '蕾丝护甲', icon: '🛡️', mods: { armor: 2, speed: -2 }, price: 20 },
  { id: 'scope', name: '望远镜', icon: '🔭', mods: { range: 40 }, price: 18 },
  { id: 'clover', name: '四叶草', icon: '🍀', mods: { luck: 10 }, price: 16 },
  { id: 'ribbon', name: '疾风缎带', icon: '🎐', mods: { speed: 10 }, price: 20 },
  { id: 'magnet', name: '小磁铁', icon: '🧲', mods: { pickup: 60 }, price: 14 },
  { id: 'potion', name: '回复药水', icon: '🧪', mods: { regen: 2 }, price: 20 },
  { id: 'bookmark', name: '金色书签', icon: '🔖', mods: { crit: 8 }, price: 22 },
  { id: 'gloves', name: '力量手套', icon: '🥊', mods: { meleeDamage: 15, rangedDamage: -5 }, price: 20 },
  { id: 'glasses', name: '圆框眼镜', icon: '👓', mods: { rangedDamage: 15, meleeDamage: -5 }, price: 20 },
  { id: 'cake', name: '草莓蛋糕', icon: '🍰', mods: { maxHp: 8, regen: 1, speed: -5 }, price: 24 },
  { id: 'notebook', name: '学习笔记', icon: '📒', mods: { xpGain: 20 }, price: 16 },
  { id: 'wand', name: '见习魔杖', icon: '🪄', mods: { damage: 5, attackSpeed: 5 }, price: 26 },
  { id: 'boots', name: '旅行长靴', icon: '👢', mods: { speed: 8, dodge: 3 }, price: 22 },
  { id: 'helmet', name: '铁头盔', icon: '⛑️', mods: { armor: 3, speed: -3 }, price: 22 },
  { id: 'apple', name: '金苹果', icon: '🍎', mods: { maxHp: 12, regen: -1 }, price: 22 },
  { id: 'dice', name: '赌徒骰子', icon: '🎲', mods: { crit: 12, damage: -3 }, price: 22 },
  { id: 'quiver', name: '箭袋', icon: '🏹', mods: { rangedDamage: 10, range: 20 }, price: 22 },
  { id: 'whetstone', name: '磨刀石', icon: '🪨', mods: { meleeDamage: 10, crit: 3 }, price: 22 },
  { id: 'tea', name: '午后红茶', icon: '🍵', mods: { regen: 3, attackSpeed: -3 }, price: 20 },
  { id: 'crystal', name: '星屑水晶', icon: '💎', mods: { xpGain: 10, pickup: 30, luck: 5 }, price: 24 },
  { id: 'fang', name: '吸血獠牙', icon: '🦷', mods: {}, price: 26, effect: 'fang', note: '击杀 10% 概率回 1 生命，最多 5 个', max: 5 },
  { id: 'thornring', name: '荆棘指环', icon: '💍', mods: { armor: 1 }, price: 24, effect: 'thornring', note: '受伤时反击周围 10 伤害，最多 3 个', max: 3 },
  { id: 'hourglass', name: '星之沙漏', icon: '⏳', mods: {}, price: 24, effect: 'hourglass', note: '每波开始技能能量 +25，最多 2 个', max: 2 },
  { id: 'piggy', name: '存钱罐', icon: '🐷', mods: {}, price: 20, effect: 'piggy', note: '每波结束得 8% 星屑利息，最多 4 个', max: 4 },
  { id: 'feather', name: '凤凰羽毛', icon: '🪶', mods: {}, price: 30, effect: 'feather', note: '致命伤时复活一次并用掉，最多 1 根', max: 1 },
  { id: 'orb', name: '静电球', icon: '🔮', mods: {}, price: 28, effect: 'orb', note: '每 6 秒电击敌人 15 伤害，最多 3 个', max: 3 },
];

/** Owning at least one of every item in a set adds its bonus once. */
export interface ItemSet {
  id: string;
  name: string;
  items: string[];
  mods: StatMods;
}

export const ITEM_SETS: ItemSet[] = [
  { id: 'teatime', name: '甜点时光', items: ['candy', 'cake', 'tea'], mods: { regen: 2, maxHp: 5 } },
  { id: 'adventurer', name: '冒险者', items: ['boots', 'helmet', 'scope'], mods: { speed: 5, armor: 2, range: 20 } },
  { id: 'witch', name: '魔女', items: ['hairpin', 'wand', 'bookmark'], mods: { damage: 10, crit: 5 } },
  { id: 'gambler', name: '赌徒', items: ['dice', 'clover', 'piggy'], mods: { luck: 15, crit: 5 } },
  { id: 'hunter', name: '猎人', items: ['quiver', 'glasses', 'scope'], mods: { rangedDamage: 10, range: 30 } },
  { id: 'warrior', name: '武者', items: ['gloves', 'whetstone', 'lace'], mods: { meleeDamage: 12, armor: 2 } },
];

export function activeItemSets(owned: ReadonlyMap<string, number>): ItemSet[] {
  return ITEM_SETS.filter((s) => s.items.every((id) => (owned.get(id) ?? 0) > 0));
}

/** The sets an item belongs to, with how many of each set's pieces are owned. */
export function setsForItem(owned: ReadonlyMap<string, number>, itemId: string): Array<{ set: ItemSet; have: number }> {
  return ITEM_SETS.filter((s) => s.items.includes(itemId)).map((set) => ({
    set,
    have: set.items.filter((id) => (owned.get(id) ?? 0) > 0).length,
  }));
}
