import type { StatMods } from '../stats';

export interface ItemDef {
  id: string;
  name: string;
  /** Placeholder icon until item art exists. */
  icon: string;
  mods: StatMods;
  price: number;
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
];
