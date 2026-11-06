import { clamp, lerp } from '../engine/math';
import type { Rng } from '../engine/rng';
import type { Sfx } from './audio';
import { newBrain, updateBoss, type BossBrain } from './boss';
import { config } from './config';
import type { SkillKind } from './data/characters';
import { BOSS_BY_WAVE, ENEMIES, enemyById, type EnemyDef } from './data/enemies';
import { TIER_COOLDOWN, TIER_DAMAGE, weaponById, type WeaponDef } from './data/weapons';
import type { Fx } from './fx';
import * as L from './layout';
import { palette } from './palette';
import type { Run } from './run';
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
  /** Seconds of slowdown left (from the gale skill). */
  slow: number;
  /** Elite variant: bigger, tougher, glowing red eyes, better loot. */
  elite: boolean;
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
}

export type ShotKind = 'star' | 'bubble' | 'fire';

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
  pierce: number;
  hit: number[];
  homing: boolean;
  knockback: number;
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
const ENDING_TIME = 0.9;
const CANDY_HEAL = 3;
const BUDS_PER_WAVE = 2;
const THIEF_CHANCE = 0.55;

/** One wave of combat. Owns every moving thing in the arena. */
export class World {
  readonly player: Player = { x: L.ARENA_CX, y: L.ARENA_CY, hp: 1, facing: 1, moving: false, invuln: 0, hurt: 0 };
  enemies: Enemy[] = [];
  spawns: SpawnMark[] = [];
  shots: Shot[] = [];
  bullets: Bullet[] = [];
  drops: Drop[] = [];
  weapons: WeaponState[] = [];
  swings: Swing[] = [];
  lightning: Lightning[] = [];
  waves: Wave[] = [];
  boss: Enemy | null = null;
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
  private lastStopAt = -1;
  private spawnT = 0;
  /** Seconds into the wave when the thief shows up, or -1 for none. */
  private thiefAt = -1;
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
    this.lastStopAt = -1;
    this.boss = null;
    this.elapsed = 0;
    this.ending = 0;
    this.spawnT = 1;
    this.energy = config.skillStartEnergy;
    this.skill.ringT = 0;
    this.skill.orbs = [];
    this.skill.ringHits.clear();
    this.skill.strikes = [];
    this.skill.whale = null;
    this.duration = config.waveDurations[run.wave - 1] ?? 30;
    this.weapons = run.weapons.map((w) => ({ def: weaponById(w.id), tier: w.tier, cd: 0.4, angle: -Math.PI / 2, kick: 0, x: p.x, y: p.y }));
    const bossId = BOSS_BY_WAVE[run.wave];
    if (bossId) this.mark(enemyById(bossId), p.x, clamp(p.y - 420, L.ARENA.y + 120, L.ARENA_BOTTOM - 120));
    for (let i = 0; i < BUDS_PER_WAVE; i++) {
      const pt = this.spawnPoint(260, 900);
      this.spawnEnemy(enemyById('bud'), pt.x, pt.y);
    }
    const timed = this.duration > 0;
    this.thiefAt = timed && run.wave >= 2 && this.rng.chance(THIEF_CHANCE) ? this.rng.range(4, Math.max(5, this.duration - 10)) : -1;
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
    if (this.updateBullets(dt)) return 'playerDied';
    this.updateDrops(dt, false);
    if (p.hp <= 0) return 'playerDied';

    const timedOut = this.duration > 0 && this.elapsed >= this.duration;
    const bossDown = this.duration === 0 && this.boss !== null && !this.boss.alive;
    if (timedOut || bossDown) this.beginEnding();
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
    }

    if (this.thiefAt >= 0 && this.elapsed >= this.thiefAt) {
      this.thiefAt = -1;
      const pt = this.spawnPoint();
      this.mark(enemyById('thief'), pt.x, pt.y);
    }

    const wave = this.run.wave;
    // Spawning stops a moment before the timer runs out.
    if (this.duration > 0 && this.elapsed > this.duration - 1.5) return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const t = (wave - 1) / Math.max(1, config.waveCount - 1);
    const bossWave = this.duration === 0;
    this.spawnT += lerp(config.spawnIntervalFirst, config.spawnIntervalLast, t) * (bossWave ? 1.8 : 1);
    if (this.enemies.length + this.spawns.length >= config.maxEnemies) return;

    const pool = ENEMIES.filter((e) => e.weight > 0 && e.firstWave <= wave);
    const group = this.rng.int(1, Math.min(6, 1 + Math.floor(wave / 2)));
    const center = this.spawnPoint();
    const eliteChance =
      wave >= config.eliteFirstWave ? config.eliteChance + config.eliteChancePerWave * (wave - config.eliteFirstWave) : 0;
    for (let i = 0; i < group; i++) {
      const def = pickWeighted(pool, this.rng.next());
      const x = clamp(center.x + this.rng.range(-60, 60), L.ARENA.x + 40, L.ARENA_RIGHT - 40);
      const y = clamp(center.y + this.rng.range(-60, 60), L.ARENA.y + 40, L.ARENA_BOTTOM - 40);
      this.mark(def, x, y, this.rng.chance(eliteChance));
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
    this.spawns.push({ x, y, t: config.spawnTelegraph * (def.boss ? 2 : elite ? 1.3 : 1), def, elite });
  }

  private spawnEnemy(def: EnemyDef, x: number, y: number, appear = 0, elite = false): Enemy {
    const wave = this.run.wave;
    let hp = def.boss ? def.hp : def.hp * (1 + config.enemyHpGrowth * (wave - 1));
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
      damage: def.damage > 0 ? def.damage + Math.floor((wave - 1) / config.enemyDamageEvery) + (elite ? 2 : 0) : 0,
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
      elite,
      shake: 0,
      brain: def.boss ? newBrain(def.boss) : null,
      alive: true,
    };
    this.enemies.push(e);
    if (def.boss) {
      this.boss = e;
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
  summon(x: number, y: number, count: number, elites: number): void {
    const slime = enemyById('slime');
    for (let i = 0; i < count + elites; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(110, 170);
      this.mark(slime, clamp(x + Math.cos(a) * d, L.ARENA.x + 40, L.ARENA_RIGHT - 40), clamp(y + Math.sin(a) * d, L.ARENA.y + 40, L.ARENA_BOTTOM - 40), i >= count);
    }
  }

  addDecal(x: number, y: number, r: number, color: string): void {
    if (this.decals.length > 80) this.decals.shift();
    this.decals.push({ x, y, r, color, life: 5, max: 5, seed: this.rng.next() * 10 });
  }

  /** Freeze frames. `gap` stops rapid small freezes from chaining into stutter. */
  stop(seconds: number, gap = 0): void {
    if (!config.hitStop) return;
    if (gap > 0 && this.elapsed - this.lastStopAt < gap) return;
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
      const sp = def.speed * (e.appear < 1 ? 0.3 : 1) * (e.slow > 0 ? 0.4 : 1);
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

      if (e.damage > 0 && e.appear >= 1 && d < e.r + config.playerRadius * 0.8) this.hurtPlayer(e.damage);
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
    const dmg = s.damage + Math.floor((this.run.wave - 1) / config.enemyDamageEvery);
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
    const orbit = config.weaponOrbit;
    for (let i = 0; i < n; i++) {
      const w = this.weapons[i];
      const slot = n === 1 ? -Math.PI / 4 : -Math.PI / 2 + (i * Math.PI * 2) / n;
      w.x = p.x + Math.cos(slot) * orbit;
      w.y = p.y - 34 + Math.sin(slot) * orbit * 0.8;
      w.cd -= dt;
      w.kick = Math.max(0, w.kick - dt * 5);

      const range = w.def.range + stats.range * (w.def.cls === 'melee' ? 0.5 : 1);
      const origin = w.def.cls === 'melee' ? p : w;
      const target = this.nearestEnemy(origin.x, origin.y, range);
      if (!target) continue;
      w.angle = Math.atan2(target.y - w.y, target.x - w.x);
      if (w.cd > 0) continue;
      w.cd = w.def.cooldown * TIER_COOLDOWN[w.tier] * cooldownMultiplier(stats);
      w.kick = 1;
      this.fire(w, target, range);
    }
  }

  private fire(w: WeaponState, target: Enemy, range: number): void {
    const def = w.def;
    const p = this.player;
    const aim = Math.atan2(target.y - target.r * 0.45 - w.y, target.x - w.x);
    if (def.cls === 'ranged') {
      // Muzzle flash and a little recoil.
      this.fx.ring(w.x, w.y, def.color, 9);
      this.fx.spark(w.x, w.y, Math.cos(aim), Math.sin(aim), def.color, 3, 260, 0.15);
      if (config.shake) this.fx.kick(-Math.cos(aim) * 1.5, -Math.sin(aim) * 1.5);
    } else if (config.shake) {
      // Melee swings lean the camera into the blow.
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      this.fx.kick(Math.cos(a) * 4, Math.sin(a) * 4);
    }
    switch (def.behavior) {
      case 'bolt':
        this.addShot(w, 'star', aim, def.speed, range / def.speed, 10, w.tier >= 2 ? 1 : 0, false);
        this.sfx.shoot('star');
        break;
      case 'spread': {
        const count = def.count + (w.tier >= 2 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const a = aim + (i - (count - 1) / 2) * 0.22;
          this.addShot(w, 'bubble', a, def.speed * this.rng.range(0.9, 1.1), range / def.speed, 11, 0, false);
        }
        this.sfx.shoot('bubble');
        break;
      }
      case 'homing':
        this.addShot(w, 'fire', aim, def.speed, (range / def.speed) * 1.6, 13, w.tier >= 3 ? 1 : 0, true);
        this.sfx.shoot('fire');
        break;
      case 'arc': {
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        for (const e of this.enemies) {
          if (!e.alive || e.appear < 1) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > range + e.r) continue;
          if (Math.abs(angleDiff(Math.atan2(dy, dx), a)) > ARC_HALF_ANGLE) continue;
          const roll = this.roll(w);
          this.damageEnemy(e, roll.damage, roll.crit, (dx / (d || 1)) * def.knockback, (dy / (d || 1)) * def.knockback);
        }
        this.swings.push({ x: p.x, y: p.y - 20, angle: a, radius: range, life: 0.22, maxLife: 0.22, color: def.color });
        this.sfx.slash();
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
          this.damageEnemy(e, roll.damage, roll.crit, 0, 0);
        }
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
          this.damageEnemy(e, roll.damage, roll.crit, (dx / (d || 1)) * def.knockback, (dy / (d || 1)) * def.knockback);
        }
        this.waves.push({ x: p.x, y: p.y - 20, radius: range, life: 0.35, maxLife: 0.35, color: def.color });
        this.sfx.whoosh();
        break;
      }
    }
  }

  private addShot(w: WeaponState, kind: ShotKind, angle: number, speed: number, life: number, r: number, pierce: number, homing: boolean): void {
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
      pierce,
      hit: [],
      homing,
      knockback: w.def.knockback,
    });
  }

  private roll(w: WeaponState): { damage: number; crit: boolean } {
    const stats = this.run.stats;
    let dmg = w.def.damage * TIER_DAMAGE[w.tier] * damageMultiplier(stats, w.def.cls);
    const crit = this.rng.next() < critChance(stats);
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
      if (s.life <= 0) continue;
      for (const e of this.enemies) {
        if (!e.alive || e.appear < 1 || s.hit.includes(e.id)) continue;
        const dx = e.x - s.x;
        const dy = e.y - e.r * 0.45 - s.y;
        if (dx * dx + dy * dy > (e.r + s.r) * (e.r + s.r)) continue;
        const sp = Math.hypot(s.vx, s.vy) || 1;
        this.damageEnemy(e, s.damage, s.crit, (s.vx / sp) * s.knockback, (s.vy / sp) * s.knockback);
        s.hit.push(e.id);
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
    e.hp -= dmg;
    e.flash = 1;
    e.pulse = 1;
    e.shake = 0.12;
    // Knockback grows with how big the hit was compared to the monster.
    const resist = e.def.boss || e.def.behavior === 'still' ? 0 : e.phase === 'dash' ? 0.3 : e.elite ? 0.5 : 1;
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
    if (crit) {
      this.sfx.crit();
      this.stop(0.035, 0.1);
      if (config.shake) this.fx.addShake(2);
    }
    this.sfx.hit();
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    e.alive = false;
    const def = e.def;
    if (def.behavior !== 'still') {
      this.run.kills++;
      this.energy = Math.min(SKILL_MAX, this.energy + config.skillChargePerKill);
    }
    this.fx.poof(e.x, e.y - e.r * 0.6, e.color);
    this.fx.splat(e.x, e.y - e.r * 0.5, 0, -1, e.color, 8);
    this.fx.ring(e.x, e.y - e.r * 0.6, '#FFFFFF', e.r * 1.6);
    if (def.behavior !== 'still') this.addDecal(e.x, e.y + e.r * 0.3, e.r * 1.1, e.color);
    this.sfx.kill();
    // Bigger kills freeze longer; ordinary kills only briefly, and not back to back.
    if (def.boss) this.stop(0.18);
    else if (e.elite) this.stop(0.09);
    else this.stop(0.03, 0.12);
    if (e.elite && config.shake) this.fx.addShake(6);
    let drops = def.drops * (e.elite ? 3 : 1) + (e.elite ? 2 : 0);
    if (this.rng.chance(clamp(this.run.stats.luck, 0, 100) / 200)) drops++;
    for (let i = 0; i < drops; i++) this.drop('shard', e.x, e.y);
    if (this.rng.chance(e.elite ? 0.5 : def.candy)) this.drop('candy', e.x, e.y);
    if (def.chest || (e.elite && this.rng.chance(0.35))) {
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
    if (def.boss && config.shake) this.fx.addShake(20);
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
    if (config.shake) this.fx.addShake(8);
    this.stop(0.07);
    this.sfx.hurt();
    if (p.hp <= 0 && this.run.character.special === 'lastStand' && !this.run.lastStandUsed) {
      this.run.lastStandUsed = true;
      p.hp = 1;
      p.invuln = 1.5;
      this.fx.text(p.x, p.y - 160, '龙之加护！', palette.goldLight, 34);
      this.waves.push({ x: p.x, y: p.y - 30, radius: 160, life: 0.5, maxLife: 0.5, color: palette.goldLight });
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
        this.stop(0.08);
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
        if (config.shake) this.fx.addShake(16);
        this.stop(0.12);
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
        this.stop(0.06);
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
        if (config.shake) this.fx.addShake(18);
        this.stop(0.12);
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
    for (const z of this.zones) z.t -= dt;
    for (const d of this.decals) d.life -= dt;
    this.swings = this.swings.filter((s) => s.life > 0);
    this.lightning = this.lightning.filter((l) => l.life > 0);
    this.waves = this.waves.filter((w) => w.life > 0);
    this.zones = this.zones.filter((z) => z.t > 0);
    this.decals = this.decals.filter((d) => d.life > 0);
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
  }
}
