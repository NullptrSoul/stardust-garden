export type EnemyLook =
  | 'slime'
  | 'imp'
  | 'mushroom'
  | 'knight'
  | 'bunny'
  | 'twin'
  | 'cat'
  | 'bud'
  | 'king'
  | 'darkKnight'
  | 'queen';

/** Which scripted boss brain drives a boss. */
export type BossKind = 'king' | 'knight' | 'queen';

/**
 * chase: walk at the player. keepAway: hold a distance and shoot.
 * charge: chase, then periodically wind up and dash in a straight line.
 * flee: run from the player and escape after a while. still: never moves.
 */
export type EnemyBehavior = 'chase' | 'keepAway' | 'charge' | 'flee' | 'still';

export interface ShootDef {
  interval: number;
  speed: number;
  damage: number;
  /** Bullets per volley; above 1 they fire in a ring. */
  count: number;
}

export interface ChargeDef {
  /** Seconds between dashes. */
  every: number;
  windup: number;
  speed: number;
  duration: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  look: EnemyLook;
  behavior: EnemyBehavior;
  hp: number;
  /** Extra HP per wave on top of the global growth (used by neutral buds). */
  hpPerWave?: number;
  speed: number;
  /** Contact damage at wave 1; 0 means touching it is harmless. */
  damage: number;
  radius: number;
  /** Star shards dropped on death. */
  drops: number;
  /** Chance of also dropping a healing candy. */
  candy: number;
  /** Drops a treasure chest (opened when the wave ends). */
  chest?: boolean;
  firstWave: number;
  /** Relative spawn chance once available; 0 means only spawned by special rules. */
  weight: number;
  keepAway?: number;
  shoot?: ShootDef;
  charge?: ChargeDef;
  /** On death, splits into this many of another enemy. */
  split?: { id: string; count: number };
  /** Seconds before a fleeing enemy escapes. */
  lifetime?: number;
  /** Seconds between summoning slimes. */
  summonEvery?: number;
  boss?: BossKind;
  /** Shown under the name in the boss entrance banner. */
  title?: string;
}

/** Shared default chance for regular monsters to drop a candy. */
const CANDY = 0.03;

export const ENEMIES: EnemyDef[] = [
  { id: 'slime', name: '果冻史莱姆', look: 'slime', behavior: 'chase', hp: 8, speed: 105, damage: 2, radius: 26, drops: 1, candy: CANDY, firstWave: 1, weight: 10 },
  { id: 'imp', name: '小恶魔', look: 'imp', behavior: 'chase', hp: 5, speed: 185, damage: 2, radius: 22, drops: 1, candy: CANDY, firstWave: 2, weight: 6 },
  {
    id: 'mushroom',
    name: '吐泡蘑菇',
    look: 'mushroom',
    behavior: 'keepAway',
    hp: 10,
    speed: 80,
    damage: 2,
    radius: 26,
    drops: 2,
    candy: CANDY,
    firstWave: 3,
    weight: 4,
    keepAway: 300,
    shoot: { interval: 2.6, speed: 320, damage: 2, count: 1 },
  },
  {
    id: 'bunny',
    name: '冲锋兔',
    look: 'bunny',
    behavior: 'charge',
    hp: 12,
    speed: 95,
    damage: 3,
    radius: 24,
    drops: 2,
    candy: CANDY,
    firstWave: 3,
    weight: 4,
    charge: { every: 3.2, windup: 0.7, speed: 560, duration: 0.45 },
  },
  { id: 'knight', name: '盾骑士', look: 'knight', behavior: 'chase', hp: 34, speed: 70, damage: 4, radius: 32, drops: 3, candy: CANDY * 2, firstWave: 4, weight: 3 },
  {
    id: 'twin',
    name: '双子史莱姆',
    look: 'twin',
    behavior: 'chase',
    hp: 20,
    speed: 85,
    damage: 3,
    radius: 32,
    drops: 1,
    candy: CANDY,
    firstWave: 5,
    weight: 3,
    split: { id: 'mini', count: 2 },
  },
  { id: 'mini', name: '小史莱姆', look: 'slime', behavior: 'chase', hp: 6, speed: 145, damage: 2, radius: 17, drops: 1, candy: 0, firstWave: 99, weight: 0 },
  { id: 'thief', name: '小偷猫', look: 'cat', behavior: 'flee', hp: 22, speed: 165, damage: 0, radius: 24, drops: 8, candy: 0, chest: true, firstWave: 2, weight: 0, lifetime: 14 },
  { id: 'bud', name: '星光花苞', look: 'bud', behavior: 'still', hp: 10, hpPerWave: 5, speed: 0, damage: 0, radius: 26, drops: 2, candy: 1, firstWave: 1, weight: 0 },
  {
    id: 'king',
    name: '史莱姆国王',
    title: '跳起来能压扁整片花园',
    look: 'king',
    behavior: 'chase',
    hp: 1200,
    speed: 80,
    damage: 6,
    radius: 58,
    drops: 30,
    candy: 1,
    chest: true,
    firstWave: 99,
    weight: 0,
    boss: 'king',
  },
  {
    id: 'darkKnight',
    name: '暗影骑士 · 黑曜',
    title: '吞噬星光的骑士',
    look: 'darkKnight',
    behavior: 'chase',
    hp: 2600,
    speed: 95,
    damage: 7,
    radius: 54,
    drops: 40,
    candy: 1,
    chest: true,
    firstWave: 99,
    weight: 0,
    boss: 'knight',
  },
  {
    id: 'queen',
    name: '史莱姆女王',
    title: '星屑庭院的支配者',
    look: 'queen',
    behavior: 'chase',
    hp: 4200,
    speed: 60,
    damage: 7,
    radius: 76,
    drops: 0,
    candy: 0,
    firstWave: 99,
    weight: 0,
    boss: 'queen',
  },
];

/** Waves that end only when their boss is beaten. */
export const BOSS_BY_WAVE: Record<number, string> = { 5: 'king', 8: 'darkKnight', 10: 'queen' };

export function enemyById(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown enemy: ${id}`);
  return e;
}
