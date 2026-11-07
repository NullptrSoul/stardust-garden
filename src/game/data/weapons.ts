export type WeaponClass = 'melee' | 'ranged';

/** Synergy families; owning several weapons of one tag unlocks set bonuses. */
export type WeaponTag = 'arcane' | 'shooter' | 'melee' | 'element';

/**
 * bolt: straight projectile. arc: melee sweep in a cone. chain: lightning that
 * jumps between enemies. pulse: ring around the player with knockback.
 * spread: a fan of short-range projectiles. homing: slow projectile that steers.
 * arrow: fast piercing projectile (count = pierce). sweep: full circle around
 * the player. thrust: stab along a line. frost: projectile that slows.
 * lob: flask thrown at a spot, leaves a poison puddle. orbit: stars circling
 * the player (count = stars, range = orbit radius, speed = turn rate,
 * cooldown = time before the same monster can be hit again).
 */
export type WeaponBehavior =
  | 'bolt'
  | 'arc'
  | 'chain'
  | 'pulse'
  | 'spread'
  | 'homing'
  | 'arrow'
  | 'sweep'
  | 'thrust'
  | 'frost'
  | 'lob'
  | 'orbit';

/** Extra behavior a weapon gains at tier III (index 0) and IV (index 1). */
export interface WeaponTrait {
  name: string;
  desc: string;
}

export interface WeaponDef {
  id: string;
  name: string;
  cls: WeaponClass;
  tags: WeaponTag[];
  behavior: WeaponBehavior;
  damage: number;
  /** Seconds between attacks at tier I. */
  cooldown: number;
  range: number;
  /** Projectile speed. */
  speed: number;
  /** Projectiles per attack (spread) or extra jumps (chain). */
  count: number;
  knockback: number;
  color: string;
  /** Tier I price before wave scaling. */
  price: number;
  desc: string;
  traits: [WeaponTrait, WeaponTrait];
}

export const TIER_NAMES = ['I', 'II', 'III', 'IV'];
export const TIER_DAMAGE = [1, 1.6, 2.5, 3.8];
export const TIER_COOLDOWN = [1, 0.9, 0.8, 0.7];
export const TIER_PRICE = [1, 2, 3.5, 6];
export const TIER_COLORS = ['#FFFFFF', '#8FC8FF', '#C9A2FF', '#FFC861'];
export const MAX_TIER = TIER_NAMES.length - 1;

export const WEAPONS: WeaponDef[] = [
  {
    id: 'staff',
    name: '星光杖',
    tags: ['arcane', 'shooter'],
    cls: 'ranged',
    behavior: 'bolt',
    damage: 7,
    cooldown: 0.85,
    range: 430,
    speed: 950,
    count: 1,
    knockback: 60,
    color: '#FFCF66',
    price: 18,
    desc: '向最近的敌人射出星光弹',
    traits: [{ name: '穿透', desc: '星光弹穿透 1 个敌人' }, { name: '双星', desc: '每次射出 2 颗，各穿透 2 个敌人' }],
  },
  {
    id: 'crescent',
    name: '月牙刃',
    tags: ['melee'],
    cls: 'melee',
    behavior: 'arc',
    damage: 11,
    cooldown: 1.0,
    range: 150,
    speed: 0,
    count: 1,
    knockback: 180,
    color: '#C9B8FF',
    price: 18,
    desc: '挥出月牙，砍中前方扇形内所有敌人',
    traits: [{ name: '宽刃', desc: '挥砍角度变大' }, { name: '满月', desc: '挥砍变成一整圈' }],
  },
  {
    id: 'talisman',
    name: '雷符',
    tags: ['arcane', 'element'],
    cls: 'ranged',
    behavior: 'chain',
    damage: 6,
    cooldown: 1.25,
    range: 380,
    speed: 0,
    count: 2,
    knockback: 0,
    color: '#B48CFF',
    price: 22,
    desc: '落雷击中敌人后跳向附近 2 个敌人',
    traits: [{ name: '麻痹', desc: '被雷击中的敌人减速 1.5 秒' }, { name: '落雷', desc: '第一个目标周围的敌人也受到一半伤害' }],
  },
  {
    id: 'fan',
    name: '清风扇',
    tags: ['melee', 'element'],
    cls: 'melee',
    behavior: 'pulse',
    damage: 5,
    cooldown: 1.6,
    range: 170,
    speed: 0,
    count: 1,
    knockback: 320,
    color: '#8FE3D9',
    price: 20,
    desc: '击退敌人，推不动的受 2.5 倍伤害',
    traits: [{ name: '强风', desc: '范围 +25%，击退更远' }, { name: '护风', desc: '风浪吹散范围内的敌方子弹' }],
  },
  {
    id: 'bubble',
    name: '泡泡枪',
    tags: ['shooter', 'element'],
    cls: 'ranged',
    behavior: 'spread',
    damage: 4,
    cooldown: 1.1,
    range: 300,
    speed: 650,
    count: 3,
    knockback: 90,
    color: '#A8D8FF',
    price: 18,
    desc: '一次射出 3 颗泡泡，近距离威力大',
    traits: [{ name: '多泡', desc: '每次多射 1 颗泡泡' }, { name: '爆泡', desc: '泡泡命中后溅射周围敌人' }],
  },
  {
    id: 'tome',
    name: '魔导书',
    tags: ['arcane'],
    cls: 'ranged',
    behavior: 'homing',
    damage: 11,
    cooldown: 1.15,
    range: 480,
    speed: 620,
    count: 1,
    knockback: 70,
    color: '#FFB36B',
    price: 22,
    desc: '放出会追踪敌人的火球',
    traits: [{ name: '爆炎', desc: '火球命中时爆炸，伤害周围敌人' }, { name: '双发', desc: '每次放出 2 颗火球，可以穿透' }],
  },
  {
    id: 'bow',
    name: '星弓',
    tags: ['shooter'],
    cls: 'ranged',
    behavior: 'arrow',
    damage: 13,
    cooldown: 1.35,
    range: 560,
    speed: 1300,
    count: 2,
    knockback: 80,
    color: '#9FD8FF',
    price: 24,
    desc: '穿透 2 个敌人的长箭，射程很远',
    traits: [{ name: '连珠', desc: '每次射出 2 支箭' }, { name: '穿云', desc: '箭矢穿透所有敌人' }],
  },
  {
    id: 'scythe',
    name: '死神镰',
    tags: ['melee', 'arcane'],
    cls: 'melee',
    behavior: 'sweep',
    damage: 13,
    cooldown: 1.5,
    range: 140,
    speed: 0,
    count: 1,
    knockback: 220,
    color: '#B48CFF',
    price: 26,
    desc: '挥动镰刀，横扫身边一整圈',
    traits: [{ name: '吸魂', desc: '每击杀 1 个敌人回 1 生命（每次最多 2）' }, { name: '巨镰', desc: '横扫范围 +40%' }],
  },
  {
    id: 'spear',
    name: '长枪',
    tags: ['melee'],
    cls: 'melee',
    behavior: 'thrust',
    damage: 12,
    cooldown: 0.95,
    range: 210,
    speed: 0,
    count: 1,
    knockback: 150,
    color: '#E9D8A6',
    price: 20,
    desc: '向前突刺，刺穿一整排敌人',
    traits: [{ name: '突进', desc: '突刺距离 +35%' }, { name: '三连刺', desc: '同时向三个方向突刺' }],
  },
  {
    id: 'frost',
    name: '冰晶',
    tags: ['element', 'shooter'],
    cls: 'ranged',
    behavior: 'frost',
    damage: 10,
    cooldown: 0.95,
    range: 420,
    speed: 780,
    count: 1,
    knockback: 40,
    color: '#A8E6FF',
    price: 20,
    desc: '冰锥命中的敌人减速 1.5 秒',
    traits: [{ name: '冻结', desc: '减速时间延长到 3 秒' }, { name: '冰爆', desc: '冰锥命中后炸开，溅射周围敌人' }],
  },
  {
    id: 'flask',
    name: '毒瓶',
    tags: ['element'],
    cls: 'ranged',
    behavior: 'lob',
    damage: 4,
    cooldown: 2.2,
    range: 400,
    speed: 520,
    count: 1,
    knockback: 0,
    color: '#A6F04A',
    price: 22,
    desc: '扔出毒瓶，落地留下一滩毒池',
    traits: [{ name: '腐蚀', desc: '毒池范围 +30%，持续更久' }, { name: '双瓶', desc: '每次扔出 2 个毒瓶' }],
  },
  {
    id: 'spirit',
    name: '星灵',
    tags: ['arcane'],
    cls: 'ranged',
    behavior: 'orbit',
    damage: 7,
    cooldown: 0.5,
    range: 95,
    speed: 3.4,
    count: 2,
    knockback: 60,
    color: '#FFE07A',
    price: 22,
    desc: '2 颗星灵绕身旋转，碰到就伤害',
    traits: [{ name: '群星', desc: '多 1 颗星灵' }, { name: '星环', desc: '再多 1 颗，环绕范围更大' }],
  },
];

export function weaponById(id: string): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
