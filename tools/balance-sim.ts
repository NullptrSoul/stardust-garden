/**
 * Headless balance simulator. A bot plays real runs with the game's own rules
 * (World, Run, waves) at 60 ticks per second, with no rendering or sound.
 *
 *   npm run sim -- stages [runs] [stageIds|all] [casual]
 *   npm run sim -- endless [runs] [casual] [talents]   (SIM_CAP=N stops at wave N)
 *   npm run sim -- weapons [runs] [stageId]
 *   npm run sim -- curve [runs] [stageId|endless] [casual]
 *   npm run sim -- dps
 *   npm run sim -- feel [runs] [stageIds|endless]   (share of time frozen or shaking)
 *   npm run sim -- one [seed] [stageId|endless] [characterIndex] [casual]   (SIM_TRACE=1 logs every hit)
 *
 * The bot is a decent player, not a perfect one: it kites, dodges bullets and
 * red zones, picks stats by simple weights and buys what fits its build. Use the
 * numbers to compare stages and weapons with each other, not as exact win rates.
 */
import { Rng } from '../src/engine/rng';
import * as L from '../src/game/layout';
import { config } from '../src/game/config';
import { CHARACTERS, type CharacterDef } from '../src/game/data/characters';
import { ITEMS, type ItemDef } from '../src/game/data/items';
import { ALL_STAGES, stageById, type StageDef } from '../src/game/data/stages';
import { talentMods, talentShards } from '../src/game/data/talents';
import { WEAPONS, MAX_TIER, TIER_PRICE, weaponById } from '../src/game/data/weapons';
import { Run, type ShopOffer, type UpgradeCard } from '../src/game/run';
import type { StatKey, StatMods } from '../src/game/stats';
import { bossesForWave, isFinalWave } from '../src/game/waves';
import { SKILL_MAX, World, type Enemy } from '../src/game/world';
import { Fx } from '../src/game/fx';

/** Freeze-frame and shake totals over some runs. */
interface Feel {
  total: number;
  frozen: number;
  freezes: number;
  shakeSum: number;
  shaky: number;
}
import { enemyById } from '../src/game/data/enemies';

const DT = 1 / 60;
const TRACE = process.env.SIM_TRACE === '1';
/** A boss wave that runs this long counts as a loss (the bot can't kill it). */
const BOSS_TIMEOUT = 240;

// No screen shake or freeze frames in a headless run.
config.shake = false;
config.hitStop = false;
config.sound = false;
config.music = false;

/** Accepts any call and does nothing: stands in for Fx and Sfx. */
const silent: any = new Proxy({}, { get: () => () => 0 });

// ---- Bot: movement ----

/**
 * good: reacts every frame and sees every bullet (better than most people).
 * casual: decides 5 times a second, notices bullets late, reacts to red zones
 * after a moment, and wobbles a little: closer to a phone player.
 */
export type BotSkill = 'good' | 'casual';

interface Bot {
  skill: BotSkill;
  /** Seconds until a casual bot decides again. */
  hold: number;
  dir: { x: number; y: number };
  rng: Rng;
}

function newBot(skill: BotSkill, seed: number): Bot {
  return { skill, hold: 0, dir: { x: 0, y: 0 }, rng: new Rng(seed * 31 + 7) };
}

function steer(world: World, run: Run, bot: Bot): { x: number; y: number } {
  if (bot.skill === 'good') return botMove(world, run, bot);
  bot.hold -= DT;
  if (bot.hold > 0) return bot.dir;
  bot.hold = 0.2;
  const d = botMove(world, run, bot);
  const a = Math.atan2(d.y, d.x) + bot.rng.range(-0.5, 0.5);
  bot.dir = d.x === 0 && d.y === 0 ? d : { x: Math.cos(a), y: Math.sin(a) };
  return bot.dir;
}

function botMove(world: World, run: Run, bot: Bot): { x: number; y: number } {
  const casual = bot.skill === 'casual';
  const p = world.player;
  // Orbiting stars only hit up close, so they play like melee.
  const close = (id: string) => weaponById(id).cls === 'melee' || weaponById(id).behavior === 'orbit';
  const meleeShare = run.weapons.filter((w) => close(w.id)).length / run.weapons.length;
  const melee = meleeShare >= 0.5;
  // Melee stands about two thirds of its reach away: a wide fan or scythe needn't hug monsters.
  const reach = Math.max(
    ...run.weapons.filter((w) => close(w.id)).map((w) => {
      const def = weaponById(w.id);
      return def.behavior === 'orbit' ? def.range + run.stats.range * 0.3 : def.range + run.stats.range * 0.5;
    }),
    0,
  );
  const meleeGap = Math.max(45, reach * 0.65 - config.playerRadius);
  let fx = 0;
  let fy = 0;
  let nearest: Enemy | null = null;
  let nearestD = Infinity;
  let threatNear = false;

  for (const e of world.enemies) {
    if (!e.alive || e.appear < 1) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const harmless = e.def.damage === 0 && !e.def.boss;
    if (!harmless && d < nearestD) {
      nearestD = d;
      nearest = e;
    }
    if (harmless) continue;
    // Melee has to stand in reach of a boss to hurt it; ranged keeps well clear.
    const meleeSafe = Math.max(meleeGap + config.playerRadius, e.r + config.playerRadius + 30);
    const safe = (melee ? meleeSafe : e.r + config.playerRadius + 110) + (e.def.boss && !melee ? 90 : 0) + (e.elite ? 30 : 0);
    if (d < safe) {
      const w = ((safe - d) / safe) * 4;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
      if (d < safe * 0.8) threatNear = true;
    } else if (d < 480) {
      const w = 0.3 * (safe / d) ** 2;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
    }
    // A charger winding up or dashing: step out of its line.
    if ((e.phase === 'windup' || e.phase === 'dash') && d < 520) {
      const ax = e.dashX;
      const ay = e.dashY;
      const len = Math.hypot(ax, ay) || 1;
      const side = (dx * -ay + dy * ax) / len >= 0 ? 1 : -1;
      fx += (-ay / len) * side * 3;
      fy += (ax / len) * side * 3;
    }
  }

  // Enemy bullets heading our way (a casual player spots them late).
  const sight = casual ? 170 : 280;
  for (const b of world.bullets) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d > sight) continue;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp;
    const uy = b.vy / sp;
    const along = dx * ux + dy * uy;
    if (along < 0) continue;
    const cross = dx * -uy + dy * ux;
    if (Math.abs(cross) > 70) continue;
    const side = cross >= 0 ? 1 : -1;
    const w = 3.5 * (1 - d / 280);
    fx += -uy * side * w;
    fy += ux * side * w;
  }

  // Red warning zones (slams, dashes, poison blasts, wisps); a casual player reacts after a moment.
  for (const z of world.zones) {
    if (casual && z.max - z.t < 0.3) continue;
    if (z.kind === 'circle') {
      const dx = p.x - z.x;
      const dy = (p.y - z.y) / L.GROUND_SQUASH;
      const d = Math.hypot(dx, dy) || 1;
      if (d < z.r + 45) {
        fx += (dx / d) * 7;
        fy += (dy / d) * 7;
      }
    } else {
      const sx = z.x2 - z.x;
      const sy = z.y2 - z.y;
      const len2 = sx * sx + sy * sy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - z.x) * sx + (p.y - z.y) * sy) / len2));
      const cx = z.x + sx * t;
      const cy = z.y + sy * t;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < z.r + 50) {
        fx += (dx / d) * 7;
        fy += (dy / d) * 7;
      }
    }
  }

  // Circle around the crowd instead of backing straight into a wall.
  const rep = Math.hypot(fx, fy);
  if (rep > 0.05) {
    fx += (-fy / rep) * rep * 0.45;
    fy += (fx / rep) * rep * 0.45;
  }

  // Walls.
  const margin = 240;
  if (p.x < L.ARENA.x + margin) fx += ((L.ARENA.x + margin - p.x) / margin) * 3;
  if (p.x > L.ARENA_RIGHT - margin) fx -= ((p.x - (L.ARENA_RIGHT - margin)) / margin) * 3;
  if (p.y < L.ARENA.y + margin) fy += ((L.ARENA.y + margin - p.y) / margin) * 3;
  if (p.y > L.ARENA_BOTTOM - margin) fy -= ((p.y - (L.ARENA_BOTTOM - margin)) / margin) * 3;

  // Close in so weapons reach: melee wants to be near, ranged just in range.
  if (nearest && !threatNear) {
    const want = melee ? Math.max(110, reach * 0.8) : 380;
    if (nearestD > want) {
      const w = melee ? 1.1 : 0.5;
      fx += ((nearest.x - p.x) / nearestD) * w;
      fy += ((nearest.y - p.y) / nearestD) * w;
    }
  }

  // Pick up shards and candy when it's calm, and hunt the thief cat.
  if (!threatNear) {
    const hurt = p.hp < run.stats.maxHp * 0.6;
    let best: { x: number; y: number } | null = null;
    let bestD = 360;
    for (const d of world.drops) {
      if (!d.alive) continue;
      const dd = Math.hypot(d.x - p.x, d.y - p.y) * (hurt && d.kind === 'candy' ? 0.5 : 1);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    const thief = world.enemies.find((e) => e.alive && e.def.id === 'thief');
    if (thief) best = thief;
    if (best) {
      const d = Math.hypot(best.x - p.x, best.y - p.y) || 1;
      fx += ((best.x - p.x) / d) * 1.2;
      fy += ((best.y - p.y) / d) * 1.2;
    }
  }

  const mag = Math.hypot(fx, fy);
  if (mag < 0.15) return { x: 0, y: 0 };
  return { x: fx / mag, y: fy / mag };
}

/** Casts the skill when it's full and worth it. */
function botSkill(world: World, run: Run): void {
  if (world.energy < SKILL_MAX || world.ending > 0) return;
  const p = world.player;
  const kind = run.character.skill.kind;
  const near = world.enemies.filter((e) => e.alive && e.appear >= 1 && Math.hypot(e.x - p.x, e.y - p.y) < 320).length;
  const healer = kind === 'sanctuary' || kind === 'whale';
  const lowHp = p.hp < run.stats.maxHp * 0.45;
  const bossUp = world.bosses.some((b) => b.alive);
  if (near >= 6 || bossUp || (healer && lowHp)) {
    world.energy = 0;
    world.castSkill(kind);
  }
}

// ---- Bot: choices ----

/** How much the bot values one point of each stat. */
function statWeights(run: Run): Record<StatKey, number> {
  const melee = run.weapons.filter((w) => weaponById(w.id).cls === 'melee').length / run.weapons.length;
  return {
    maxHp: 0.75,
    regen: 1.3,
    damage: 0.45,
    meleeDamage: 0.4 * melee,
    rangedDamage: 0.4 * (1 - melee),
    attackSpeed: 0.45,
    crit: 0.3,
    range: 0.02,
    armor: 1.8,
    dodge: 0.35,
    speed: 0.2,
    pickup: 0.006,
    luck: 0.05,
    xpGain: 0.08,
  };
}

function modsValue(mods: StatMods, w: Record<StatKey, number>): number {
  let v = 0;
  for (const [k, n] of Object.entries(mods) as Array<[StatKey, number]>) v += n * w[k];
  return v;
}

function pickUpgrade(run: Run, cards: UpgradeCard[]): UpgradeCard {
  const w = statWeights(run);
  return cards.reduce((a, b) => (b.value * w[b.key] > a.value * w[a.key] ? b : a));
}

const EFFECT_VALUE: Record<string, number> = { fang: 3, thornring: 3, hourglass: 2, piggy: 3, feather: 5, orb: 4 };

function itemValue(run: Run, item: ItemDef): number {
  let v = modsValue(item.mods, statWeights(run));
  if (item.effect) v += EFFECT_VALUE[item.effect] ?? 0;
  return v;
}

export interface BotPlan {
  /** Only ever buy this weapon (weapon tests). */
  onlyWeapon?: string;
}

function offerScore(run: Run, offer: ShopOffer, plan: BotPlan): number {
  if (offer.sold) return -1;
  if (offer.kind === 'item') {
    const item = ITEMS.find((i) => i.id === offer.id)!;
    if (run.atCap(item)) return -1;
    const v = itemValue(run, item);
    return (v / offer.price) * 10;
  }
  if (plan.onlyWeapon && offer.id !== plan.onlyWeapon) return -1;
  const def = weaponById(offer.id);
  const merges = offer.tier < MAX_TIER && run.weapons.some((w) => w.id === offer.id && w.tier === offer.tier);
  const full = run.weapons.length >= config.maxWeapons;
  if (!merges && full) return -1;
  // Stick to the character's side: melee for melee starters, ranged otherwise.
  const starter = weaponById(run.character.startWeapon).cls;
  const fit = plan.onlyWeapon ? 1 : def.cls === starter ? 1 : 0.55;
  const base = merges ? 14 + offer.tier * 2 : 9 + offer.tier * 3;
  return ((base * fit) / offer.price) * 25;
}

/** Weapon tests: every weapon in stock becomes the weapon under test. */
function forceStock(run: Run, plan: BotPlan): void {
  const only = plan.onlyWeapon;
  if (!only) return;
  const def = weaponById(only);
  for (const o of run.offers) {
    if (o.kind !== 'weapon' || o.sold) continue;
    o.id = only;
    o.price = run.price(def.price * TIER_PRICE[o.tier]);
  }
}

function botShop(run: Run, plan: BotPlan): void {
  let freeReroll = true;
  let rerolls = 0;
  forceStock(run, plan);
  for (let guard = 0; guard < 40; guard++) {
    let best: ShopOffer | null = null;
    let bestScore = 0.6;
    for (const o of run.offers) {
      if (o.price > run.shards) continue;
      const s = offerScore(run, o, plan);
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    if (best) {
      run.buy(best);
      continue;
    }
    if (freeReroll) {
      freeReroll = false;
      run.reroll(true);
      forceStock(run, plan);
      continue;
    }
    if (rerolls < 2 && run.shards > run.rerollCost() + 40) {
      rerolls++;
      run.reroll();
      forceStock(run, plan);
      continue;
    }
    break;
  }
}

// ---- One run ----

export interface WaveLog {
  wave: number;
  damageTaken: number;
  time: number;
  boss: boolean;
  /** Level and total shards collected when the wave ended. */
  level: number;
  earned: number;
}

export interface RunResult {
  stage: string;
  character: string;
  won: boolean;
  /** Wave the run ended on. */
  wave: number;
  hpLeft: number;
  timedOut: boolean;
  waves: WaveLog[];
  weapons: string[];
  level: number;
  /** Share of boss HP still standing when a boss wave was lost. */
  bossLeft: number;
  stats?: Record<string, number>;
  items?: string[];
}

/** Endless runs stop here even if the bot is still alive. */
const ENDLESS_CAP = Number(process.env.SIM_CAP ?? 60);

export function playRun(
  /** null plays endless mode. */
  stage: StageDef | null,
  character: CharacterDef,
  seed: number,
  opts: { plan?: BotPlan; talents?: Record<string, number>; noPreShop?: boolean; skill?: BotSkill; feel?: Feel } = {},
): RunResult {
  const plan = opts.plan ?? {};
  const talents = opts.talents ?? {};
  const rng = new Rng(seed * 7919 + 17);
  // Feel runs use the real effects so camera shake can be measured.
  const fx = opts.feel ? new Fx() : silent;
  const world = new World(rng, fx, silent);
  const bot = newBot(opts.skill ?? 'good', seed);
  const run = new Run(character, seed, stage ? 'stage' : 'endless', {
    stage: stage ?? undefined,
    bonus: talentMods(talents),
    startShards: (stage?.startShards ?? 0) + talentShards(talents),
  });
  const stageId = stage?.id ?? 'endless';
  let earned = 0;
  const collect = run.collectShards.bind(run);
  run.collectShards = (n: number) => {
    earned += n;
    return collect(n);
  };
  // Like the game: starting shards are spent in a shop before wave 1.
  if (run.shards > 0 && !opts.noPreShop) {
    run.rollShop();
    botShop(run, plan);
  }
  world.startWave(run);
  const waves: WaveLog[] = [];
  let taken = 0;
  let lastHp = world.player.hp;
  for (;;) {
    if (opts.feel) {
      // Like Game.update: while frozen, nothing moves, effects included.
      opts.feel.total += DT;
      if (world.hitStop > 0) {
        world.hitStop -= DT;
        opts.feel.frozen += DT;
        continue;
      }
      fx.update(DT);
      const off = Math.hypot(fx.offsetX, fx.offsetY);
      opts.feel.shakeSum += off;
      if (off > 3) opts.feel.shaky += DT;
    } else {
      world.hitStop = 0;
    }
    world.introBoss = null;
    const move = steer(world, run, bot);
    const ev = world.update(DT, move.x, move.y);
    if (opts.feel && world.hitStop > 0) opts.feel.freezes++;
    botSkill(world, run);
    const hp = world.player.hp;
    if (hp < lastHp) taken += lastHp - hp;
    if (TRACE && hp < lastHp && world.bosses.length === 0) {
      const p = world.player;
      const close = world.enemies
        .filter((e) => e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 110)
        .map((e) => `${e.def.id}${e.elite ? '*' : ''}${e.phase === 'dash' ? '!' : ''}`);
      console.log(
        `w${run.wave} t=${world.elapsed.toFixed(1)} hp ${lastHp.toFixed(0)}→${hp.toFixed(0)}/${run.stats.maxHp} near=[${close.join(',')}] ` +
          `bullets<120=${world.bullets.filter((b) => Math.hypot(b.x - p.x, b.y - p.y) < 120).length} alive=${world.enemies.length} weapons=${run.weapons.map((w) => w.id + (w.tier + 1)).join(',')}`,
      );
    }
    if (TRACE && hp < lastHp && world.bosses.length > 0) {
      const b = world.boss!;
      const brain = b.brain as any;
      const near = world.enemies.filter((e) => e.alive && !e.def.boss && Math.hypot(e.x - world.player.x, e.y - world.player.y) < 80).length;
      console.log(
        `t=${world.elapsed.toFixed(1)} hp ${lastHp.toFixed(0)}→${hp.toFixed(0)}/${run.stats.maxHp} boss ${b.hp}/${b.maxHp} ` +
          `act=${brain?.action ?? '?'} bossD=${Math.hypot(b.x - world.player.x, b.y - world.player.y).toFixed(0)} adds<80=${near} bullets=${world.bullets.length} zones=${world.zones.length}`,
      );
    }
    lastHp = hp;
    const boss = bossesForWave(run).length > 0;
    if (ev === 'playerDied' || (boss && world.elapsed > BOSS_TIMEOUT)) {
      waves.push({ wave: run.wave, damageTaken: taken, time: world.elapsed, boss, level: run.level, earned });
      return {
        stage: stageId,
        character: character.id,
        won: false,
        wave: run.wave,
        hpLeft: 0,
        timedOut: ev !== 'playerDied',
        waves,
        weapons: run.weapons.map((w) => `${w.id}${w.tier + 1}`),
        level: run.level,
        bossLeft: bossShare(world),
      };
    }
    if (ev !== 'waveCleared') continue;
    waves.push({ wave: run.wave, damageTaken: taken, time: world.elapsed, boss, level: run.level, earned });
    taken = 0;
    run.finishWave();
    if (isFinalWave(run) || (!stage && run.wave >= ENDLESS_CAP)) {
      return {
        stage: stageId,
        character: character.id,
        won: true,
        wave: run.wave,
        hpLeft: world.player.hp / run.stats.maxHp,
        timedOut: false,
        waves,
        weapons: run.weapons.map((w) => `${w.id}${w.tier + 1}`),
        level: run.level,
        bossLeft: 0,
        stats: { ...run.stats },
        items: [...run.items].map(([id, n]) => `${id}×${n}`),
      };
    }
    while (run.chests > 0) run.resolveChest(run.randomItem(), true);
    while (run.pendingLevels > 0) run.applyUpgrade(pickUpgrade(run, run.rollUpgrades()));
    run.rollShop();
    botShop(run, plan);
    run.startNextWave();
    world.startWave(run);
    lastHp = world.player.hp;
  }
}

function bossShare(world: World): number {
  if (world.bosses.length === 0) return 0;
  const max = world.bosses.reduce((a, b) => a + b.maxHp, 0);
  const left = world.bosses.reduce((a, b) => a + (b.alive ? Math.max(0, b.hp) : 0), 0);
  return left / max;
}

// ---- Static DPS test ----

/** Damage per second of one weapon at a tier, against one big target and a crowd. */
function dpsTest(weaponId: string, tier: number): { single: number; crowd: number } {
  const out = { single: 0, crowd: 0 };
  for (const scenario of ['single', 'crowd'] as const) {
    const ch: CharacterDef = { ...CHARACTERS[0], startWeapon: weaponId, mods: {}, special: undefined };
    const stage: StageDef = { ...stageById('1-1'), waveTime: [60], bosses: {}, waves: 1 };
    const run = new Run(ch, 1, 'stage', { stage });
    run.weapons[0].tier = tier;
    const world = new World(new Rng(5), silent, silent);
    world.startWave(run);
    world.enemies = [];
    (world as any).spawnT = 1e9; // no natural spawns
    (world as any).thiefAt = -1;
    const p = world.player;
    const spawn = (world as any).spawnEnemy.bind(world);
    const dummies: Enemy[] = [];
    const n = scenario === 'single' ? 1 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = scenario === 'single' ? 110 : 90 + (i % 3) * 45;
      const e: Enemy = spawn(enemyById('slime'), p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1, false);
      e.hp = e.maxHp = 1e9;
      e.damage = 0;
      // The single target stands in for a boss: it can't be pushed (that matters for the fan).
      e.def = { ...e.def, speed: 0, damage: 0, heavy: scenario === 'single' };
      dummies.push(e);
    }
    const T = 30;
    for (let t = 0; t < T; t += DT) {
      world.hitStop = 0;
      // Pin the dummies in place.
      for (const e of dummies) {
        e.kx = e.ky = e.vx = e.vy = 0;
      }
      world.update(DT, 0, 0);
      world.player.hp = 999;
    }
    const dealt = dummies.reduce((s, e) => s + (e.maxHp - e.hp), 0);
    out[scenario] = dealt / T;
  }
  return out;
}

// ---- Reports ----

function pct(n: number): string {
  return `${Math.round(n * 100)}%`.padStart(4);
}

function stageReport(runs: number, ids: string[], skill: BotSkill): void {
  console.log(`\n== Stages: ${skill} bot, ${runs} runs per character, no talents ==`);
  console.log('stage  win   avgHP  diesAt(avg)  worst char         best char          sec/run');
  const all: RunResult[] = [];
  for (const id of ids) {
    const stage = stageById(id);
    const t0 = performance.now();
    const results: RunResult[] = [];
    for (const ch of CHARACTERS) {
      for (let i = 0; i < runs; i++) results.push(playRun(stage, ch, 1000 + i, { skill }));
    }
    all.push(...results);
    const won = results.filter((r) => r.won);
    const lost = results.filter((r) => !r.won);
    const byChar = CHARACTERS.map((c) => {
      const rs = results.filter((r) => r.character === c.id);
      return { name: c.name, win: rs.filter((r) => r.won).length / rs.length };
    }).sort((a, b) => a.win - b.win);
    const avgHp = won.length ? won.reduce((s, r) => s + r.hpLeft, 0) / won.length : 0;
    const diesAt = lost.length ? (lost.reduce((s, r) => s + r.wave, 0) / lost.length).toFixed(1) : '-';
    const sec = ((performance.now() - t0) / 1000 / results.length).toFixed(2);
    const worst = byChar[0];
    const best = byChar[byChar.length - 1];
    console.log(
      `${id.padEnd(5)} ${pct(won.length / results.length)}  ${pct(avgHp)}   ${String(diesAt).padStart(5)}/${stage.waves}     ` +
        `${worst.name} ${pct(worst.win)}`.padEnd(18) +
        `  ${best.name} ${pct(best.win)}`.padEnd(19) +
        `  ${sec}`,
    );
  }
  // Per-wave damage taken, and which waves kill.
  console.log('\nDeaths by wave (stage: wave×count), boss timeouts marked T:');
  for (const id of ids) {
    const rs = all.filter((r) => r.stage === id && !r.won);
    const counts = new Map<string, number>();
    for (const r of rs) {
      const k = `${r.wave}${r.timedOut ? 'T' : ''}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    console.log(`  ${id}: ${[...counts].sort().map(([k, n]) => `w${k}×${n}`).join('  ') || '—'}`);
  }
  console.log('\nBoss wave clear time (s, wins only):');
  for (const id of ids) {
    const times = new Map<number, number[]>();
    for (const r of all.filter((x) => x.stage === id)) {
      for (const w of r.waves) {
        if (!w.boss || (r.won === false && w.wave === r.wave)) continue;
        times.set(w.wave, [...(times.get(w.wave) ?? []), w.time]);
      }
    }
    const parts = [...times].map(([w, ts]) => `w${w}: ${(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(0)}s`);
    if (parts.length) console.log(`  ${id}: ${parts.join('  ')}`);
  }
}

function weaponReport(runs: number, stageId: string): void {
  const stage = stageById(stageId);
  console.log(`\n== Weapons: one weapon only, stage ${stageId}, ${runs} runs each ==`);
  console.log('weapon   win   diesAt  timeouts  bossLeft  a final build');
  const rows: Array<{ id: string; win: number; line: string }> = [];
  for (const w of WEAPONS) {
    const ch: CharacterDef = { ...CHARACTERS[0], startWeapon: w.id, mods: {}, special: undefined };
    const results: RunResult[] = [];
    for (let i = 0; i < runs; i++) results.push(playRun(stage, ch, 2000 + i, { plan: { onlyWeapon: w.id } }));
    const won = results.filter((r) => r.won);
    const lost = results.filter((r) => !r.won);
    const diesAt = lost.length ? (lost.reduce((s, r) => s + r.wave, 0) / lost.length).toFixed(1) : '-';
    const win = won.length / results.length;
    const timeouts = lost.filter((r) => r.timedOut).length;
    const bossLost = lost.filter((r) => r.bossLeft > 0);
    const bossLeft = bossLost.length ? bossLost.reduce((a, r) => a + r.bossLeft, 0) / bossLost.length : 0;
    const sample = results[0].weapons.join(' ');
    rows.push({
      id: w.id,
      win,
      line: `${w.name.padEnd(4, '　')} ${pct(win)}  ${String(diesAt).padStart(5)}  ${String(timeouts).padStart(5)}     ${pct(bossLeft)}    ${sample}`,
    });
  }
  for (const r of rows.sort((a, b) => b.win - a.win)) console.log(r.line);
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** How far endless runs get: the spread matters for a leaderboard. */
function endlessReport(runs: number, skill: BotSkill, talents: Record<string, number>): void {
  const tag = Object.keys(talents).length ? 'maxed talents' : 'no talents';
  console.log(`\n== Endless: ${skill} bot, ${tag}, ${runs} runs per character (cap ${ENDLESS_CAP}) ==`);
  console.log('character   p10  p25  median  p75  p90  max   timeouts  avg min/run');
  const all: number[] = [];
  const deathWaves = new Map<number, number>();
  for (const ch of CHARACTERS) {
    const waves: number[] = [];
    let timeouts = 0;
    let minutes = 0;
    for (let i = 0; i < runs; i++) {
      const r = playRun(null, ch, 3000 + i, { skill, talents });
      waves.push(r.wave);
      if (r.timedOut) timeouts++;
      minutes += r.waves.reduce((s, w) => s + w.time, 0) / 60;
      deathWaves.set(r.wave, (deathWaves.get(r.wave) ?? 0) + 1);
    }
    waves.sort((a, b) => a - b);
    all.push(...waves);
    const q = (x: number) => String(quantile(waves, x)).padStart(4);
    console.log(
      `${ch.name.padEnd(6, '　')} ${q(0.1)} ${q(0.25)}   ${q(0.5)}  ${q(0.75)} ${q(0.9)} ${String(waves[waves.length - 1]).padStart(4)}   ${String(timeouts).padStart(5)}     ${(minutes / runs).toFixed(1)}`,
    );
  }
  all.sort((a, b) => a - b);
  const q = (x: number) => quantile(all, x);
  console.log(`all         p10 ${q(0.1)}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  p90 ${q(0.9)}`);
  console.log(`ends at: ${[...deathWaves].sort((a, b) => a[0] - b[0]).map(([w, n]) => `w${w}×${n}`).join(' ')}`);
}

/** Average level, shards earned and wave time by wave: the power curve. */
function curveReport(runs: number, stageId: string, skill: BotSkill): void {
  const stage = stageId === 'endless' ? null : stageById(stageId);
  const rows = new Map<number, { n: number; level: number; earned: number; time: number; dmg: number }>();
  for (const ch of CHARACTERS) {
    for (let i = 0; i < runs; i++) {
      const r = playRun(stage, ch, 4000 + i, { skill });
      for (const w of r.waves) {
        const row = rows.get(w.wave) ?? { n: 0, level: 0, earned: 0, time: 0, dmg: 0 };
        row.n++;
        row.level += w.level;
        row.earned += w.earned;
        row.time += w.time;
        row.dmg += w.damageTaken;
        rows.set(w.wave, row);
      }
    }
  }
  console.log(`\n== Curve: ${stageId}, ${skill} bot, ${runs} runs per character ==`);
  console.log('wave  alive  level  shards(total)  wave sec  dmg taken');
  for (const [wave, r] of [...rows].sort((a, b) => a[0] - b[0])) {
    console.log(
      `${String(wave).padStart(4)}  ${String(r.n).padStart(5)}  ${(r.level / r.n).toFixed(1).padStart(5)}  ${(r.earned / r.n).toFixed(0).padStart(13)}  ${(r.time / r.n).toFixed(0).padStart(8)}  ${(r.dmg / r.n).toFixed(1).padStart(9)}`,
    );
  }
}

/** How much of the time the screen is frozen or shaking, like the player sees it. */
function feelReport(runs: number, ids: string[]): void {
  config.hitStop = true;
  config.shake = true;
  console.log('\n== Feel: freeze frames and camera shake (good bot) ==');
  console.log('stage     frozen   freezes/s   avg shake px   shaking >3px');
  for (const id of ids) {
    const feel: Feel = { total: 0, frozen: 0, freezes: 0, shakeSum: 0, shaky: 0 };
    const stage = id === 'endless' ? null : stageById(id);
    for (const ch of CHARACTERS) for (let i = 0; i < runs; i++) playRun(stage, ch, 5000 + i, { feel });
    const moving = feel.total - feel.frozen;
    console.log(
      `${id.padEnd(8)} ${pct(feel.frozen / feel.total)}     ${(feel.freezes / feel.total).toFixed(2).padStart(6)}       ${(feel.shakeSum / (moving / DT)).toFixed(1).padStart(6)}        ${pct(feel.shaky / moving)}`,
    );
  }
  config.hitStop = false;
  config.shake = false;
}

const MAX_TALENTS: Record<string, number> = { vitality: 5, power: 5, swift: 5, fortune: 5, luck: 5, scholar: 5 };

function dpsReport(): void {
  console.log('\n== Static DPS (no stats), tier I and IV; per shard = tier-I DPS ÷ price ==');
  console.log('weapon    single  crowd   single4  crowd4  crowd/price');
  for (const w of WEAPONS) {
    const t1 = dpsTest(w.id, 0);
    const t4 = dpsTest(w.id, 3);
    console.log(
      `${w.name.padEnd(4, '　')}  ${t1.single.toFixed(1).padStart(6)}  ${t1.crowd.toFixed(1).padStart(6)}  ` +
        `${t4.single.toFixed(1).padStart(7)}  ${t4.crowd.toFixed(1).padStart(6)}  ${(t1.crowd / w.price).toFixed(2).padStart(6)}`,
    );
  }
}

// ---- CLI ----

const args = process.argv.slice(2).filter((a) => a !== '--');
const cmd = args[0] ?? 'stages';
const runs = Number(args[1] ?? 10);
const skill: BotSkill = args.includes('casual') ? 'casual' : 'good';
if (cmd === 'stages') {
  const ids = args[2] && args[2] !== 'all' ? args[2].split(',') : ALL_STAGES.map((s) => s.id);
  stageReport(runs, ids, skill);
} else if (cmd === 'endless') {
  endlessReport(runs, skill, args.includes('talents') ? MAX_TALENTS : {});
} else if (cmd === 'feel') {
  feelReport(runs, args[2] ? args[2].split(',') : ['1-1', '1-5', '2-5']);
} else if (cmd === 'curve') {
  curveReport(runs, args[2] ?? '1-5', skill);
} else if (cmd === 'weapons') {
  weaponReport(runs, args[2] ?? '1-3');
} else if (cmd === 'dps') {
  dpsReport();
} else if (cmd === 'one') {
  const t0 = performance.now();
  const r = playRun(args[2] === 'endless' ? null : stageById(args[2] ?? '1-1'), CHARACTERS[Number(args[3] ?? 0)], runs, { skill });
  console.log(JSON.stringify(r, null, 1));
  console.log(`took ${((performance.now() - t0) / 1000).toFixed(2)}s`);
}
