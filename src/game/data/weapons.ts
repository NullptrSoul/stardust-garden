export type WeaponClass = 'melee' | 'ranged';

/**
 * bolt: straight projectile. arc: melee sweep in a cone. chain: lightning that
 * jumps between enemies. pulse: ring around the player with knockback.
 * spread: a fan of short-range projectiles. homing: slow projectile that steers.
 */
export type WeaponBehavior = 'bolt' | 'arc' | 'chain' | 'pulse' | 'spread' | 'homing';

export interface WeaponDef {
  id: string;
  name: string;
  cls: WeaponClass;
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
    cls: 'ranged',
    behavior: 'bolt',
    damage: 6,
    cooldown: 0.85,
    range: 430,
    speed: 950,
    count: 1,
    knockback: 60,
    color: '#FFCF66',
    price: 18,
    desc: '向最近的敌人射出星光弹',
  },
  {
    id: 'crescent',
    name: '月牙刃',
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
  },
  {
    id: 'talisman',
    name: '雷符',
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
  },
  {
    id: 'fan',
    name: '清风扇',
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
    desc: '扇出一圈风浪，伤害并击退周围敌人',
  },
  {
    id: 'bubble',
    name: '泡泡枪',
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
  },
  {
    id: 'tome',
    name: '魔导书',
    cls: 'ranged',
    behavior: 'homing',
    damage: 7,
    cooldown: 1.3,
    range: 480,
    speed: 520,
    count: 1,
    knockback: 70,
    color: '#FFB36B',
    price: 24,
    desc: '放出会追踪敌人的火球',
  },
];

export function weaponById(id: string): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
