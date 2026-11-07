import { clamp } from '../engine/math';
import type { Rng } from '../engine/rng';
import type { Sfx } from './audio';
import { newBrain, updateBoss, type BossBrain } from './boss';
import { config } from './config';
import type { SkillKind } from './data/characters';
import { ENEMIES, enemyById, type EnemyDef } from './data/enemies';
import { chapterOfStage } from './data/stages';
import { AFFIX_LIST, ARMOR_TAKEN, BLAST_DELAY, BLAST_RADIUS, FRENZY_SPEED, REGEN_PER_SEC, type EliteAffix } from './data/affixes';
import { BLOODPACT_CHANCE, RESONANCE_BONUS } from './data/blessings';
import { activeCombos, CLASS_WEAPON_BONUS, fitsClass, type ComboId } from './data/synergies';
import { TIER_COOLDOWN, TIER_DAMAGE, weaponById, type WeaponDef } from './data/weapons';
import type { Fx } from './fx';
import * as L from './layout';
import { palette } from './palette';
import type { Run } from './run';
import {
  bossesForWave,
  bossHpScale,
  bossTimeLimit,
  difficultyWave,
  eliteChance,
  enemyDamage,
  enemyHpScale,
  spawnInterval,
  waveDuration,
} from './waves';
import {
  cooldownMultiplier,
  critChance,
  damageMultiplier,
  damageTaken,
  dodgeChance,
  speedMultiplier,
} from './stats';

export interface Player {
  x: number;
  y: number;
  hp: number;
  facing: number;
  moving: boolean;
  invuln: number;
  /** 1 right after taking damage, fades to 0. */
  hurt: number;
}

/** move: normal behavior. windup/dash: a charger's attack. */
export type EnemyPhase = 'move' | 'windup' | 'dash';

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Knockback velocity, decays quickly. */
  kx: number;
  ky: number;
  hp: number;
  maxHp: number;
  damage: number;
  r: number;
  color: string;
  facing: number;
  flash: number;
  pulse: number;
  /** 0 → 1 while popping out of the ground. */
  appear: number;
  shootT: number;
  summonT: number;
  phase: EnemyPhase;
  phaseT: number;
  dashX: number;
  dashY: number;
  /** Seconds until a fleeing enemy escapes. */
  life: number;
  /** Seconds of slowdown left (gale skill, frost, paralysis). */
  slow: number;
  /** Seconds left of standing in poison (for the acid combo). */
  poison: number;
  /** Elite variant: bigger, tougher, glowing red eyes, better loot. */
  elite: boolean;
  /** Every elite has one affix that changes how it fights. */
  affix: EliteAffix | null;
  /** Jitter right after being hit, fades to 0. */
  shake: number;
  /** Scripted attacks; only bosses have one. */
  brain: BossBrain | null;
  alive: boolean;
}

/** A red warning on the ground where an attack is about to land. */
export interface Zone {
  kind: 'circle' | 'line';
  x: number;
  y: number;
  /** Circle radius, or half the line's width. */
  r: number;
  x2: number;
  y2: number;
  t: number;
  max: number;
}

/** A jelly stain left where a monster burst; fades after a few seconds. */
export interface Decal {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  max: number;
  seed: number;
  /** goo: a monster's stain. crack: broken ground from a boss slam. */
  kind: 'goo' | 'crack';
}

/** Energy needed to cast the active skill. */
export const SKILL_MAX = 100;

/** Ongoing effects of the active skill. */
export interface SkillState {
  /** Seconds left of the orbiting fire ring. */
  ringT: number;
  ringAngle: number;
  /** World positions of the fire orbs this frame (for drawing). */
  orbs: Array<{ x: number; y: number }>;
  /** Per-enemy cooldown so an orb doesn't hit the same monster every frame. */
  ringHits: Map<number, number>;
  /** Delays until each pending lightning strike. */
  strikes: number[];
  /** A whale on its way down, with seconds until impact. */
  whale: { x: number; y: number; t: number; max: number } | null;
}

const RING_TIME = 6;
const RING_ORBS = 8;
const RING_RADIUS = 125;
const RING_HIT_GAP = 0.35;
const WHALE_DROP = 0.9;
const WHALE_RADIUS = 240;

export interface SpawnMark {
  x: number;
  y: number;
  t: number;
  def: EnemyDef;
  elite: boolean;
  /** The full telegraph time, for drawing the rift opening. */
  max: number;
}

export type ShotKind = 'star' | 'bubble' | 'fire' | 'arrow' | 'ice' | 'flask';

/** Optional extras for a projectile. */
export interface ShotOpts {
  splash?: number;
  zap?: number;
  /** Seconds of slowdown on hit. */
  chill?: number;
  /** A flask: flies over monsters and leaves a poison puddle of this radius where it lands. */
  puddle?: number;
}

/** A pool of poison left by a flask; hurts monsters standing in it every half second. */
export interface Puddle {
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
  tick: number;
  damage: number;
}

/** A spear stab, for drawing. */
export interface Thrust {
  x: number;
  y: number;
  angle: number;
  len: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface Shot {
  kind: ShotKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  crit: boolean;
  life: number;
  /** Starting life, so a lobbed flask knows how far along its arc it is. */
  maxLife: number;
  pierce: number;
  chill: number;
  puddle: number;
  hit: number[];
  homing: boolean;
  knockback: number;
  /** On hit, half damage to monsters within this radius (0 = none). */
  splash: number;
  /** On hit, chance to arc lightning to a nearby monster. */
  zap: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
}

/** shard: currency + xp. candy: heals. chest: an item when the wave ends. */
export type DropKind = 'shard' | 'candy' | 'chest';

export interface Drop {
  kind: DropKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  magnet: boolean;
  alive: boolean;
  seed: number;
}

export interface WeaponState {
  def: WeaponDef;
  tier: number;
  cd: number;
  /** Aim direction, for drawing. */
  angle: number;
  /** 1 right after firing, fades to 0. */
  kick: number;
  x: number;
  y: number;
  /** Orbiting stars: current angle, star positions and per-monster hit cooldowns. */
  spin: number;
  orbs: Array<{ x: number; y: number }>;
  hits: Map<number, number>;
}

/** Short-lived weapon visuals. */
export interface Swing {
  x: number;
  y: number;
  angle: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
  /** Half of the swept angle; defaults to the normal melee arc. */
  half?: number;
}
export interface Lightning {
  points: number[];
  life: number;
  maxLife: number;
}
export interface Wave {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

export type WorldEvent = 'none' | 'waveCleared' | 'playerDied';

const ARC_HALF_ANGLE = Math.PI / 3;
const CHAIN_JUMP = 170;
const SHOT_COLORS: Record<ShotKind, string> = {
  star: '#FFCF66',
  bubble: '#A8D8FF',
  fire: '#FFB36B',
  arrow: '#9FD8FF',
  ice: '#A8E6FF',
  flask: '#B6F25A',
};
/** A wisp's fuse and blast radius. */
const WISP_FUSE = 0.8;
const WISP_RADIUS = 95;
/** Seconds between static orb strikes. */
const STATIC_INTERVAL = 6;
const ENDING_TIME = 0.9;
/** Shortest time between two ordinary freeze frames. */
/** The character's outline as an ellipse around her chest, for placing weapons. */
const BODY_CY = 46;
const BODY_RX = 48;
const BODY_RY = 62;
const STOP_GAP = 0.8;
/** The fan's damage against monsters its wind can't push. */
const FAN_IMMOVABLE_BONUS = 2.5;
const CANDY_HEAL = 3;
const BUDS_PER_WAVE = 2;
const THIEF_CHANCE = 0.55;
const ELITE_CHESTS_PER_WAVE = 2;

/** One wave of combat. Owns every moving thing in the arena. */
export class World {
  readonly player: Player = { x: L.ARENA_CX, y: L.ARENA_CY, hp: 1, facing: 1, moving: false, invuln: 0, hurt: 0 };
  enemies: Enemy[] = [];
  spawns: SpawnMark[] = [];
  shots: Shot[] = [];
  bullets: Bullet[] = [];
  drops: Drop[] = [];
  weapons: WeaponState[] = [];
  /** Weapon combos active this wave (both weapons owned). */
  combos = new Set<ComboId>();
  swings: Swing[] = [];
  lightning: Lightning[] = [];
  waves: Wave[] = [];
  /** The boss shown in the HP bar. */
  boss: Enemy | null = null;
  /** Every boss of this wave; the wave ends when all are down. */
  bosses: Enemy[] = [];
  /** Poison pools from flasks. */
  puddles: Puddle[] = [];
  /** Spear stabs, for drawing. */
  thrusts: Thrust[] = [];
  private staticT = 0;
  /** Volatile elites' pending explosions. */
  private blasts: Array<{ x: number; y: number; t: number; damage: number; r: number; color: string }> = [];
  elapsed = 0;
  /** Wave length in seconds; 0 means it lasts until the boss dies. */
  duration = 0;
  /** Set when the wave is over and drops are flying home. */
  ending = 0;
  /** Active skill energy, 0..SKILL_MAX. */
  energy = 0;
  readonly skill: SkillState = { ringT: 0, ringAngle: 0, orbs: [], ringHits: new Map(), strikes: [], whale: null };
  zones: Zone[] = [];
  decals: Decal[] = [];
  /** Freeze-frame time left; the game skips world updates while it runs. */
  hitStop = 0;
  /** Set when a boss appears, so the game can play its entrance; the game clears it. */
  introBoss: Enemy | null = null;
  /** Set when an endless boss ran out of time and left; the game shows a toast and clears it. */
  bossFled = false;
  /** Like bossFled, but stays set until the next wave: no blessing for a boss that left. */
  bossLeftThisWave = false;
  private lastStopAt = -1;
  private spawnT = 0;
  /** Seconds into the wave when the thief shows up, or -1 for none. */
  private thiefAt = -1;
  /** Chests elites dropped this wave (capped, or late endless would rain free items). */
  private eliteChests = 0;
  private nextId = 1;
  private run!: Run;

  constructor(
    readonly rng: Rng,
    readonly fx: Fx,
    readonly sfx: Sfx,
  ) {}

  get remaining(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  startWave(run: Run): void {
    this.run = run;
    const p = this.player;
    p.x = L.ARENA_CX;
    p.y = L.ARENA_CY;
    p.hp = run.stats.maxHp;
    p.invuln = 1;
    p.hurt = 0;
    this.enemies = [];
    this.spawns = [];
    this.shots = [];
    this.bullets = [];
    this.drops = [];
    this.swings = [];
    this.lightning = [];
    this.waves = [];
    this.zones = [];
    this.decals = [];
    this.hitStop = 0;
    this.introBoss = null;
    this.bossFled = false;
    this.bossLeftThisWave = false;
    this.lastStopAt = -1;
    this.boss = null;
    this.bosses = [];
    this.blasts = [];
    this.eliteChests = 0;
    this.elapsed = 0;
    this.ending = 0;
    this.spawnT = 1;
    this.energy = config.skillStartEnergy;
    this.skill.ringT = 0;
    this.skill.orbs = [];
    this.skill.ringHits.clear();
    this.skill.strikes = [];
    this.skill.whale = null;
    this.duration = waveDuration(run);
    this.weapons = run.weapons.map((w) => ({
      def: weaponById(w.id),
      tier: w.tier,
      cd: 0.4,
      angle: -Math.PI / 2,
      kick: 0,
      x: p.x,
      y: p.y,
      spin: 0,
      orbs: [],
      hits: new Map<number, number>(),
    }));
    this.puddles = [];
    this.thrusts = [];
    this.staticT = STATIC_INTERVAL;
    // Hourglass: start the wave with extra skill energy.
    this.energy = Math.min(SKILL_MAX, this.energy + 25 * this.itemCount('hourglass'));
    this.combos = new Set(activeCombos(run.weapons.map((w) => w.id)).map((c) => c.id));
    // Two bosses stand side by side.
    const bossIds = bossesForWave(run);
    bossIds.forEach((id, i) => {
      const dx = bossIds.length > 1 ? (i === 0 ? -220 : 220) : 0;
      const x = clamp(p.x + dx, L.ARENA.x + 160, L.ARENA_RIGHT - 160);
      this.mark(enemyById(id), x, clamp(p.y - 420, L.ARENA.y + 120, L.ARENA_BOTTOM - 120));
    });
    for (let i = 0; i < BUDS_PER_WAVE; i++) {
      const pt = this.spawnPoint(260, 900);
      this.spawnEnemy(enemyById('bud'), pt.x, pt.y);
    }
    const timed = this.duration > 0;
    const thiefAllowed = !run.stage?.enemies || run.stage.enemies.includes('thief');
    this.thiefAt = timed && thiefAllowed && run.wave >= 2 && this.rng.chance(THIEF_CHANCE) ? this.rng.range(4, Math.max(5, this.duration - 10)) : -1;
  }

  /** Ad placeholder reward: full HP, a moment of safety, nearby monsters pushed away. */
  revive(): void {
    const p = this.player;
    p.hp = this.run.stats.maxHp;
    p.invuln = 2;
    this.bullets = [];
    for (const e of this.enemies) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 260) {
        e.kx += (dx / d) * 900;
        e.ky += (dy / d) * 900;
      }
    }
    this.waves.push({ x: p.x, y: p.y, radius: 260, life: 0.5, maxLife: 0.5, color: palette.goldLight });
  }

  update(dt: number, moveX: number, moveY: number): WorldEvent {
    const stats = this.run.stats;
    const p = this.player;
    this.elapsed += dt;
    this.run.playTime += dt;

    // Player
    const mag = Math.min(1, Math.hypot(moveX, moveY));
    p.moving = mag > 0.08;
    if (p.moving) {
      const speed = config.playerSpeed * speedMultiplier(stats) * mag;
      const len = Math.hypot(moveX, moveY);
      p.x += (moveX / len) * speed * dt;
      p.y += (moveY / len) * speed * dt;
      if (Math.abs(moveX) > 0.1) p.facing = moveX < 0 ? -1 : 1;
    }
    const pr = config.playerRadius;
    p.x = clamp(p.x, L.ARENA.x + pr, L.ARENA_RIGHT - pr);
    p.y = clamp(p.y, L.ARENA.y + pr, L.ARENA_BOTTOM - pr);
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurt = Math.max(0, p.hurt - dt * 3);
    if (stats.regen > 0 && p.hp > 0) {
      p.hp = Math.min(stats.maxHp, p.hp + stats.regen * config.regenPerPoint * dt);
    }

    this.updateEffects(dt);

    if (this.ending > 0) {
      this.ending -= dt;
      this.updateDrops(dt, true);
      if (this.ending <= 0) {
        for (const d of this.drops) if (d.alive) this.collect(d);
        this.drops = [];
        return 'waveCleared';
      }
      return 'none';
    }

    this.energy = Math.min(SKILL_MAX, this.energy + config.skillChargePerSec * dt);
    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateSkill(dt);
    this.updateWeapons(dt);
    this.updateShots(dt);
    this.updatePuddles(dt);
    this.updateStatic(dt);
    if (this.updateBullets(dt)) return 'playerDied';
    this.updateDrops(dt, false);
    if (p.hp <= 0) return 'playerDied';

    const timedOut = this.duration > 0 && this.elapsed >= this.duration;
    // The HP bar follows the next boss still standing.
    if (this.boss && !this.boss.alive) this.boss = this.bosses.find((b) => b.alive) ?? this.boss;
    const bossesPending = this.spawns.some((s) => s.def.boss);
    const bossDown = this.duration === 0 && this.bosses.length > 0 && !bossesPending && this.bosses.every((b) => !b.alive);
    // Endless: a boss that outlasts its time limit leaves, without its loot.
    const limit = bossTimeLimit(this.run);
    const fled = this.duration === 0 && limit > 0 && this.elapsed >= limit && this.bosses.some((b) => b.alive);
    if (fled) {
      this.bossFled = true;
      this.bossLeftThisWave = true;
      for (const b of this.bosses) b.alive = false;
    }
    if (timedOut || bossDown || fled) this.beginEnding();
    return 'none';
  }

  // ---- Spawning ----

  private updateSpawning(dt: number): void {
    for (let i = this.spawns.length - 1; i >= 0; i--) {
      const s = this.spawns[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this.spawns.splice(i, 1);
      this.spawnEnemy(s.def, s.x, s.y, 0, s.elite);
      const big = s.elite || !!s.def.boss;
      this.fx.emerge(s.x, s.y + s.def.radius * 0.3, s.def.boss ? '#FF3B6B' : s.elite ? '#FF8A5C' : '#C38BFF', big);
    }

    if (this.thiefAt >= 0 && this.elapsed >= this.thiefAt) {
      this.thiefAt = -1;
      const pt = this.spawnPoint();
      this.mark(enemyById('thief'), pt.x, pt.y);
    }

    const wave = difficultyWave(this.run);
    // Spawning stops a moment before the timer runs out.
    if (this.duration > 0 && this.elapsed > this.duration - 1.5) return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT += spawnInterval(this.run, this.duration === 0);
    if (this.enemies.length + this.spawns.length >= config.maxEnemies) return;

    const allowed = this.run.stage?.enemies;
    const chapter = this.run.stage ? chapterOfStage(this.run.stage) : this.run.wave > config.waveCount ? 2 : 1;
    const pool = ENEMIES.filter(
      (e) => e.weight > 0 && e.firstWave <= wave && (allowed ? allowed.includes(e.id) : (e.chapter ?? 1) <= chapter),
    );
    const group = this.rng.int(1, Math.min(6, 1 + Math.floor(wave / 2)));
    const center = this.spawnPoint();
    const elites = eliteChance(this.run);
    for (let i = 0; i < group; i++) {
      const def = pickWeighted(pool, this.rng.next());
      const x = clamp(center.x + this.rng.range(-60, 60), L.ARENA.x + 40, L.ARENA_RIGHT - 40);
      const y = clamp(center.y + this.rng.range(-60, 60), L.ARENA.y + 40, L.ARENA_BOTTOM - 40);
      this.mark(def, x, y, this.rng.chance(elites));
    }
  }

  /**
   * A spawn spot in a ring around the player: never on top of them, never so far
   * away that the big map makes the fight feel empty.
   */
  private spawnPoint(minD = config.spawnSafeDistance, maxD = config.spawnMaxDistance): { x: number; y: number } {
    const p = this.player;
    for (let tries = 0; tries < 16; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(minD, maxD);
      const x = clamp(p.x + Math.cos(a) * d, L.ARENA.x + 60, L.ARENA_RIGHT - 60);
      const y = clamp(p.y + Math.sin(a) * d, L.ARENA.y + 60, L.ARENA_BOTTOM - 60);
      if (Math.hypot(x - p.x, y - p.y) >= minD) return { x, y };
    }
    // Pinned in a corner: fall back to the far side of the arena.
    return { x: L.ARENA_CX * 2 - p.x, y: L.ARENA_CY * 2 - p.y };
  }

  private mark(def: EnemyDef, x: number, y: number, elite = false): void {
    const t = config.spawnTelegraph * (def.boss ? 2 : elite ? 1.3 : 1);
    this.spawns.push({ x, y, t, max: t, def, elite });
  }

  private spawnEnemy(def: EnemyDef, x: number, y: number, appear = 0, elite = false): Enemy {
    const wave = difficultyWave(this.run);
    let hp = def.boss ? def.hp * bossHpScale(this.run, def.bossWave ?? 10) : def.hp * enemyHpScale(this.run);
    if (def.hpPerWave) hp = def.hp + def.hpPerWave * (wave - 1);
    if (elite) hp *= 4;
    hp = Math.round(hp);
    const id = this.nextId++;
    const e: Enemy = {
      id,
      def,
      x,
      y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      hp,
      maxHp: hp,
      damage: def.damage > 0 ? enemyDamage(this.run, def.damage + (elite ? 2 : 0)) : 0,
      r: def.radius * (elite ? 1.4 : 1),
      color: lookColor(def, id),
      facing: 1,
      flash: 0,
      pulse: 0,
      appear,
      shootT: def.shoot ? def.shoot.interval * this.rng.range(0.6, 1.2) : 0,
      summonT: def.summonEvery ?? 0,
      phase: 'move',
      phaseT: def.charge ? def.charge.every * this.rng.range(0.5, 1) : 0,
      dashX: 0,
      dashY: 0,
      life: def.lifetime ?? 0,
      slow: 0,
      poison: 0,
      elite,
      affix: elite && !def.boss ? AFFIX_LIST[this.rng.int(0, AFFIX_LIST.length - 1)] : null,
      shake: 0,
      brain: def.boss ? newBrain(def.boss) : null,
      alive: true,
    };
    this.enemies.push(e);
    if (def.boss) {
      this.bosses.push(e);
      if (!this.boss || !this.boss.alive) this.boss = e;
      this.introBoss = e;
      if (config.shake) this.fx.addShake(14);
      this.sfx.bossAppear();
    }
    return e;
  }

  // ---- Helpers the boss brains use ----

  fireBullet(x: number, y: number, angle: number, speed: number, damage: number): void {
    this.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 11, damage, life: 6 });
  }

  addZone(zone: Zone): void {
    this.zones.push(zone);
  }

  /** Summons slimes around a point, some of them elite. */
  summon(x: number, y: number, count: number, elites: number, id = 'slime'): void {
    const slime = enemyById(id);
    for (let i = 0; i < count + elites; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(110, 170);
      this.mark(slime, clamp(x + Math.cos(a) * d, L.ARENA.x + 40, L.ARENA_RIGHT - 40), clamp(y + Math.sin(a) * d, L.ARENA.y + 40, L.ARENA_BOTTOM - 40), i >= count);
    }
  }

  addDecal(x: number, y: number, r: number, color: string, kind: 'goo' | 'crack' = 'goo'): void {
    if (this.decals.length > 80) this.decals.shift();
    const life = kind === 'crack' ? 8 : 5;
    this.decals.push({ x, y, r, color, life, max: life, seed: this.rng.next() * 10, kind });
  }

  /** Broken ground and flying rocks where a boss lands a heavy blow. */
  groundCrack(x: number, y: number, r: number): void {
    this.addDecal(x, y, r, '#3A2A3E', 'crack');
    this.fx.shatter(x, y - 10, '#9C8676', Math.round(8 + r / 15), 560);
  }

  /** Freeze frames. Ordinary ones are spaced at least STOP_GAP apart; `priority` skips that. */
  stop(seconds: number, priority = false): void {
    if (!config.hitStop) return;
    // Freezes need room between them, or a busy fight reads as lag. Big moments
    // (a boss falling, a skill) always get theirs.
    if (!priority && this.elapsed - this.lastStopAt < STOP_GAP) return;
    this.hitStop = Math.max(this.hitStop, seconds);
    this.lastStopAt = this.elapsed;
  }

  // ---- Enemies ----

  private updateEnemies(dt: number): void {
    const p = this.player;
    const list = this.enemies;
    const steer = Math.min(1, dt * 8);
    const knockDecay = Math.exp(-dt * 9);

    for (const e of list) {
      if (!e.alive) continue;
      e.appear = Math.min(1, e.appear + dt * 4);
      e.flash = Math.max(0, e.flash - dt * 7);
      e.pulse = Math.max(0, e.pulse - dt * 6);
      e.shake = Math.max(0, e.shake - dt);
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const def = e.def;

      if (e.brain && updateBoss(this, e, dt)) {
        // The boss brain moved it (jump, dash, wind-up); just check contact damage.
        e.vx = 0;
        e.vy = 0;
        const cd = Math.hypot(p.x - e.x, p.y - e.y);
        if (e.brain.z < 40 && cd < e.r + config.playerRadius * 0.8) this.hurtPlayer(e.damage);
        continue;
      }

      // Desired velocity from the behavior.
      let tx = 0;
      let ty = 0;
      e.slow = Math.max(0, e.slow - dt);
      e.poison = Math.max(0, e.poison - dt);
      const sp = def.speed * (e.appear < 1 ? 0.3 : 1) * (e.slow > 0 ? 0.4 : 1) * (e.affix === 'frenzy' ? FRENZY_SPEED : 1);
      if (e.affix === 'regen' && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * REGEN_PER_SEC * dt);
        if (Math.random() < dt * 4) this.fx.heal(e.x, e.y - e.r);
      }
      switch (def.behavior) {
        case 'chase':
          tx = (dx / d) * sp;
          ty = (dy / d) * sp;
          break;
        case 'keepAway': {
          const keep = def.keepAway ?? 300;
          const dir = d < keep - 30 ? -1 : d < keep + 30 ? 0 : 1;
          tx = (dx / d) * sp * dir;
          ty = (dy / d) * sp * dir;
          break;
        }
        case 'flee': {
          // Run away, curving along walls instead of getting stuck in a corner.
          const wobble = Math.sin(this.elapsed * 2 + e.id) * 0.6;
          const ax = -dx / d + -dy / d * wobble;
          const ay = -dy / d + (dx / d) * wobble;
          const al = Math.hypot(ax, ay) || 1;
          tx = (ax / al) * sp;
          ty = (ay / al) * sp;
          e.life -= dt;
          if (e.life <= 0) {
            e.alive = false;
            this.fx.poof(e.x, e.y - e.r * 0.6, e.color);
            this.fx.text(e.x, e.y - e.r - 20, '逃走了…', palette.textDark, 26);
            continue;
          }
          break;
        }
        case 'charge':
          this.updateCharger(e, dt, dx, dy, d);
          if (e.phase === 'move') {
            tx = (dx / d) * sp;
            ty = (dy / d) * sp;
          } else if (e.phase === 'dash' && def.charge) {
            tx = e.dashX * def.charge.speed;
            ty = e.dashY * def.charge.speed;
          }
          break;
        case 'still':
          break;
        case 'kamikaze':
          if (e.phase === 'move') {
            tx = (dx / d) * sp;
            ty = (dy / d) * sp;
            if (d < 95 && e.appear >= 1) {
              // Close enough: stop, flash and blow up after a moment.
              e.phase = 'windup';
              e.phaseT = WISP_FUSE;
              this.addZone({ kind: 'circle', x: e.x, y: e.y, r: WISP_RADIUS, x2: 0, y2: 0, t: WISP_FUSE, max: WISP_FUSE });
              this.sfx.warn();
            }
          } else {
            e.phaseT -= dt;
            if (e.phaseT <= 0) {
              e.alive = false;
              this.explode(e.x, e.y, e.damage, WISP_RADIUS, '#5FE0C8');
              continue;
            }
          }
          break;
      }
      if (e.phase === 'dash') {
        e.vx = tx;
        e.vy = ty;
      } else {
        e.vx += (tx - e.vx) * steer;
        e.vy += (ty - e.vy) * steer;
      }
      e.x += (e.vx + e.kx) * dt;
      e.y += (e.vy + e.ky) * dt;
      e.kx *= knockDecay;
      e.ky *= knockDecay;
      if (def.behavior !== 'still' && Math.abs(e.vx) > 5) e.facing = e.vx < 0 ? -1 : 1;
      else if (def.behavior === 'chase' && Math.abs(dx) > 4) e.facing = dx < 0 ? -1 : 1;

      if (def.shoot) {
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = def.shoot.interval * this.rng.range(0.85, 1.15);
          this.enemyShoot(e, Math.atan2(dy, dx));
          if (def.shoot.count > 1) this.sfx.bossShoot();
        }
      }
      if (def.summonEvery) {
        e.summonT -= dt;
        if (e.summonT <= 0) {
          e.summonT = def.summonEvery;
          for (let i = 0; i < 3; i++) {
            const a = this.rng.range(0, Math.PI * 2);
            this.mark(enemyById('slime'), clamp(e.x + Math.cos(a) * 130, L.ARENA.x + 40, L.ARENA_RIGHT - 40), clamp(e.y + Math.sin(a) * 130, L.ARENA.y + 40, L.ARENA_BOTTOM - 40));
          }
        }
      }

      if (e.damage > 0 && e.appear >= 1 && def.behavior !== 'kamikaze' && d < e.r + config.playerRadius * 0.8) this.hurtPlayer(e.damage);
    }

    // Keep monsters from stacking into one blob.
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = (a.r + b.r) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const am = a.def.boss || a.def.behavior === 'still' ? 0 : 1;
        const bm = b.def.boss || b.def.behavior === 'still' ? 0 : 1;
        a.x -= (dx / d) * push * am;
        a.y -= (dy / d) * push * am;
        b.x += (dx / d) * push * bm;
        b.y += (dy / d) * push * bm;
      }
    }
    for (const e of list) {
      e.x = clamp(e.x, L.ARENA.x + e.r * 0.6, L.ARENA_RIGHT - e.r * 0.6);
      e.y = clamp(e.y, L.ARENA.y + e.r * 0.6, L.ARENA_BOTTOM - e.r * 0.3);
    }
    if (list.some((e) => !e.alive)) this.enemies = list.filter((e) => e.alive);
  }

  /** Charger: chase → wind up (aim locked, telegraph shown) → dash → chase. */
  private updateCharger(e: Enemy, dt: number, dx: number, dy: number, d: number): void {
    const c = e.def.charge;
    if (!c || e.appear < 1) return;
    e.phaseT -= dt;
    if (e.phase === 'move' && e.phaseT <= 0 && d < 560) {
      e.phase = 'windup';
      e.phaseT = c.windup;
      e.dashX = dx / d;
      e.dashY = dy / d;
      e.facing = dx < 0 ? -1 : 1;
    } else if (e.phase === 'windup' && e.phaseT <= 0) {
      e.phase = 'dash';
      e.phaseT = c.duration;
      this.sfx.whoosh();
    } else if (e.phase === 'dash' && e.phaseT <= 0) {
      e.phase = 'move';
      e.phaseT = c.every * this.rng.range(0.8, 1.2);
    }
  }

  private enemyShoot(e: Enemy, aim: number): void {
    const s = e.def.shoot;
    if (!s) return;
    const dmg = enemyDamage(this.run, s.damage);
    const offset = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < s.count; i++) {
      const a = s.count === 1 ? aim : offset + (i * Math.PI * 2) / s.count;
      this.bullets.push({
        x: e.x + Math.cos(a) * e.r * 0.6,
        y: e.y - e.r * 0.5 + Math.sin(a) * e.r * 0.6,
        vx: Math.cos(a) * s.speed,
        vy: Math.sin(a) * s.speed,
        r: 11,
        damage: dmg,
        life: 5,
      });
    }
  }

  // ---- Weapons ----

  private updateWeapons(dt: number): void {
    const p = this.player;
    const stats = this.run.stats;
    const n = this.weapons.length;
    for (let i = 0; i < n; i++) {
      const w = this.weapons[i];
      // Slots sit on a ring just outside the character's outline (an ellipse
      // around her body), so weapons never cover her face.
      const slot = n === 1 ? -0.3 : -Math.PI / 2 + (i * Math.PI * 2) / n;
      const cos = Math.cos(slot);
      const sin = Math.sin(slot);
      const d = 1 / Math.sqrt((cos * cos) / (BODY_RX * BODY_RX) + (sin * sin) / (BODY_RY * BODY_RY)) + config.weaponOrbit;
      w.x = p.x + cos * d;
      w.y = p.y - BODY_CY + sin * d;
      w.cd -= dt;
      w.kick = Math.max(0, w.kick - dt * 5);

      if (w.def.behavior === 'orbit') {
        this.updateOrbit(w, dt, w.def.range + stats.range * 0.3);
        continue;
      }
      let range = w.def.range + stats.range * (w.def.cls === 'melee' ? 0.5 : 1);
      if (w.def.behavior === 'pulse' && w.tier >= 2) range *= 1.25;
      if (this.combos.has('windblade') && (w.def.id === 'crescent' || w.def.id === 'fan')) range *= 1.2;
      const origin = w.def.cls === 'melee' ? p : w;
      const target = this.nearestEnemy(origin.x, origin.y, range);
      if (!target) continue;
      w.angle = Math.atan2(target.y - w.y, target.x - w.x);
      if (w.cd > 0) continue;
      // Meteor combo: the star staff and the bow fire faster.
      const meteor = this.combos.has('meteor') && (w.def.id === 'staff' || w.def.id === 'bow') ? 0.87 : 1;
      w.cd = w.def.cooldown * TIER_COOLDOWN[w.tier] * cooldownMultiplier(stats) * meteor;
      w.kick = 1;
      this.fire(w, target, range);
    }
  }

  private fire(w: WeaponState, target: Enemy, range: number): void {
    const def = w.def;
    const p = this.player;
    const aim = Math.atan2(target.y - target.r * 0.45 - w.y, target.x - w.x);
    if (def.cls === 'ranged') {
      // Muzzle flash (no camera recoil: with six guns it reads as jitter).
      this.fx.ring(w.x, w.y, def.color, 9);
      this.fx.spark(w.x, w.y, Math.cos(aim), Math.sin(aim), def.color, 3, 260, 0.15);
    } else if (config.shake) {
      // Melee swings lean the camera into the blow.
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      this.fx.kick(Math.cos(a) * 1.5, Math.sin(a) * 1.5);
    }
    switch (def.behavior) {
      case 'bolt': {
        // III: pierce. IV: two stars that pierce twice. Galaxy combo: +1 pierce. Starfire combo: splash.
        const pierce = (w.tier >= 2 ? 1 : 0) + (w.tier >= 3 ? 1 : 0) + (this.combos.has('galaxy') ? 1 : 0);
        const splash = this.combos.has('starfire') ? 55 : 0;
        const count = w.tier >= 3 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const a = aim + (i - (count - 1) / 2) * 0.12;
          this.addShot(w, 'star', a, def.speed, range / def.speed, 10, pierce, false, { splash });
        }
        this.sfx.shoot('star');
        break;
      }
      case 'spread': {
        // III: one more bubble. IV: bubbles splash. Galaxy combo: one more bubble. Conductive combo: zaps.
        const count = def.count + (w.tier >= 2 ? 1 : 0) + (this.combos.has('galaxy') ? 1 : 0);
        const splash = w.tier >= 3 ? 60 : 0;
        const zap = this.combos.has('conductive') ? 0.25 : 0;
        for (let i = 0; i < count; i++) {
          const a = aim + (i - (count - 1) / 2) * 0.22;
          this.addShot(w, 'bubble', a, def.speed * this.rng.range(0.9, 1.1), range / def.speed, 11, 0, false, { splash, zap });
        }
        this.sfx.shoot('bubble');
        break;
      }
      case 'homing':
        this.fireTome(w, aim, range);
        this.sfx.shoot('fire');
        break;
      case 'arc': {
        // III: wider arc. IV: a full circle.
        // Lance combo: the crescent blade sweeps wider.
        const lance = this.combos.has('lance') ? 1.2 : 1;
        const half = w.tier >= 3 ? Math.PI : (w.tier >= 2 ? ARC_HALF_ANGLE * 1.4 : ARC_HALF_ANGLE) * lance;
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        for (const e of this.enemies) {
          if (!e.alive || e.appear < 1) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > range + e.r) continue;
          if (Math.abs(angleDiff(Math.atan2(dy, dx), a)) > half) continue;
          const roll = this.roll(w);
          this.damageEnemy(e, roll.damage, roll.crit, (dx / (d || 1)) * def.knockback, (dy / (d || 1)) * def.knockback);
        }
        this.swings.push({ x: p.x, y: p.y - 20, angle: a, radius: range, life: 0.22, maxLife: 0.22, color: def.color, half });
        this.sfx.slash();
        // Moonbook combo: sometimes the swing also throws a tome fireball.
        const tome = this.combos.has('moonbook') ? this.weapons.find((x) => x.def.id === 'tome') : undefined;
        if (tome && this.rng.chance(0.3)) this.fireTome(tome, a, tome.def.range, true);
        break;
      }
      case 'chain': {
        const hit: Enemy[] = [target];
        const jumps = def.count + w.tier;
        let last = target;
        for (let j = 0; j < jumps; j++) {
          const next = this.nearestEnemy(last.x, last.y, CHAIN_JUMP, hit);
          if (!next) break;
          hit.push(next);
          last = next;
        }
        const points = [w.x, w.y];
        for (const e of hit) {
          points.push(e.x, e.y - e.r * 0.5);
          const roll = this.roll(w);
          // Superconduct combo: chilled monsters take double lightning damage.
          const dmg = this.combos.has('superconduct') && e.slow > 0 ? roll.damage * 2 : roll.damage;
          this.damageEnemy(e, dmg, roll.crit, 0, 0);
          // III: paralysis slows everything the bolt touches.
          if (w.tier >= 2) e.slow = Math.max(e.slow, 1.5);
        }
        // IV: the first strike also hits the crowd around it.
        if (w.tier >= 3) this.splash(target.x, target.y - target.r * 0.5, 100, this.roll(w).damage * 0.5, hit, def.color);
        this.lightning.push({ points, life: 0.2, maxLife: 0.2 });
        this.sfx.zap();
        break;
      }
      case 'pulse': {
        for (const e of this.enemies) {
          if (!e.alive || e.appear < 1) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > range + e.r) continue;
          const roll = this.roll(w);
          // III: stronger wind pushes monsters farther.
          const kb = def.knockback * (w.tier >= 2 ? 1.5 : 1);
          // Wind that can't push a monster cuts it instead: bosses, heavies and armored elites take double.
          const immovable = e.def.boss || e.def.heavy || e.affix === 'armored' ? FAN_IMMOVABLE_BONUS : 1;
          this.damageEnemy(e, roll.damage * immovable, roll.crit, (dx / (d || 1)) * kb, (dy / (d || 1)) * kb);
        }
        // IV: the wind blows enemy bullets away.
        if (w.tier >= 3) {
          this.bullets = this.bullets.filter((b) => Math.hypot(b.x - p.x, b.y - p.y) > range);
        }
        // Thunderwind combo: each gust recharges the talismans.
        if (this.combos.has('thunderwind')) {
          for (const x of this.weapons) if (x.def.id === 'talisman') x.cd *= 0.5;
        }
        this.waves.push({ x: p.x, y: p.y - 20, radius: range, life: 0.35, maxLife: 0.35, color: def.color });
        this.sfx.whoosh();
        break;
      }
      case 'arrow': {
        // III: two arrows. IV: pierce everything. Frostbow combo: arrows chill.
        const count = w.tier >= 2 ? 2 : 1;
        const pierce = w.tier >= 3 ? 99 : def.count;
        const chill = this.combos.has('frostbow') ? 1.5 : 0;
        for (let i = 0; i < count; i++) {
          const a = aim + (i - (count - 1) / 2) * 0.08;
          this.addShot(w, 'arrow', a, def.speed, range / def.speed, 9, pierce, false, { chill });
        }
        this.sfx.shoot('star');
        break;
      }
      case 'sweep': {
        // III: kills heal. IV: a much wider sweep. Reaper combo: kills leave poison.
        const r = range * (w.tier >= 3 ? 1.4 : 1);
        const killed: Enemy[] = [];
        for (const e of this.enemies) {
          if (!e.alive || e.appear < 1) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > r + e.r) continue;
          const roll = this.roll(w);
          this.damageEnemy(e, roll.damage, roll.crit, (dx / (d || 1)) * def.knockback, (dy / (d || 1)) * def.knockback);
          if (!e.alive) killed.push(e);
        }
        if (w.tier >= 2 && killed.length > 0) this.healPlayer(Math.min(2, killed.length));
        if (this.combos.has('reaper')) {
          for (const e of killed.slice(0, 2)) this.addPuddle(e.x, e.y, 55, Math.max(1, Math.round(this.roll(w).damage * 0.25)), 2.5);
        }
        this.swings.push({ x: p.x, y: p.y - 20, angle: aim, radius: r, life: 0.28, maxLife: 0.28, color: def.color, half: Math.PI });
        this.sfx.slash();
        break;
      }
      case 'thrust': {
        // III: longer reach. IV: three stabs in a fan. Lance combo: even longer.
        const len = range * (w.tier >= 2 ? 1.35 : 1) * (this.combos.has('lance') ? 1.3 : 1);
        const a0 = Math.atan2(target.y - p.y, target.x - p.x);
        const spread = w.tier >= 3 ? [-0.45, 0, 0.45] : [0];
        const struck = new Set<Enemy>();
        for (const off of spread) {
          const a = a0 + off;
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          for (const e of this.enemies) {
            if (!e.alive || e.appear < 1 || struck.has(e)) continue;
            const dx = e.x - p.x;
            const dy = e.y - p.y;
            const along = dx * cx + dy * cy;
            const across = Math.abs(-dx * cy + dy * cx);
            if (along < -10 || along > len + e.r || across > 24 + e.r) continue;
            struck.add(e);
            const roll = this.roll(w);
            this.damageEnemy(e, roll.damage, roll.crit, cx * def.knockback, cy * def.knockback);
          }
          this.thrusts.push({ x: p.x, y: p.y - 22, angle: a, len, life: 0.18, maxLife: 0.18, color: def.color });
        }
        this.sfx.slash();
        break;
      }
      case 'frost': {
        // III: a longer chill. IV: the shard bursts on impact.
        this.addShot(w, 'ice', aim, def.speed, range / def.speed, 10, 0, false, {
          chill: w.tier >= 2 ? 3 : 1.5,
          splash: w.tier >= 3 ? 60 : 0,
        });
        this.sfx.shoot('bubble');
        break;
      }
      case 'lob': {
        // III: bigger, longer puddles. IV: two flasks. Toxic wind combo: even bigger puddles.
        const radius = 70 * (w.tier >= 2 ? 1.3 : 1) * (this.combos.has('toxicwind') ? 1.4 : 1);
        const targets = [target];
        if (w.tier >= 3) {
          const second = this.nearestEnemy(target.x, target.y, 320, [target]);
          if (second) targets.push(second);
        }
        for (const t of targets) {
          const dx = t.x - w.x;
          const dy = t.y - w.y;
          const d = Math.max(40, Math.hypot(dx, dy));
          this.addShot(w, 'flask', Math.atan2(dy, dx), def.speed, d / def.speed, 9, 0, false, { puddle: radius });
        }
        this.sfx.shoot('fire');
        break;
      }
      case 'orbit':
        break;
    }
  }

  /** Stars circling the player; each monster can only be hit again after the weapon's cooldown. */
  private updateOrbit(w: WeaponState, dt: number, radius: number): void {
    const p = this.player;
    const stats = this.run.stats;
    const count = w.def.count + (w.tier >= 2 ? 1 : 0) + (w.tier >= 3 ? 1 : 0) + (this.combos.has('guardian') ? 1 : 0);
    const r = radius * (w.tier >= 3 ? 1.25 : 1);
    w.spin += w.def.speed * dt;
    const gap = w.def.cooldown * TIER_COOLDOWN[w.tier] * cooldownMultiplier(stats);
    for (const [id, t] of w.hits) {
      if (t - dt <= 0) w.hits.delete(id);
      else w.hits.set(id, t - dt);
    }
    w.orbs.length = 0;
    for (let i = 0; i < count; i++) {
      const a = w.spin + (i / count) * Math.PI * 2;
      const ox = p.x + Math.cos(a) * r;
      const oy = p.y - 30 + Math.sin(a) * r * 0.8;
      w.orbs.push({ x: ox, y: oy });
      for (const e of this.enemies) {
        if (!e.alive || e.appear < 1 || w.hits.has(e.id)) continue;
        const dx = e.x - ox;
        const dy = e.y - e.r * 0.5 - oy;
        if (dx * dx + dy * dy > (e.r + 14) * (e.r + 14)) continue;
        w.hits.set(e.id, gap);
        const roll = this.roll(w);
        const d = Math.hypot(dx, dy) || 1;
        this.damageEnemy(e, roll.damage, roll.crit, (dx / d) * w.def.knockback, (dy / d) * w.def.knockback);
        // Starbook combo: a star sometimes sparks off a tome fireball.
        const tome = this.combos.has('starbook') ? this.weapons.find((x) => x.def.id === 'tome') : undefined;
        if (tome && this.rng.chance(0.2)) this.fireTome(tome, Math.atan2(dy, dx), tome.def.range, true);
      }
    }
  }

  private addPuddle(x: number, y: number, r: number, damage: number, duration: number): void {
    if (this.puddles.length > 24) this.puddles.shift();
    this.puddles.push({ x, y, r, t: duration, max: duration, tick: 0.1, damage });
  }

  private updatePuddles(dt: number): void {
    for (const pd of this.puddles) {
      pd.t -= dt;
      pd.tick -= dt;
      if (pd.tick > 0) continue;
      pd.tick += 0.5;
      for (const e of this.enemies) {
        if (!e.alive || e.appear < 1) continue;
        const dx = e.x - pd.x;
        const dy = (e.y - pd.y) * 1.6;
        if (dx * dx + dy * dy > (pd.r + e.r * 0.6) * (pd.r + e.r * 0.6)) continue;
        e.poison = 0.8;
        this.damageEnemy(e, pd.damage, false, 0, 0);
      }
    }
    this.puddles = this.puddles.filter((pd) => pd.t > 0);
  }

  /** Static orb item: every few seconds a bolt strikes the nearest monster. */
  private updateStatic(dt: number): void {
    const n = this.itemCount('orb');
    if (n === 0) return;
    this.staticT -= dt;
    if (this.staticT > 0) return;
    this.staticT = STATIC_INTERVAL;
    const p = this.player;
    const e = this.nearestEnemy(p.x, p.y, 520);
    if (!e) return;
    this.damageEnemy(e, 15 * n, false, 0, 0);
    this.lightning.push({ points: [p.x, p.y - 60, e.x, e.y - e.r * 0.5], life: 0.2, maxLife: 0.2 });
    this.sfx.zap();
  }

  private itemCount(id: string): number {
    return this.run.items.get(id) ?? 0;
  }

  healPlayer(amount: number): void {
    const p = this.player;
    const max = this.run.stats.maxHp;
    if (p.hp <= 0 || p.hp >= max) return;
    p.hp = Math.min(max, p.hp + amount);
    this.fx.text(p.x + 30, p.y - 120, `+${amount}`, '#7FE0A8', 24);
  }

  /** Tome fireballs. III: they explode. IV: two at once, and they pierce. */
  private fireTome(w: WeaponState, aim: number, range: number, single = false): void {
    const count = w.tier >= 3 && !single ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const a = aim + (i - (count - 1) / 2) * 0.5;
      this.addShot(w, 'fire', a, w.def.speed, (range / w.def.speed) * 1.6, 13, w.tier >= 3 ? 1 : 0, true, { splash: w.tier >= 2 ? 70 : 0 });
    }
  }

  /** Half-damage blast around a point, skipping monsters already hit. */
  private splash(x: number, y: number, radius: number, dmg: number, skip: readonly Enemy[], color: string): void {
    const damage = Math.max(1, Math.round(dmg));
    for (const e of this.enemies) {
      if (!e.alive || e.appear < 1 || skip.includes(e)) continue;
      const dx = e.x - x;
      const dy = e.y - e.r * 0.45 - y;
      if (dx * dx + dy * dy > (radius + e.r) * (radius + e.r)) continue;
      this.damageEnemy(e, damage, false, 0, 0);
    }
    this.waves.push({ x, y, radius, life: 0.25, maxLife: 0.25, color });
  }

  private addShot(
    w: WeaponState,
    kind: ShotKind,
    angle: number,
    speed: number,
    life: number,
    r: number,
    pierce: number,
    homing: boolean,
    opts: ShotOpts = {},
  ): void {
    const roll = this.roll(w);
    this.shots.push({
      kind,
      x: w.x,
      y: w.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r,
      damage: roll.damage,
      crit: roll.crit,
      life,
      maxLife: life,
      pierce,
      chill: opts.chill ?? 0,
      puddle: opts.puddle ?? 0,
      hit: [],
      homing,
      knockback: w.def.knockback,
      splash: opts.splash ?? 0,
      zap: opts.zap ?? 0,
    });
  }

  private roll(w: WeaponState): { damage: number; crit: boolean } {
    const stats = this.run.stats;
    let dmg = w.def.damage * TIER_DAMAGE[w.tier] * damageMultiplier(stats, w.def.cls);
    // Weapons that fit the character's class hit harder.
    if (fitsClass(this.run.character.cls, w.def.id)) {
      dmg *= 1 + CLASS_WEAPON_BONUS + RESONANCE_BONUS * this.run.blessingCount('resonance');
    }
    // Twin blades combo: the scythe and the spear crit more often.
    const twin = this.combos.has('twinblade') && (w.def.id === 'scythe' || w.def.id === 'spear') ? 0.15 : 0;
    const crit = this.rng.next() < critChance(stats) + twin;
    if (crit) dmg *= 2;
    return { damage: Math.max(1, Math.round(dmg)), crit };
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      if (s.homing) {
        const t = this.nearestEnemy(s.x, s.y, 420);
        if (t) {
          const speed = Math.hypot(s.vx, s.vy);
          const cur = Math.atan2(s.vy, s.vx);
          const want = Math.atan2(t.y - t.r * 0.5 - s.y, t.x - s.x);
          const turn = clamp(angleDiff(want, cur), -5 * dt, 5 * dt);
          s.vx = Math.cos(cur + turn) * speed;
          s.vy = Math.sin(cur + turn) * speed;
        }
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.x < L.ARENA.x || s.x > L.ARENA_RIGHT || s.y < L.ARENA.y || s.y > L.ARENA_BOTTOM) s.life = 0;
      if (s.puddle > 0) {
        // A flask flies over monsters and shatters where it lands.
        if (s.life <= 0) {
          this.addPuddle(s.x, s.y + 20, s.puddle, s.damage, s.puddle > 80 ? 4.5 : 3.2);
          this.fx.burst(s.x, s.y + 10, '#B6F25A', 10, 260, 6, 0.35);
          this.fx.shatter(s.x, s.y + 10, '#9AD86A', 5, 300);
        }
        continue;
      }
      if (s.life <= 0) continue;
      for (const e of this.enemies) {
        if (!e.alive || e.appear < 1 || s.hit.includes(e.id)) continue;
        const dx = e.x - s.x;
        const dy = e.y - e.r * 0.45 - s.y;
        if (dx * dx + dy * dy > (e.r + s.r) * (e.r + s.r)) continue;
        const sp = Math.hypot(s.vx, s.vy) || 1;
        // Acid combo: bubbles hurt poisoned monsters more.
        const acid = s.kind === 'bubble' && this.combos.has('acid') && e.poison > 0 ? 1.5 : 1;
        if (s.chill > 0) e.slow = Math.max(e.slow, s.chill);
        this.damageEnemy(e, Math.round(s.damage * acid), s.crit, (s.vx / sp) * s.knockback, (s.vy / sp) * s.knockback);
        s.hit.push(e.id);
        if (s.splash > 0) this.splash(s.x, s.y, s.splash, s.damage * 0.5, [e], SHOT_COLORS[s.kind]);
        if (s.zap > 0 && this.rng.chance(s.zap)) {
          const next = this.nearestEnemy(e.x, e.y, CHAIN_JUMP, [e]);
          if (next) {
            this.damageEnemy(next, s.damage, false, 0, 0);
            this.lightning.push({ points: [e.x, e.y - e.r * 0.5, next.x, next.y - next.r * 0.5], life: 0.15, maxLife: 0.15 });
          }
        }
        if (s.pierce > 0) {
          s.pierce--;
        } else {
          s.life = 0;
          break;
        }
      }
      if (s.life <= 0 && s.kind === 'bubble') this.fx.burst(s.x, s.y, palette.slimeSky, 4, 120, 5, 0.25);
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  /** Returns true if the player died. */
  private updateBullets(dt: number): boolean {
    const p = this.player;
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < L.ARENA.x - 20 || b.x > L.ARENA_RIGHT + 20 || b.y < L.ARENA.y - 20 || b.y > L.ARENA_BOTTOM + 20) b.life = 0;
      if (b.life <= 0) continue;
      const dx = p.x - b.x;
      const dy = p.y - 30 - b.y;
      const reach = config.playerRadius * 0.8 + b.r;
      if (dx * dx + dy * dy < reach * reach) {
        b.life = 0;
        this.hurtPlayer(b.damage);
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    return p.hp <= 0;
  }

  // ---- Damage ----

  private damageEnemy(e: Enemy, dmg: number, crit: boolean, kx: number, ky: number): void {
    if (!e.alive) return;
    if (e.affix === 'armored') {
      dmg = Math.max(1, Math.round(dmg * ARMOR_TAKEN));
      this.fx.spark(e.x, e.y - e.r * 0.6, kx || e.x - this.player.x, ky || e.y - this.player.y, '#FFD36B', 3, 320, 0.2);
    }
    e.hp -= dmg;
    e.flash = 1;
    e.pulse = 1;
    e.shake = 0.12;
    // Knockback grows with how big the hit was compared to the monster.
    const resist =
      e.def.boss || e.def.heavy || e.def.behavior === 'still' || e.affix === 'armored' ? 0 : e.phase === 'dash' ? 0.3 : e.elite ? 0.5 : 1;
    const weight = config.knockbackScale * (1 + Math.min(1, dmg / Math.max(1, e.maxHp)) * 0.6);
    e.kx += kx * resist * weight;
    e.ky += ky * resist * weight;
    // Jelly flies off in the direction of the hit.
    let dx = kx;
    let dy = ky;
    if (dx === 0 && dy === 0) {
      dx = e.x - this.player.x;
      dy = e.y - this.player.y;
    }
    const dl = Math.hypot(dx, dy) || 1;
    this.fx.splat(e.x, e.y - e.r * 0.5, dx / dl, dy / dl, e.color, crit ? 7 : 4);
    this.fx.impact(e.x + this.rng.range(-8, 8), e.y - e.r * 0.6, crit ? 26 : 16);
    this.fx.text(e.x + this.rng.range(-12, 12), e.y - e.r - 16, crit ? `${dmg}!` : String(dmg), crit ? '#FFD25E' : '#FFFFFF', crit ? 40 : 28);
    if (crit) this.sfx.crit();
    this.sfx.hit();
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    e.alive = false;
    const def = e.def;
    if (def.behavior !== 'still') {
      // Vampire fang: a chance to heal on every kill.
      // The blood pact blessing works the same way.
      const heal = 0.1 * this.itemCount('fang') + BLOODPACT_CHANCE * this.run.blessingCount('bloodpact');
      if (this.rng.chance(heal)) this.healPlayer(1);
      this.run.kills++;
      this.energy = Math.min(SKILL_MAX, this.energy + config.skillChargePerKill);
    }
    this.fx.poof(e.x, e.y - e.r * 0.6, e.color);
    this.fx.splat(e.x, e.y - e.r * 0.5, 0, -1, e.color, 6);
    this.fx.ring(e.x, e.y - e.r * 0.6, '#FFFFFF', e.r * 1.6);
    this.fx.shatter(e.x, e.y - e.r * 0.6, e.color, def.boss ? 30 : e.elite ? 16 : 6, def.boss ? 760 : 500);
    this.fx.soul(e.x, e.y - e.r, e.elite || def.boss ? '#FFD9E4' : '#EDE2FF');
    if (e.elite) this.fx.burst(e.x, e.y - e.r * 0.6, palette.goldLight, 14, 380, 7, 0.5);
    if (def.boss) this.groundCrack(e.x, e.y + e.r * 0.3, e.r * 1.6);
    if (e.affix === 'volatile') {
      this.delayedBlast(e.x, e.y, BLAST_RADIUS, BLAST_DELAY, e.damage + 2, '#FF8A3D');
    }
    if (def.behavior !== 'still') this.addDecal(e.x, e.y + e.r * 0.3, e.r * 1.1, e.color);
    this.sfx.kill();
    // Only big kills freeze the frame; ordinary ones would stutter in a crowd.
    if (def.boss) this.stop(0.15, true);
    else if (e.elite) this.stop(0.04);
    if (e.elite && config.shake) this.fx.addShake(3);
    let drops = def.drops * (e.elite ? 3 : 1) + (e.elite ? 2 : 0);
    if (this.rng.chance(clamp(this.run.stats.luck, 0, 100) / 200)) drops++;
    for (let i = 0; i < drops; i++) this.drop('shard', e.x, e.y);
    if (this.rng.chance(e.elite ? 0.5 : def.candy)) this.drop('candy', e.x, e.y);
    const eliteChest = e.elite && this.eliteChests < ELITE_CHESTS_PER_WAVE && this.rng.chance(0.35);
    if (eliteChest) this.eliteChests++;
    if (def.chest || eliteChest) {
      this.drop('chest', e.x, e.y);
      this.fx.text(e.x, e.y - e.r - 30, '掉了宝箱！', palette.goldLight, 30);
    }
    if (def.split) {
      const child = enemyById(def.split.id);
      for (let i = 0; i < def.split.count; i++) {
        const a = (i / def.split.count) * Math.PI * 2 + this.rng.range(0, 1);
        const c = this.spawnEnemy(child, e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18, 0.5);
        c.kx = Math.cos(a) * 320;
        c.ky = Math.sin(a) * 320;
      }
    }
    if (def.boss && config.shake) this.fx.addShake(14);
  }

  private drop(kind: DropKind, x: number, y: number): void {
    const a = this.rng.range(0, Math.PI * 2);
    const s = this.rng.range(80, 220);
    this.drops.push({ kind, x, y: y - 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, magnet: false, alive: true, seed: this.rng.next() * 10 });
  }

  hurtPlayer(raw: number): void {
    const p = this.player;
    if (p.invuln > 0 || p.hp <= 0) return;
    const stats = this.run.stats;
    if (this.rng.next() < dodgeChance(stats)) {
      p.invuln = 0.35;
      this.fx.text(p.x, p.y - 120, '闪避', '#8FE3D9', 26);
      this.sfx.dodge();
      return;
    }
    const dmg = damageTaken(raw, stats.armor);
    p.hp -= dmg;
    p.invuln = config.invulnTime;
    p.hurt = 1;
    this.fx.text(p.x, p.y - 120, `-${dmg}`, palette.danger, 34);
    if (config.shake) this.fx.addShake(5);
    this.stop(0.05);
    this.sfx.hurt();
    // Thorn ring: getting hit hurts every monster close by.
    const thorns = this.itemCount('thornring');
    if (thorns > 0) {
      for (const e of this.enemies) {
        if (e.alive && e.appear >= 1 && Math.hypot(e.x - p.x, e.y - p.y) < 130) this.damageEnemy(e, 10 * thorns, false, 0, 0);
      }
      this.waves.push({ x: p.x, y: p.y - 20, radius: 130, life: 0.3, maxLife: 0.3, color: '#7CCB8E' });
    }
    if (p.hp <= 0 && this.run.character.special === 'lastStand' && !this.run.lastStandUsed) {
      this.run.lastStandUsed = true;
      p.hp = 1;
      p.invuln = 1.5;
      this.fx.text(p.x, p.y - 160, '龙之加护！', palette.goldLight, 34);
      this.waves.push({ x: p.x, y: p.y - 30, radius: 160, life: 0.5, maxLife: 0.5, color: palette.goldLight });
    }
    // Phoenix feather: burns up to save you from a lethal hit.
    if (p.hp <= 0 && this.itemCount('feather') > 0) {
      this.run.consumeItem('feather');
      p.hp = Math.max(1, Math.round(this.run.stats.maxHp * 0.5));
      p.invuln = 2;
      this.fx.text(p.x, p.y - 160, '凤凰涅槃！', '#FFB36B', 34);
      this.fx.burst(p.x, p.y - 40, '#FFB36B', 24, 420, 8, 0.6);
      this.waves.push({ x: p.x, y: p.y - 30, radius: 200, life: 0.6, maxLife: 0.6, color: '#FF8A3D' });
    }
  }

  // ---- Active skill ----

  /** Releases the character's skill. The caller checks and spends the energy. */
  castSkill(kind: SkillKind): void {
    const p = this.player;
    const stats = this.run.stats;
    const power = this.skillPower();
    switch (kind) {
      case 'sanctuary': {
        const heal = Math.round(stats.maxHp * 0.4);
        p.hp = Math.min(stats.maxHp, p.hp + heal);
        p.invuln = Math.max(p.invuln, 3);
        this.fx.text(p.x, p.y - 150, `+${heal}`, '#7FE0A8', 34);
        this.blast(p.x, p.y - 20, 320, 20 * power, 800);
        this.waves.push({ x: p.x, y: p.y - 30, radius: 320, life: 0.6, maxLife: 0.6, color: palette.goldLight });
        this.waves.push({ x: p.x, y: p.y - 30, radius: 200, life: 0.45, maxLife: 0.45, color: '#FFFFFF' });
        this.fx.burst(p.x, p.y - 40, palette.goldLight, 30, 420, 8, 0.7);
        this.stop(0.06, true);
        break;
      }
      case 'thunderstorm':
        for (let i = 0; i < 10; i++) this.skill.strikes.push(0.1 + i * 0.13);
        break;
      case 'judgment': {
        const melee = Math.max(0.1, 1 + stats.meleeDamage / 100);
        this.blast(p.x, p.y - 20, 300, 45 * power * melee, 950);
        for (let i = 0; i < 3; i++) {
          this.swings.push({ x: p.x, y: p.y - 20, angle: (i * Math.PI * 2) / 3, radius: 300, life: 0.35, maxLife: 0.35, color: palette.gold });
        }
        this.waves.push({ x: p.x, y: p.y - 20, radius: 300, life: 0.5, maxLife: 0.5, color: palette.gold });
        if (config.shake) this.fx.addShake(10);
        this.stop(0.08, true);
        this.sfx.slam();
        break;
      }
      case 'fireRing':
        this.skill.ringT = RING_TIME;
        this.skill.ringHits.clear();
        break;
      case 'gale': {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > 820) continue;
          const push = e.def.boss ? 120 : 1100 * (1 - d / 1000);
          e.kx += (dx / d) * push;
          e.ky += (dy / d) * push;
          e.slow = 4;
        }
        for (const b of this.bullets) this.fx.burst(b.x, b.y, '#BFF2EC', 3, 160, 5, 0.3);
        this.bullets = [];
        this.waves.push({ x: p.x, y: p.y - 20, radius: 760, life: 0.7, maxLife: 0.7, color: '#8FE3D9' });
        this.waves.push({ x: p.x, y: p.y - 20, radius: 420, life: 0.5, maxLife: 0.5, color: '#FFFFFF' });
        this.stop(0.06, true);
        break;
      }
      case 'whale': {
        const target = this.densestPoint();
        this.skill.whale = { x: target.x, y: target.y, t: WHALE_DROP, max: WHALE_DROP };
        break;
      }
    }
  }

  private updateSkill(dt: number): void {
    const s = this.skill;
    const p = this.player;

    s.orbs.length = 0;
    if (s.ringT > 0) {
      s.ringT -= dt;
      s.ringAngle += dt * 4;
      for (const [id, cd] of s.ringHits) {
        if (cd - dt <= 0) s.ringHits.delete(id);
        else s.ringHits.set(id, cd - dt);
      }
      const dmg = Math.max(1, Math.round(9 * this.skillPower()));
      for (let i = 0; i < RING_ORBS; i++) {
        const a = s.ringAngle + (i * Math.PI * 2) / RING_ORBS;
        const ox = p.x + Math.cos(a) * RING_RADIUS;
        const oy = p.y - 30 + Math.sin(a) * RING_RADIUS * 0.8;
        s.orbs.push({ x: ox, y: oy });
        for (const e of [...this.enemies]) {
          if (!e.alive || s.ringHits.has(e.id)) continue;
          const dx = e.x - ox;
          const dy = e.y - e.r * 0.45 - oy;
          if (dx * dx + dy * dy > (e.r + 16) * (e.r + 16)) continue;
          s.ringHits.set(e.id, RING_HIT_GAP);
          this.damageEnemy(e, dmg, false, dx * 3, dy * 3);
        }
      }
    }

    for (let i = s.strikes.length - 1; i >= 0; i--) {
      s.strikes[i] -= dt;
      if (s.strikes[i] > 0) continue;
      s.strikes.splice(i, 1);
      this.lightningStrike();
    }

    const wh = s.whale;
    if (wh) {
      wh.t -= dt;
      if (wh.t <= 0) {
        s.whale = null;
        this.blast(wh.x, wh.y, WHALE_RADIUS, 60 * this.skillPower(), 700);
        const stats = this.run.stats;
        const heal = Math.round(stats.maxHp * 0.2);
        p.hp = Math.min(stats.maxHp, p.hp + heal);
        this.fx.text(p.x, p.y - 150, `+${heal}`, '#7FE0A8', 32);
        this.waves.push({ x: wh.x, y: wh.y, radius: WHALE_RADIUS, life: 0.6, maxLife: 0.6, color: '#8FC8FF' });
        this.waves.push({ x: wh.x, y: wh.y, radius: WHALE_RADIUS * 0.6, life: 0.45, maxLife: 0.45, color: '#FFFFFF' });
        this.fx.burst(wh.x, wh.y, '#8FC8FF', 40, 520, 9, 0.7);
        this.fx.burst(wh.x, wh.y, '#FFFFFF', 20, 380, 7, 0.5);
        if (config.shake) this.fx.addShake(12);
        this.stop(0.08, true);
        this.sfx.boom();
      }
    }
  }

  /** One bolt of the thunderstorm: hits a random monster near the player, with a small splash. */
  private lightningStrike(): void {
    const p = this.player;
    const near = this.enemies.filter((e) => e.alive && e.appear >= 1 && Math.hypot(e.x - p.x, e.y - p.y) < 650);
    if (near.length === 0) return;
    const target = near[this.rng.int(0, near.length - 1)];
    const x = target.x;
    const y = target.y - target.r * 0.5;
    this.lightning.push({
      points: [x + this.rng.range(-60, 60), y - 560, x + this.rng.range(-30, 30), y - 280, x, y],
      life: 0.25,
      maxLife: 0.25,
    });
    this.blast(x, y, 70, 18 * this.skillPower(), 120);
    this.waves.push({ x, y, radius: 70, life: 0.3, maxLife: 0.3, color: '#B48CFF' });
    this.sfx.zap();
  }

  /** The monster with the most other monsters around it; falls back to just ahead of the player. */
  private densestPoint(): { x: number; y: number } {
    let best: Enemy | null = null;
    let bestCount = -1;
    for (const a of this.enemies) {
      if (!a.alive || a.def.behavior === 'still') continue;
      let count = 0;
      for (const b of this.enemies) {
        if (b.alive && Math.hypot(a.x - b.x, a.y - b.y) < 200) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        best = a;
      }
    }
    if (best) return { x: best.x, y: best.y };
    return { x: this.player.x + this.player.facing * 160, y: this.player.y - 40 };
  }

  /** Damages and knocks back every monster within a radius. */
  private blast(x: number, y: number, radius: number, damage: number, knock: number): void {
    const dmg = Math.max(1, Math.round(damage));
    // Copy: kills can split monsters and add new ones mid-loop.
    for (const e of [...this.enemies]) {
      if (!e.alive) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > radius + e.r) continue;
      const k = knock * (1 - Math.min(1, d / (radius * 1.4)));
      this.damageEnemy(e, dmg, false, (dx / (d || 1)) * k, (dy / (d || 1)) * k);
    }
  }

  /** Skill damage scales with the damage stat and with the wave number. */
  private skillPower(): number {
    const stats = this.run.stats;
    return Math.max(0.2, 1 + stats.damage / 100) * (1 + config.skillWaveScaling * (this.run.wave - 1));
  }

  // ---- Drops ----

  private updateDrops(dt: number, homeward: boolean): void {
    const p = this.player;
    const reach = config.basePickup + this.run.stats.pickup;
    const damp = Math.exp(-dt * 5);
    for (const s of this.drops) {
      if (!s.alive) continue;
      const dx = p.x - s.x;
      const dy = p.y - 40 - s.y;
      const d = Math.hypot(dx, dy) || 1;
      // Candy and chests only fly in once the player is close, so healing can be saved for later.
      const pull = s.kind === 'shard' ? reach : 60;
      if (homeward || d < pull) s.magnet = true;
      if (s.magnet) {
        const speed = homeward ? 1400 : 900;
        s.vx = (dx / d) * speed;
        s.vy = (dy / d) * speed;
      } else {
        s.vx *= damp;
        s.vy *= damp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (d < 30) this.collect(s);
    }
    if (this.drops.some((s) => !s.alive)) this.drops = this.drops.filter((s) => s.alive);
  }

  private collect(s: Drop): void {
    s.alive = false;
    const p = this.player;
    if (s.kind === 'candy') {
      const max = this.run.stats.maxHp;
      const healed = Math.min(CANDY_HEAL, max - p.hp);
      p.hp = Math.min(max, p.hp + CANDY_HEAL);
      this.fx.text(p.x, p.y - 140, healed > 0 ? `+${Math.ceil(healed)}` : '满血', '#7FE0A8', 30);
      this.sfx.buy();
      return;
    }
    if (s.kind === 'chest') {
      this.run.chests++;
      this.fx.text(p.x, p.y - 150, '宝箱 +1', palette.goldLight, 32);
      this.sfx.levelUp();
      return;
    }
    const levels = this.run.collectShards(1);
    if (levels > 0) {
      this.fx.text(p.x, p.y - 150, '升级！', palette.goldLight, 34);
      this.waves.push({ x: p.x, y: p.y - 30, radius: 120, life: 0.45, maxLife: 0.45, color: palette.goldLight });
      this.sfx.levelUp();
    } else {
      this.sfx.pickup();
    }
  }

  private beginEnding(): void {
    this.ending = ENDING_TIME;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.alive = false;
      this.fx.poof(e.x, e.y - e.r * 0.6, e.color);
    }
    this.enemies = [];
    this.spawns = [];
    this.bullets = [];
    this.zones = [];
    this.sfx.waveEnd();
  }

  // ---- Helpers ----

  private updateEffects(dt: number): void {
    for (const s of this.swings) s.life -= dt;
    for (const l of this.lightning) l.life -= dt;
    for (const w of this.waves) w.life -= dt;
    for (const th of this.thrusts) th.life -= dt;
    this.thrusts = this.thrusts.filter((th) => th.life > 0);
    for (const z of this.zones) z.t -= dt;
    for (const b of this.blasts) {
      b.t -= dt;
      if (b.t <= 0) this.explode(b.x, b.y, b.damage, b.r, b.color);
    }
    this.blasts = this.blasts.filter((b) => b.t > 0);
    for (const d of this.decals) d.life -= dt;
    this.swings = this.swings.filter((s) => s.life > 0);
    this.lightning = this.lightning.filter((l) => l.life > 0);
    this.waves = this.waves.filter((w) => w.life > 0);
    this.zones = this.zones.filter((z) => z.t > 0);
    this.decals = this.decals.filter((d) => d.life > 0);
  }

  /** A red warning circle now, an explosion after delay seconds. */
  delayedBlast(x: number, y: number, r: number, delay: number, damage: number, color: string): void {
    this.blasts.push({ x, y, t: delay, damage, r, color });
    this.addZone({ kind: 'circle', x, y, r, x2: 0, y2: 0, t: delay, max: delay });
    this.sfx.warn();
  }

  /** A delayed blast going off: hurts the player if they didn't get clear. */
  private explode(x: number, y: number, damage: number, r: number, color: string): void {
    const p = this.player;
    this.waves.push({ x, y, radius: r, life: 0.35, maxLife: 0.35, color });
    this.fx.burst(x, y - 20, color, 22, 460, 8, 0.45);
    this.fx.ring(x, y - 10, '#FFFFFF', r * 0.5);
    if (config.shake) this.fx.addShake(4);
    this.sfx.boom();
    if (this.ending <= 0 && L.inGroundCircle(p.x, p.y, x, y, r, config.playerRadius * 0.5)) this.hurtPlayer(damage);
  }

  private nearestEnemy(x: number, y: number, range: number, exclude?: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (!e.alive || e.appear < 1) continue;
      if (exclude && exclude.includes(e)) continue;
      const dx = e.x - x;
      const dy = e.y - e.r * 0.4 - y;
      // Neutral buds only get shot when nothing hostile is closer.
      const penalty = e.def.behavior === 'still' ? 160 * 160 : 0;
      const d = dx * dx + dy * dy - e.r * e.r + penalty;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }
}

function pickWeighted(pool: EnemyDef[], r: number): EnemyDef {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let acc = 0;
  for (const e of pool) {
    acc += e.weight / total;
    if (r < acc) return e;
  }
  return pool[pool.length - 1];
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function lookColor(def: EnemyDef, id: number): string {
  switch (def.look) {
    case 'slime': {
      const colors = [palette.slimeLilac, palette.slimePink, palette.slimeSky];
      return colors[id % colors.length];
    }
    case 'imp':
      return palette.imp;
    case 'mushroom':
      return palette.mushroom;
    case 'knight':
      return palette.knight;
    case 'bunny':
      return palette.bunny;
    case 'twin':
      return palette.twinA;
    case 'cat':
      return palette.cat;
    case 'bud':
      return palette.bud;
    case 'king':
      return palette.king;
    case 'darkKnight':
      return palette.darkKnight;
    case 'queen':
      return palette.queen;
    case 'leech':
      return palette.leech;
    case 'frog':
      return palette.frog;
    case 'wisp':
      return palette.wisp;
    case 'golem':
      return palette.golem;
    case 'toad':
      return palette.toad;
  }
}
