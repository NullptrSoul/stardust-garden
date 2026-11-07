import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './data/characters';
import { ENEMIES } from './data/enemies';
import { ALL_STAGES, chapterOfStage, nextStage, STAR_CLEAR, STAR_HEALTHY, STAR_NO_REVIVE, stageById } from './data/stages';
import { activeCombos, combosUnlockedBy, COMBOS } from './data/synergies';
import { TALENTS, talentCost, talentMods, talentShards } from './data/talents';
import { ITEM_SETS, ITEMS } from './data/items';
import { WEAPONS } from './data/weapons';
import { Run } from './run';
import { awardStars, buyTalent, emptySave, loadSave, resetProgress, stardustFor, submitEndless, totalStars } from './save';
import {
  bossesForWave,
  bossHpScale,
  bossTimeLimit,
  difficultyWave,
  enemyDamage,
  enemyHpScale,
  eliteChance,
  isEliteRush,
  isFinalWave,
  priceScale,
  spawnInterval,
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
    expect(loadSave({ get: () => '{not json', set: () => {} })).toEqual(emptySave());
    const tampered = JSON.stringify({ stardust: -50, stars: { '1-1': 15, nope: 7 }, talents: { power: 999 } });
    const save = loadSave({ get: () => tampered, set: () => {} });
    expect(save.stardust).toBe(0);
    expect(save.stars).toEqual({ '1-1': 7 });
    expect(save.talents.power).toBe(5);
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
