import { clamp, lerp } from '../engine/math';
import { config } from './config';
import type { BossKind } from './data/enemies';
import * as L from './layout';
import { palette } from './palette';
import type { Enemy, World } from './world';

/**
 * Scripted boss brains. Every attack has a wind-up with a red ground telegraph
 * (or a flash) before it lands, so big hits are readable and dodgeable.
 */
export type BossAction = 'none' | 'jump' | 'dash' | 'spin' | 'fan' | 'ring' | 'spiral' | 'summon' | 'pool';

export interface BossBrain {
  kind: BossKind;
  phase: number;
  /** Seconds until the next attack starts. */
  next: number;
  /** Position in the attack cycle. */
  step: number;
  action: BossAction;
  /** Sub-step of the current action: 0 is always the wind-up. */
  stage: number;
  /** Seconds left in the current stage. */
  t: number;
  /** Repeats left (jumps, dashes, volleys). */
  count: number;
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  dirX: number;
  dirY: number;
  /** Jump height, for drawing. */
  z: number;
  spin: number;
}

const CYCLES: Record<BossKind, BossAction[][]> = {
  king: [
    ['jump', 'jump', 'summon'],
    ['jump', 'summon', 'jump'],
  ],
  knight: [
    ['dash', 'fan', 'spin'],
    ['dash', 'spin', 'fan'],
  ],
  queen: [
    ['ring', 'summon', 'ring', 'fan'],
    ['spiral', 'ring', 'summon', 'fan'],
    ['spiral', 'ring', 'fan', 'summon'],
  ],
  toad: [
    ['jump', 'fan', 'summon'],
    ['jump', 'pool', 'fan', 'summon', 'pool'],
  ],
};

/** Pause between attacks, per phase. */
const GAPS: Record<BossKind, number[]> = {
  king: [2.4, 1.6],
  knight: [1.4, 1.0],
  queen: [2.2, 1.7, 1.2],
  toad: [2.0, 1.3],
};

const PHASE_LINES: Record<BossKind, string[]> = {
  king: ['', '国王发怒了！'],
  knight: ['', '黑曜之力解放！'],
  queen: ['', '女王展开了翅膀！', '女王狂暴了！'],
  toad: ['', '巨蟾鼓起了毒囊！'],
};

const JUMP_RADIUS = 170;
const SPIN_RADIUS = 230;
const DASH_LENGTH = 720;
const DASH_SPEED = 1150;

export function newBrain(kind: BossKind): BossBrain {
  return {
    kind,
    phase: 1,
    next: 1.6,
    step: 0,
    action: 'none',
    stage: 0,
    t: 0,
    count: 0,
    ox: 0,
    oy: 0,
    tx: 0,
    ty: 0,
    dirX: 0,
    dirY: 0,
    z: 0,
    spin: 0,
  };
}

/** True while the boss is winding up an attack (for the shake and "!" bubble). */
export function isWindingUp(b: BossBrain): boolean {
  return b.action !== 'none' && b.stage === 0 && b.action !== 'spiral' && b.action !== 'summon';
}

/**
 * Advances a boss. Returns true when the brain moved the boss itself this frame,
 * so the normal chase movement should be skipped.
 */
export function updateBoss(w: World, e: Enemy, dt: number): boolean {
  const b = e.brain;
  if (!b || e.appear < 1) return false;
  checkPhase(w, e, b);

  if (b.action === 'none') {
    b.next -= dt;
    if (b.next <= 0) {
      const cycle = CYCLES[b.kind][b.phase - 1];
      start(w, e, b, cycle[b.step % cycle.length]);
      b.step++;
    }
    return false;
  }

  b.t -= dt;
  switch (b.action) {
    case 'jump':
      return jump(w, e, b);
    case 'dash':
      return dash(w, e, b, dt);
    case 'spin':
      return spin(w, e, b);
    case 'fan':
      if (b.t <= 0) {
        fireFan(w, e, b);
        b.count--;
        if (b.count > 0) b.t = 0.35;
        else finish(b);
      }
      return true;
    case 'ring':
      if (b.t <= 0) {
        const n = [14, 18, 22][b.phase - 1] ?? 14;
        fireRing(w, e, n, b.stage === 1 ? Math.PI / n : 0, 270);
        if (b.kind === 'queen' && b.phase === 3 && b.stage === 0) {
          b.stage = 1;
          b.t = 0.3;
        } else {
          finish(b);
        }
      }
      return true;
    case 'spiral': {
      const arms = b.phase >= 3 ? 3 : 2;
      b.count -= dt;
      while (b.t <= 0) {
        for (let i = 0; i < arms; i++) w.fireBullet(e.x, e.y - e.r * 0.6, b.spin + (i * Math.PI * 2) / arms, 250, bulletDamage(e));
        b.spin += 0.33;
        b.t += 0.1;
      }
      if (b.count <= 0) finish(b);
      return true;
    }
    case 'summon':
      finish(b);
      return false;
    case 'pool':
      if (b.t <= 0) finish(b);
      return true;
  }
  return false;
}

function start(w: World, e: Enemy, b: BossBrain, action: BossAction): void {
  const p = w.player;
  b.action = action;
  b.stage = 0;
  switch (action) {
    case 'jump':
      b.count = b.phase >= 2 ? 3 : 1;
      beginJump(w, e, b, 0.6);
      break;
    case 'dash':
      b.count = b.phase >= 2 ? 4 : 3;
      beginDash(w, e, b, 0.5);
      break;
    case 'spin':
      b.t = 0.75;
      w.addZone({ kind: 'circle', x: e.x, y: e.y, r: SPIN_RADIUS, x2: 0, y2: 0, t: b.t, max: b.t });
      w.sfx.warn();
      break;
    case 'fan':
      b.count = b.kind === 'knight' ? 2 : 1;
      b.t = 0.45;
      e.flash = 0.5;
      w.sfx.warn();
      break;
    case 'ring':
      b.t = 0.45;
      e.flash = 0.6;
      w.sfx.warn();
      break;
    case 'spiral':
      b.t = 0.4;
      b.count = 2.6;
      b.spin = Math.atan2(p.y - e.y, p.x - e.x);
      w.sfx.warn();
      break;
    case 'summon': {
      if (b.kind === 'toad') {
        w.summon(e.x, e.y, 3, b.phase >= 2 ? 1 : 0, 'frog');
        w.waves.push({ x: e.x, y: e.y - e.r * 0.5, radius: e.r * 2.4, life: 0.5, maxLife: 0.5, color: '#9AD86A' });
        break;
      }
      const slimes = b.kind === 'king' ? 4 : 2 + b.phase;
      w.summon(e.x, e.y, slimes, b.kind === 'queen' && b.phase >= 2 ? 1 : 0);
      w.waves.push({ x: e.x, y: e.y - e.r * 0.5, radius: e.r * 2.4, life: 0.5, maxLife: 0.5, color: '#B48CFF' });
      break;
    }
    case 'pool': {
      // Poison spit: warning circles around the player that burst a moment later.
      const n = b.phase >= 2 ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random();
        const d = i === 0 ? 0 : 90 + Math.random() * 130;
        const x = clamp(p.x + Math.cos(a) * d, L.ARENA.x + 60, L.ARENA_RIGHT - 60);
        const y = clamp(p.y + Math.sin(a) * d, L.ARENA.y + 60, L.ARENA_BOTTOM - 60);
        w.delayedBlast(x, y, 85, 1.1 + i * 0.12, bulletDamage(e) + 1, '#9AD86A');
      }
      e.flash = 0.6;
      b.t = 0.9;
      break;
    }
    case 'none':
      break;
  }
}

function finish(b: BossBrain): void {
  b.action = 'none';
  b.stage = 0;
  b.z = 0;
  b.next = GAPS[b.kind][b.phase - 1] ?? 1.5;
}

// ---- King: jump slam ----

function beginJump(w: World, e: Enemy, b: BossBrain, windup: number): void {
  const p = w.player;
  b.stage = 0;
  b.t = windup;
  b.ox = e.x;
  b.oy = e.y;
  b.tx = clamp(p.x, L.ARENA.x + 80, L.ARENA_RIGHT - 80);
  b.ty = clamp(p.y, L.ARENA.y + 80, L.ARENA_BOTTOM - 80);
  w.addZone({ kind: 'circle', x: b.tx, y: b.ty, r: JUMP_RADIUS, x2: 0, y2: 0, t: windup + 0.7, max: windup + 0.7 });
  w.sfx.warn();
}

function jump(w: World, e: Enemy, b: BossBrain): boolean {
  if (b.stage === 0) {
    if (b.t <= 0) {
      b.stage = 1;
      b.t = 0.7;
    }
    return true;
  }
  const k = clamp(1 - b.t / 0.7, 0, 1);
  e.x = lerp(b.ox, b.tx, k);
  e.y = lerp(b.oy, b.ty, k);
  b.z = Math.sin(k * Math.PI) * 240;
  if (b.t > 0) return true;

  // Landing
  b.z = 0;
  const p = w.player;
  if (L.inGroundCircle(p.x, p.y, b.tx, b.ty, JUMP_RADIUS, config.playerRadius * 0.5)) w.hurtPlayer(e.damage + 2);
  // Phase 1 leaves wide gaps in the ring, so melee can learn to slip through.
  fireRing(w, e, b.phase >= 2 ? 14 : 8, Math.random(), 300);
  w.waves.push({ x: b.tx, y: b.ty, radius: JUMP_RADIUS * 1.3, life: 0.5, maxLife: 0.5, color: palette.danger });
  w.waves.push({ x: b.tx, y: b.ty, radius: JUMP_RADIUS, life: 0.35, maxLife: 0.35, color: '#FFFFFF' });
  w.fx.burst(b.tx, b.ty, '#E9D8C4', 24, 420, 9, 0.6);
  w.groundCrack(b.tx, b.ty + 10, JUMP_RADIUS * 0.75);
  if (config.shake) w.fx.addShake(10);
  w.stop(0.05);
  w.sfx.slam();
  b.count--;
  if (b.count > 0) beginJump(w, e, b, 0.35);
  else finish(b);
  return true;
}

// ---- Knight: dashes, sword spin ----

function beginDash(w: World, e: Enemy, b: BossBrain, windup: number): void {
  const p = w.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  b.stage = 0;
  b.t = windup;
  b.dirX = dx / d;
  b.dirY = dy / d;
  e.facing = dx < 0 ? -1 : 1;
  w.addZone({ kind: 'line', x: e.x, y: e.y, r: 50, x2: e.x + b.dirX * DASH_LENGTH, y2: e.y + b.dirY * DASH_LENGTH, t: windup, max: windup });
  w.sfx.warn();
}

function dash(w: World, e: Enemy, b: BossBrain, dt: number): boolean {
  if (b.stage === 0) {
    if (b.t <= 0) {
      b.stage = 1;
      b.t = DASH_LENGTH / DASH_SPEED;
      w.sfx.whoosh();
    }
    return true;
  }
  e.x = clamp(e.x + b.dirX * DASH_SPEED * dt, L.ARENA.x + e.r, L.ARENA_RIGHT - e.r);
  e.y = clamp(e.y + b.dirY * DASH_SPEED * dt, L.ARENA.y + e.r, L.ARENA_BOTTOM - e.r);
  w.fx.spark(e.x, e.y - e.r * 0.5, -b.dirX, -b.dirY, '#B48CFF', 2, 240, 0.25);
  if (b.t > 0) return true;
  b.count--;
  if (b.count > 0) beginDash(w, e, b, 0.4);
  else finish(b);
  return true;
}

function spin(w: World, e: Enemy, b: BossBrain): boolean {
  if (b.t > 0) return true;
  const p = w.player;
  if (L.inGroundCircle(p.x, p.y, e.x, e.y, SPIN_RADIUS, config.playerRadius * 0.5)) w.hurtPlayer(e.damage);
  for (let i = 0; i < 3; i++) {
    w.swings.push({ x: e.x, y: e.y - 20, angle: (i * Math.PI * 2) / 3, radius: SPIN_RADIUS, life: 0.35, maxLife: 0.35, color: '#7B5CC7' });
  }
  w.waves.push({ x: e.x, y: e.y - 20, radius: SPIN_RADIUS, life: 0.45, maxLife: 0.45, color: '#7B5CC7' });
  fireRing(w, e, b.phase >= 2 ? 20 : 16, Math.random(), 220);
  w.groundCrack(e.x, e.y + 10, SPIN_RADIUS * 0.45);
  if (config.shake) w.fx.addShake(6);
  w.stop(0.04);
  w.sfx.slam();
  finish(b);
  return true;
}

// ---- Bullet patterns ----

function bulletDamage(e: Enemy): number {
  return Math.max(2, e.damage - 3);
}

function fireRing(w: World, e: Enemy, n: number, offset: number, speed: number): void {
  for (let i = 0; i < n; i++) w.fireBullet(e.x, e.y - e.r * 0.5, offset + (i * Math.PI * 2) / n, speed, bulletDamage(e));
  w.sfx.bossShoot();
}

function fireFan(w: World, e: Enemy, b: BossBrain): void {
  const p = w.player;
  const aim = Math.atan2(p.y - 30 - (e.y - e.r * 0.5), p.x - e.x);
  const n = b.kind === 'knight' || b.kind === 'toad' ? (b.phase >= 2 ? 9 : 7) : [7, 9, 11][b.phase - 1] ?? 7;
  const spread = 1.0;
  for (let i = 0; i < n; i++) {
    const a = aim + (i / (n - 1) - 0.5) * spread;
    w.fireBullet(e.x, e.y - e.r * 0.5, a, 330, bulletDamage(e));
  }
  w.sfx.bossShoot();
}

// ---- Phases ----

function checkPhase(w: World, e: Enemy, b: BossBrain): void {
  const ratio = e.hp / e.maxHp;
  const phases = CYCLES[b.kind].length;
  const target = phases === 3 ? (ratio > 0.6 ? 1 : ratio > 0.3 ? 2 : 3) : ratio > 0.5 ? 1 : 2;
  if (target <= b.phase) return;
  b.phase = target;
  // Phase change: a roar that clears the bullets, so the new pattern starts fair.
  w.bullets.length = 0;
  w.fx.text(e.x, e.y - e.r * 2.4, PHASE_LINES[b.kind][target - 1] ?? '', '#FFD0DE', 42);
  w.waves.push({ x: e.x, y: e.y - e.r * 0.5, radius: 360, life: 0.7, maxLife: 0.7, color: palette.danger });
  w.groundCrack(e.x, e.y + e.r * 0.3, e.r * 2);
  if (config.shake) w.fx.addShake(12);
  w.stop(0.12, true);
  w.sfx.bossAppear();
  if (b.kind === 'queen') w.summon(e.x, e.y, 2, 2);
  b.action = 'none';
  b.z = 0;
  b.next = 0.8;
}
