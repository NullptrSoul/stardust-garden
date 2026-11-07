import { describe, expect, it } from 'vitest';
import { config } from './config';
import { CHARACTERS } from './data/characters';
import { Run } from './run';
import { damageTaken, damageMultiplier, BASE_STATS } from './stats';

const char = (id: string) => CHARACTERS.find((c) => c.id === id)!;

describe('Run', () => {
  it('starts with the character weapon and stat mods', () => {
    const run = new Run(char('ziling'), 1);
    expect(run.weapons).toEqual([{ id: 'talisman', tier: 0 }]);
    expect(run.stats.speed).toBe(15);
    expect(run.stats.maxHp).toBe(BASE_STATS.maxHp - 3);
  });

  it('levels up from shards and counts pending choices', () => {
    const run = new Run(char('bailan'), 1);
    const need = run.xpToNext();
    expect(run.collectShards(need - 1)).toBe(0);
    expect(run.collectShards(1)).toBe(1);
    expect(run.level).toBe(2);
    expect(run.pendingLevels).toBe(1);
    expect(run.shards).toBe(need);
  });

  it('applies the xp bonus', () => {
    const run = new Run(char('juyan'), 1); // +30% xp
    run.collectShards(10);
    expect(run.level).toBe(2);
    expect(run.xp).toBeCloseTo(13 - config.xpBase);
  });

  it('merges two weapons of the same name and tier', () => {
    const run = new Run(char('bailan'), 1);
    expect(run.addWeapon('staff', 0)).toBe('merged');
    expect(run.weapons).toEqual([{ id: 'staff', tier: 1 }]);
  });

  it('refuses a weapon when all slots are full and nothing merges', () => {
    const run = new Run(char('bailan'), 1);
    for (const id of ['crescent', 'talisman', 'fan', 'bubble', 'tome']) run.addWeapon(id, 0);
    expect(run.weapons.length).toBe(config.maxWeapons);
    expect(run.addWeapon('staff', 2)).toBe('full');
    expect(run.addWeapon('fan', 0)).toBe('merged');
  });

  it('charges for purchases and blocks when too poor', () => {
    const run = new Run(char('bailan'), 1);
    run.rollShop();
    const offer = run.offers[0];
    run.shards = offer.price - 1;
    expect(run.buy(offer)).toBe('poor');
    run.shards = offer.price;
    expect(['bought', 'merged']).toContain(run.buy(offer));
    expect(run.shards).toBe(0);
    expect(run.buy(offer)).toBe('sold');
  });

  it('keeps locked offers through a reroll', () => {
    const run = new Run(char('bailan'), 3);
    run.rollShop();
    const locked = run.offers[1];
    run.toggleLock(locked);
    run.shards = 100;
    run.reroll();
    expect(run.offers[1]).toBe(locked);
    run.toggleLock(locked);
    run.reroll();
    expect(run.offers[1]).not.toBe(locked);
  });

  it('sells weapons but never the last one', () => {
    const run = new Run(char('bailan'), 1);
    expect(run.sellWeapon(0)).toBe(0);
    run.addWeapon('fan', 0);
    const value = run.sellValue(run.weapons[1]);
    expect(run.sellWeapon(1)).toBe(value);
    expect(run.shards).toBe(value);
    expect(run.weapons.length).toBe(1);
  });

  it('opens a chest into an item or shards', () => {
    const run = new Run(char('bailan'), 1);
    run.chests = 2;
    const item = run.randomItem();
    run.resolveChest(item, true);
    expect(run.items.get(item.id)).toBe(1);
    run.resolveChest(item, false);
    expect(run.shards).toBe(run.chestSellValue(item));
    expect(run.chests).toBe(0);
  });

  it('rolls four different level-up stats', () => {
    const run = new Run(char('bailan'), 7);
    const cards = run.rollUpgrades();
    expect(cards.length).toBe(4);
    expect(new Set(cards.map((c) => c.key)).size).toBe(4);
  });

  it('gives 深汐 10% bonus shards after a wave', () => {
    const run = new Run(char('shenxi'), 1);
    run.shards = 100;
    run.finishWave();
    expect(run.shards).toBe(110);
  });
});

describe('characters', () => {
  it('each have their own named skill', () => {
    const kinds = CHARACTERS.map((c) => c.skill.kind);
    expect(new Set(kinds).size).toBe(CHARACTERS.length);
    for (const c of CHARACTERS) {
      expect(c.skill.name.length).toBeGreaterThan(0);
      expect(c.skill.desc.length).toBeGreaterThan(0);
    }
  });
});

describe('stats', () => {
  it('armor reduces damage but never below 1', () => {
    expect(damageTaken(10, 0)).toBe(10);
    expect(damageTaken(10, 10)).toBe(5);
    expect(damageTaken(1, 50)).toBe(1);
    expect(damageTaken(10, -5)).toBe(15);
  });

  it('adds general and class damage bonuses', () => {
    const s = { ...BASE_STATS, damage: 10, meleeDamage: 30, rangedDamage: -30 };
    expect(damageMultiplier(s, 'melee')).toBeCloseTo(1.4);
    expect(damageMultiplier(s, 'ranged')).toBeCloseTo(0.8);
  });
});

describe('Synergies', () => {
  it('gives the class bonus for each weapon with the class tag', () => {
    // 橘言 is a mage: +6% damage and +3% attack speed per arcane weapon; the tome is arcane.
    const run = new Run(char('juyan'), 1);
    const before = run.stats.damage;
    run.addWeapon('staff', 1); // arcane + shooter
    expect(run.stats.damage).toBe(before + 6 + 8); // one more class stack, plus the 2-arcane set
  });

  it('turns set bonuses on at 2 weapons and off again when one is sold', () => {
    const run = new Run(char('jinti'), 1); // crescent: melee
    const armor = run.stats.armor;
    run.addWeapon('fan', 0); // melee + element
    // Warrior +1 armor per melee weapon, and the 2-melee set gives +1 armor.
    expect(run.stats.armor).toBe(armor + 1 + 1);
    run.sellWeapon(1);
    expect(run.stats.armor).toBe(armor);
  });

  it('keeps level-up and item stats when weapons change', () => {
    const run = new Run(char('shenxi'), 1);
    run.applyUpgrade({ key: 'luck', value: 7, rarity: 0 });
    run.addWeapon('talisman', 0);
    run.sellWeapon(1);
    expect(run.stats.luck).toBe(7);
  });
});
