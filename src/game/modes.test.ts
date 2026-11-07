import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './data/characters';
import { ENEMIES } from './data/enemies';
import { ALL_STAGES, chapterOfStage, nextStage, STAR_CLEAR, STAR_HEALTHY, STAR_NO_REVIVE, stageById } from './data/stages';
import { activeCombos, combosUnlockedBy, COMBOS } from './data/synergies';
import { TALENTS, talentCost, talentMods, talentShards } from './data/talents';
import { ITEM_SETS, ITEMS } from './data/items';
import { BLESSINGS } from './data/blessings';
import { WEAPONS } from './data/weapons';
import { Run } from './run';
import { createWebLeaderboard, weekStart } from '../platform/web-leaderboard';
import { accountEmail, validName } from '../platform/names';
import { awardStars, buyTalent, emptySave, loadSave, resetProgress, stardustFor, submitEndless, totalStars } from './save';
import {
  bossesForWave,
  bossHpScale,
  bossTimeLimit,
  difficultyWave,
  enemyDamage,
  enemyHpScale,
  eliteChance,
  isBlessingWave,
  isEliteRush,
  isFinalWave,
  priceScale,
  spawnInterval,
  TIDE_START,
  tideScale,
  waveDuration,
  type WaveContext,
} from './waves';

const endless = (wave: number): WaveContext => ({ wave, mode: 'endless', stage: null });
const stage = (id: string, wave: number): WaveContext => ({ wave, mode: 'stage', stage: stageById(id) });

describe('Stages', () => {
  it('has two chapters of five stages that each end on a boss or an elite rush', () => {
    expect(ALL_STAGES.map((s) => s.id)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-2', '2-3', '2-4', '2-5']);
    for (const s of ALL_STAGES) {
      const last = stage(s.id, s.waves);
      expect(bossesForWave(last).length > 0 || isEliteRush(last)).toBe(true);
      expect(isFinalWave(last)).toBe(true);
      expect(isFinalWave(stage(s.id, s.waves - 1))).toBe(false);
    }
  });

  it('only names monsters and bosses that exist', () => {
    const ids = new Set(ENEMIES.map((e) => e.id));
    for (const s of ALL_STAGES) {
      for (const id of s.enemies ?? []) expect(ids.has(id)).toBe(true);
      for (const list of Object.values(s.bosses)) for (const id of list) expect(ids.has(id)).toBe(true);
    }
  });

  it('gives every regular wave a timer and boss waves none', () => {
    for (const s of ALL_STAGES) {
      for (let w = 1; w <= s.waves; w++) {
        const ctx = stage(s.id, w);
        if (bossesForWave(ctx).length > 0) expect(waveDuration(ctx)).toBe(0);
        else expect(waveDuration(ctx)).toBeGreaterThan(0);
      }
    }
  });

  it('makes later stages fight harder from the first wave', () => {
    expect(difficultyWave(stage('1-1', 1))).toBe(1);
    expect(difficultyWave(stage('1-4', 1))).toBeGreaterThan(difficultyWave(stage('1-2', 1)));
    expect(bossesForWave(stage('1-4', 9))).toEqual(['darkKnight', 'king']);
    expect(eliteChance(stage('1-2', 7))).toBeGreaterThan(eliteChance(stage('1-2', 6)));
  });

  it('starts a stage run with its shards plus talent bonuses', () => {
    const run = new Run(CHARACTERS[0], 1, 'stage', { stage: stageById('1-3'), bonus: { maxHp: 6 }, startShards: 51 });
    expect(run.shards).toBe(51);
    expect(run.stats.maxHp).toBe(new Run(CHARACTERS[0], 1).stats.maxHp + 6);
    expect(run.stage?.id).toBe('1-3');
  });
});

describe('Endless waves', () => {
  it('follows the old 10-wave bosses, then brings them back every 5 waves', () => {
    expect(bossesForWave(endless(5))).toEqual(['king']);
    expect(bossesForWave(endless(10))).toEqual(['queen']);
    expect(isFinalWave(endless(10))).toBe(false);
    expect(bossesForWave(endless(11))).toEqual([]);
    expect(bossesForWave(endless(15))).toEqual(['king']);
    expect(bossesForWave(endless(20))).toEqual(['darkKnight']);
    expect(bossesForWave(endless(25))).toEqual(['queen']);
    expect(bossesForWave(endless(30))).toEqual(['king']);
    expect(waveDuration(endless(12))).toBeGreaterThan(0);
    expect(bossHpScale(endless(20), 5)).toBeGreaterThan(bossHpScale(endless(15), 5));
    // The first bosses go easy: 1-1's boss, and endless before wave 10.
    expect(bossHpScale(stage('1-1', 6), 5)).toBeLessThan(1);
    expect(bossHpScale(endless(5), 5)).toBeLessThan(1);
  });

  it('spawns faster in late endless waves but never stops', () => {
    expect(spawnInterval(endless(20), false)).toBeLessThan(spawnInterval(endless(10), false));
    expect(spawnInterval(endless(200), false)).toBeGreaterThan(0);
  });
});

describe('Combos', () => {
  it('puts every weapon in at least two combos, all with real weapons', () => {
    const ids = new Set(WEAPONS.map((w) => w.id));
    for (const w of WEAPONS) {
      expect(COMBOS.filter((c) => c.weapons.includes(w.id)).length).toBeGreaterThanOrEqual(2);
    }
    for (const c of COMBOS) for (const id of c.weapons) expect(ids.has(id)).toBe(true);
    expect(new Set(COMBOS.map((c) => c.id)).size).toBe(COMBOS.length);
  });

  it('activates when both weapons are owned', () => {
    expect(activeCombos(['talisman'])).toHaveLength(0);
    expect(activeCombos(['talisman', 'bubble']).map((c) => c.id)).toEqual(['conductive']);
  });

  it('tells the shop which combos a new weapon would unlock', () => {
    expect(combosUnlockedBy(['talisman', 'staff'], 'bubble').map((c) => c.id)).toEqual(['galaxy', 'conductive']);
    expect(combosUnlockedBy(['talisman', 'bubble'], 'bubble')).toHaveLength(0);
  });
});

describe('Save', () => {
  it('merges stars across runs and counts only new ones', () => {
    const save = emptySave();
    expect(awardStars(save, '1-1', STAR_CLEAR | STAR_NO_REVIVE)).toBe(2);
    expect(awardStars(save, '1-1', STAR_CLEAR | STAR_HEALTHY)).toBe(1);
    expect(awardStars(save, '1-1', STAR_CLEAR)).toBe(0);
    expect(totalStars(save)).toBe(3);
  });

  it('pays more stardust for clears, later stages and new stars', () => {
    const lose = stardustFor({ wavesCleared: 4, cleared: false, newStars: 0, stageIndex: 0 });
    const win = stardustFor({ wavesCleared: 6, cleared: true, newStars: 3, stageIndex: 0 });
    const lateWin = stardustFor({ wavesCleared: 6, cleared: true, newStars: 3, stageIndex: 4 });
    expect(lose).toBeGreaterThan(0);
    expect(win).toBeGreaterThan(lose);
    expect(lateWin).toBeGreaterThan(win);
  });

  it('keeps the best endless run and counts a revived run once', () => {
    const save = emptySave();
    expect(submitEndless(save, { wave: 12, kills: 300, character: 'ziling' }, true)).toBe(true);
    expect(submitEndless(save, { wave: 9, kills: 500, character: 'jinti' }, true)).toBe(false);
    expect(submitEndless(save, { wave: 14, kills: 360, character: 'ziling' }, false)).toBe(true);
    expect(save.endless).toMatchObject({ bestWave: 14, bestKills: 360, character: 'ziling', runs: 2 });
  });

  it('buys talents with stardust up to the max level', () => {
    const save = emptySave();
    expect(buyTalent(save, 'vitality')).toBe('poor');
    save.stardust = 1000;
    for (let i = 0; i < 5; i++) expect(buyTalent(save, 'vitality')).toBe('ok');
    expect(buyTalent(save, 'vitality')).toBe('max');
    expect(save.stardust).toBe(1000 - [0, 1, 2, 3, 4].reduce((n, l) => n + talentCost(l), 0));
    expect(talentMods(save.talents).maxHp).toBe(15);
    save.talents.fortune = 2;
    expect(talentShards(save.talents)).toBe(16);
    expect(TALENTS.every((t) => t.mods || t.shards)).toBe(true);
  });

  it('survives a corrupt or tampered save', () => {
    // The leaderboard id is random per device, so leave it out of the comparison.
    expect({ ...loadSave({ get: () => '{not json', set: () => {} }), playerId: '' }).toEqual({ ...emptySave(), playerId: '' });
    const tampered = JSON.stringify({ stardust: -50, stars: { '1-1': 15, nope: 7 }, talents: { power: 999 } });
    const save = loadSave({ get: () => tampered, set: () => {} });
    expect(save.stardust).toBe(0);
    expect(save.stars).toEqual({ '1-1': 7 });
    expect(save.talents.power).toBe(5);
  });
});

describe('Leaderboard', () => {
  it('keeps the player id and nickname, also through a progress reset', () => {
    const save = emptySave();
    expect(save.playerId).toMatch(/^[0-9a-f]{32}$/);
    save.name = '星屑';
    const stored = JSON.stringify(save);
    const again = loadSave({ get: () => stored, set: () => {} });
    expect(again.playerId).toBe(save.playerId);
    expect(again.name).toBe('星屑');
    resetProgress(again);
    expect(again.playerId).toBe(save.playerId);
    expect(again.name).toBe('星屑');
  });

  it('ranks the best run per player, ignoring the player own runs', async () => {
    const data = new Map<string, string>();
    const board = createWebLeaderboard({ url: '', anonKey: '' }, { get: (k) => data.get(k) ?? null, set: (k, v) => data.set(k, v) });
    expect(board.online).toBe(false);
    const run = (playerId: string, wave: number, kills: number) =>
      board.submit({ playerId, name: playerId, character: 'shenxi', wave, kills, playTime: wave * 30, version: 'test' });
    await run('a', 20, 100);
    await run('a', 30, 50);
    await run('b', 25, 10);
    await run('c', 30, 80);
    const top = await board.top('all', 10);
    expect(top.map((r) => [r.playerId, r.wave])).toEqual([
      ['c', 30],
      ['a', 30],
      ['b', 25],
    ]);
    // a's own 30-wave run does not push a's new 26 down.
    expect(await board.rank('all', 26, 0, 'a')).toBe(2);
    expect(await board.rank('all', 31, 0, 'b')).toBe(1);
  });

  it('matches the minimum run time in docs/leaderboard.sql to the real wave lengths', () => {
    // Same formula as min_play_time() in the SQL: the regular waves before the one reached.
    const sql = (reached: number): number => {
      let t = 0;
      for (let k = 1; k < reached; k++) {
        t += k <= 10 ? [20, 25, 25, 30, 0, 35, 40, 0, 45, 0][k - 1] : k % 5 === 0 ? 0 : k <= 30 ? 30 : 25;
      }
      return t;
    };
    const game = (reached: number): number => {
      let t = 0;
      for (let k = 1; k < reached; k++) t += waveDuration(endless(k));
      return t;
    };
    for (const w of [2, 6, 11, 16, 31, 45, 80]) expect(sql(w)).toBe(game(w));
  });

  it('talks to our own server with the documented paths', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      const json = url.includes('/api/top')
        ? [{ player_id: 'p', name: '星屑', character: 'shenxi', wave: 23, kills: 9, play_time: 700 }]
        : url.includes('/api/rank')
          ? { rank: 4 }
          : { ok: true };
      return new Response(JSON.stringify(json), { status: 200 });
    }) as typeof fetch;
    const board = createWebLeaderboard({ kind: 'simple', url: 'https://x.example/', anonKey: '' }, { get: () => null, set: () => {} }, fake);
    expect(board.online).toBe(true);
    await board.submit({ playerId: 'p', name: '星屑', character: 'shenxi', wave: 23, kills: 9, playTime: 700.4, version: 'v' });
    expect(calls[0].url).toBe('https://x.example/api/scores');
    expect(JSON.parse(calls[0].body!)).toMatchObject({ player_id: 'p', play_time: 700, wave: 23 });
    expect((await board.top('week', 15))[0]).toMatchObject({ playerId: 'p', playTime: 700 });
    expect(calls[1].url).toBe('https://x.example/api/top?board=week&limit=15');
    expect(await board.rank('all', 23, 9, 'p')).toBe(4);
    expect(calls[2].url).toBe('https://x.example/api/rank?board=all&wave=23&kills=9&player_id=p');
  });

  it('checks account names like the SQL and maps them to a mail-free login', () => {
    expect(validName('星屑')).toBe(true);
    expect(validName('Mio_2')).toBe(true);
    expect(validName('a')).toBe(false);
    expect(validName('有 空格')).toBe(false);
    expect(validName('管理员')).toBe(false);
    expect(validName('Admin')).toBe(false);
    expect(accountEmail('Mio')).toBe(accountEmail('mio'));
    const longest = accountEmail('一二三四五六七八九十');
    expect(longest).toMatch(/^u[0-9a-f]+@stardust-garden\.invalid$/);
    expect(longest.split('@')[0].length).toBeLessThanOrEqual(64);
  });

  it('logs in, submits as the account, claims guest runs and logs out', async () => {
    const data = new Map<string, string>();
    const storage = { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => data.set(k, v) };
    const calls: Array<{ url: string; auth?: string; body?: string }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, auth: headers.Authorization, body: init?.body as string | undefined });
      const reply = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });
      if (url.includes('/auth/v1/signup')) {
        return reply({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'u1', user_metadata: { name: '星屑' } } });
      }
      if (url.includes('grant_type=password')) {
        return JSON.parse(init!.body as string).password === 'right'
          ? reply({ access_token: 'tok2', refresh_token: 'ref2', expires_in: 3600, user: { id: 'u1', user_metadata: { name: '星屑' } } })
          : reply({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      }
      if (url.includes('rpc/name_available')) return reply(true);
      if (url.includes('rpc/claim_guest_scores')) return reply(2);
      return reply([]);
    }) as typeof fetch;
    const board = createWebLeaderboard({ kind: 'supabase', url: 'https://db.example', anonKey: 'sb_publishable_x' }, storage, fake);
    expect(board.accounts).toBe(true);
    expect(board.account()).toBeNull();
    const guestTag = await board.myTag('dev');
    expect(await board.nameAvailable('星屑')).toBe(true);
    await expect(board.register('星屑', '123')).rejects.toThrow('bad_password');
    expect(await board.register('星屑', '123456')).toEqual({ userId: 'u1', name: '星屑' });
    expect(await board.myTag('dev')).not.toBe(guestTag);
    await board.submit({ playerId: 'dev', name: '星屑', character: 'shenxi', wave: 5, kills: 9, playTime: 130, version: 'v' });
    expect(calls[calls.length - 1].url).toBe('https://db.example/rest/v1/scores');
    expect(calls[calls.length - 1].auth).toBe('Bearer tok');
    expect(await board.claim('dev')).toBe(2);
    expect(JSON.parse(calls[calls.length - 1].body!)).toEqual({ p_player_id: 'dev' });
    // A new page load keeps the login.
    const again = createWebLeaderboard({ kind: 'supabase', url: 'https://db.example', anonKey: 'sb_publishable_x' }, storage, fake);
    expect(again.account()).toEqual({ userId: 'u1', name: '星屑' });
    again.logout();
    expect(again.account()).toBeNull();
    expect(await again.myTag('dev')).toBe(guestTag);
    await expect(again.login('星屑', 'wrong')).rejects.toThrow('wrong_login');
    expect((await again.login('星屑', 'right')).userId).toBe('u1');
  });

  it('starts the week on Monday', () => {
    const wed = new Date(2026, 10, 11, 15, 30);
    const mon = new Date(weekStart(wed));
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(9);
    expect(new Date(weekStart(new Date(2026, 10, 15, 23))).getDate()).toBe(9);
  });
});

describe('Weapons and items', () => {
  it('has twelve weapons, each with two traits and at least one tag', () => {
    expect(WEAPONS).toHaveLength(12);
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(12);
    for (const w of WEAPONS) {
      expect(w.traits).toHaveLength(2);
      expect(w.tags.length).toBeGreaterThan(0);
    }
  });

  it('has thirty items whose sets only name real items', () => {
    expect(ITEMS).toHaveLength(30);
    const ids = new Set(ITEMS.map((i) => i.id));
    expect(ids.size).toBe(30);
    for (const s of ITEM_SETS) for (const id of s.items) expect(ids.has(id)).toBe(true);
    for (const i of ITEMS) if (i.effect) expect(i.note).toBeTruthy();
  });

  it('adds a set bonus once all its pieces are owned', () => {
    const run = new Run(CHARACTERS[0], 1);
    const witch = ITEM_SETS.find((s) => s.id === 'witch')!;
    const before = run.stats.crit;
    for (const id of witch.items) run.addItem(ITEMS.find((i) => i.id === id)!);
    const fromItems = witch.items.reduce((n, id) => n + (ITEMS.find((i) => i.id === id)!.mods.crit ?? 0), 0);
    expect(run.stats.crit).toBe(before + fromItems + (witch.mods.crit ?? 0));
  });

  it('uses up a phoenix feather and pays piggy bank interest', () => {
    const run = new Run(CHARACTERS[0], 1);
    run.addItem(ITEMS.find((i) => i.id === 'feather')!);
    run.consumeItem('feather');
    expect(run.items.has('feather')).toBe(false);
    run.addItem(ITEMS.find((i) => i.id === 'piggy')!);
    run.shards = 100;
    run.finishWave();
    expect(run.shards).toBe(108);
  });
});

describe('Chapter 2', () => {
  it('follows chapter 1 and gets harder', () => {
    expect(nextStage('1-5')?.id).toBe('2-1');
    expect(chapterOfStage(stageById('2-3'))).toBe(2);
    expect(difficultyWave(stage('2-1', 1))).toBeGreaterThan(difficultyWave(stage('1-5', 1)));
    expect(bossHpScale(stage('2-5', 10), 8)).toBeGreaterThan(bossHpScale(stage('1-5', 10), 8));
  });

  it('keeps chapter 2 monsters out of chapter 1 and brings in the toad', () => {
    const ch2 = new Set(ENEMIES.filter((e) => e.chapter === 2).map((e) => e.id));
    for (const s of ALL_STAGES.filter((x) => chapterOfStage(x) === 1)) {
      for (const id of s.enemies ?? []) expect(ch2.has(id)).toBe(false);
    }
    expect(bossesForWave(stage('2-2', 7))).toEqual(['toad']);
    expect(ENEMIES.find((e) => e.id === 'toad')?.boss).toBe('toad');
  });
});

describe('Settings and tips', () => {
  it('keeps settings and tips through a save round trip', () => {
    const save = emptySave();
    save.settings.music = false;
    save.tips.push('battle');
    const raw = JSON.stringify(save);
    const loaded = loadSave({ get: () => raw, set: () => {} });
    expect(loaded.settings.music).toBe(false);
    expect(loaded.settings.sound).toBe(true);
    expect(loaded.tips).toEqual(['battle']);
  });

  it('wipes progress but keeps settings on reset', () => {
    const save = emptySave();
    save.stardust = 500;
    save.stars['1-1'] = 7;
    save.settings.shake = false;
    resetProgress(save);
    expect(save.stardust).toBe(0);
    expect(save.stars).toEqual({});
    expect(save.settings.shake).toBe(false);
  });
});

describe('Balance rules', () => {
  it('makes each level cost more than the last, faster than a straight line', () => {
    const run = new Run(CHARACTERS[0], 1);
    const cost = (level: number) => {
      run.level = level;
      return run.xpToNext();
    };
    expect(cost(2)).toBeGreaterThan(cost(1));
    expect(cost(21) - cost(20)).toBeGreaterThan(cost(3) - cost(2));
  });

  it('eases a late stage in over its first waves', () => {
    const first = difficultyWave(stage('2-4', 1));
    expect(first).toBeLessThan(1 + stageById('2-4').level);
    expect(difficultyWave(stage('2-4', 5))).toBe(5 + stageById('2-4').level);
    for (let w = 1; w < 6; w++) expect(difficultyWave(stage('2-4', w + 1))).toBeGreaterThan(difficultyWave(stage('2-4', w)));
  });

  it('ramps endless monsters and prices up past wave 10', () => {
    expect(enemyHpScale(endless(30))).toBeGreaterThan(20 * enemyHpScale(endless(10)));
    expect(enemyDamage(endless(30), 2)).toBeGreaterThan(enemyDamage(stage('2-5', 10), 2) * 3);
    expect(priceScale(endless(30))).toBeGreaterThan(5 * priceScale(endless(10)));
    // Stages keep the plain price growth.
    expect(priceScale(stage('1-5', 10))).toBeCloseTo(priceScale(endless(10)));
  });

  it('slows endless HP and damage growth late, so monsters stay killable', () => {
    const hpGrowth = (w: number) => enemyHpScale(endless(w + 1)) / enemyHpScale(endless(w));
    expect(hpGrowth(15)).toBeGreaterThan(hpGrowth(35));
    expect(hpGrowth(35)).toBeLessThan(1.15);
    const dmgGrowth = (w: number) => enemyDamage(endless(w + 1), 100) / enemyDamage(endless(w), 100);
    expect(dmgGrowth(15)).toBeGreaterThan(dmgGrowth(35));
    // Late endless waves are shorter, so a long run stays reasonable.
    expect(waveDuration(endless(36))).toBeLessThan(waveDuration(endless(16)));
  });

  it('raises the abyss tide after 25 minutes of endless battle only', () => {
    const at = (playTime: number, mode: 'endless' | 'stage' = 'endless'): WaveContext => ({
      wave: 40,
      mode,
      stage: mode === 'stage' ? stageById('2-5') : null,
      playTime,
    });
    expect(tideScale(at(TIDE_START - 1))).toBe(1);
    expect(tideScale(at(TIDE_START + 90))).toBeCloseTo(2);
    expect(tideScale(at(TIDE_START + 180))).toBeCloseTo(4);
    expect(tideScale(at(TIDE_START + 180, 'stage'))).toBe(1);
    expect(enemyHpScale(at(TIDE_START + 90))).toBeCloseTo(2 * enemyHpScale(at(0)));
  });

  it('offers blessings after endless boss waves from wave 10', () => {
    expect(isBlessingWave(endless(5))).toBe(false);
    expect(isBlessingWave(endless(10))).toBe(true);
    expect(isBlessingWave(endless(11))).toBe(false);
    expect(isBlessingWave(endless(15))).toBe(true);
    expect(isBlessingWave(stage('1-5', 10))).toBe(false);
  });

  it('applies blessings: stats, price freeze, one-time ones leave the pool', () => {
    const run = new Run(CHARACTERS[0], 1, 'endless');
    const damage = run.stats.damage;
    run.takeBlessing(BLESSINGS.find((b) => b.id === 'might')!);
    expect(run.stats.damage).toBe(damage + 15);
    run.wave = 20;
    const before = run.price(100);
    run.takeBlessing(BLESSINGS.find((b) => b.id === 'freeze')!);
    run.wave = 30;
    expect(run.price(100)).toBe(before);
    for (let i = 0; i < 50; i++) expect(run.rollBlessings().map((b) => b.id)).not.toContain('freeze');
    run.takeBlessing(BLESSINGS.find((b) => b.id === 'harvest')!);
    const shards = run.shards;
    for (let i = 0; i < 10; i++) run.collectShards(1);
    expect(run.shards - shards).toBe(13);
  });

  it('gives endless bosses a time limit and stage bosses none', () => {
    expect(bossTimeLimit(endless(15))).toBeGreaterThan(0);
    expect(bossTimeLimit(stage('1-5', 10))).toBe(0);
  });

  it('stops offering an item once the run holds its cap', () => {
    const run = new Run(CHARACTERS[0], 1);
    const feather = ITEMS.find((i) => i.id === 'feather')!;
    expect(feather.max).toBe(1);
    run.addItem(feather);
    for (let i = 0; i < 300; i++) expect(run.randomItem().id).not.toBe('feather');
    run.shards = 999;
    const offer = { kind: 'item' as const, id: 'feather', tier: 0, price: 10, sold: false, locked: false };
    expect(run.buy(offer)).toBe('max');
    expect(run.shards).toBe(999);
  });
});
