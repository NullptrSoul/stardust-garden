import { Rng } from '../engine/rng';
import { config } from './config';
import type { CharacterDef } from './data/characters';
import { BLESSINGS, HARVEST_BONUS, type BlessingDef } from './data/blessings';
import { activeItemSets, ITEMS, type ItemDef } from './data/items';
import { LEVEL_UPGRADES, rollRarity } from './data/upgrades';
import { MAX_TIER, TIER_PRICE, WEAPONS, weaponById } from './data/weapons';
import { synergyMods } from './data/synergies';
import type { StageDef } from './data/stages';
import { addMods, BASE_STATS, type StatKey, type StatMods, type Stats } from './stats';
import { priceScale, type GameMode } from './waves';

export interface OwnedWeapon {
  id: string;
  tier: number;
}

export interface UpgradeCard {
  key: StatKey;
  value: number;
  rarity: number;
}

export interface ShopOffer {
  kind: 'weapon' | 'item';
  id: string;
  tier: number;
  price: number;
  sold: boolean;
  /** Locked offers survive rerolls and stay for the next shop. */
  locked: boolean;
}

export interface RunOptions {
  stage?: StageDef;
  /** Permanent talent bonuses. */
  bonus?: StatMods;
  startShards?: number;
}

/** Share of a weapon's price returned when selling it. */
const SELL_SHARE = 0.35;
/** Share of an item's price returned when selling it from a chest. */
const CHEST_SELL_SHARE = 0.5;
/** 深汐's passive: extra shards at the end of each wave. */
const SHENXI_INTEREST = 0.1;

/** full: no free weapon slot. max: that item is already held at its cap. */
export type BuyResult = 'bought' | 'merged' | 'poor' | 'full' | 'sold' | 'max';

/** Chance a shop slot holds a weapon rather than an item. */
const WEAPON_OFFER_CHANCE = 0.4;

/** Everything that persists across the waves of one run. */
export class Run {
  /** Stats from the character, level-ups and items, before synergy bonuses. */
  private readonly base: Stats;
  /** What the game uses: base stats plus the active synergy bonuses. */
  readonly stats: Stats;
  readonly weapons: OwnedWeapon[] = [];
  readonly items = new Map<string, number>();
  shards = 0;
  level = 1;
  xp = 0;
  /** The wave being played, or just finished while in the shop. */
  wave = 1;
  kills = 0;
  /** Level-ups earned this wave, chosen when it ends. */
  pendingLevels = 0;
  lastStandUsed = false;
  revived = false;
  /** Set once the run went to the leaderboard. */
  submitted = false;
  /** Set once the run's result went into the records (a revive can end it twice). */
  recorded = false;
  /** Waves already turned into stardust (a revive can end the run twice). */
  paidWaves = 0;
  /** Treasure chests picked up this wave, opened when it ends. */
  chests = 0;
  offers: ShopOffer[] = [];
  rerolls = 0;
  /** Seconds of battle so far (endless: drives the abyss tide). */
  playTime = 0;
  /** Abyss blessings taken, by id, and the three on offer right now. */
  readonly blessings = new Map<string, number>();
  blessingChoices: BlessingDef[] = [];
  /** Wave from which shop prices stop climbing (the freeze blessing). */
  priceFreezeWave: number | null = null;
  /** Fractions of a shard from the harvest blessing, paid out once whole. */
  private shardFraction = 0;
  private readonly rng: Rng;

  /** The stage being played, or null in endless mode. */
  readonly stage: StageDef | null;

  constructor(
    readonly character: CharacterDef,
    seed: number,
    readonly mode: GameMode = 'stage',
    options: RunOptions = {},
  ) {
    this.rng = new Rng(seed);
    this.stage = options.stage ?? null;
    this.base = { ...BASE_STATS };
    addMods(this.base, character.mods);
    if (options.bonus) addMods(this.base, options.bonus);
    this.shards = options.startShards ?? 0;
    this.stats = { ...this.base };
    this.weapons.push({ id: character.startWeapon, tier: 0 });
    this.refreshStats();
  }

  /** Recomputes `stats`; call after base stats or weapons change. */
  private refreshStats(): void {
    Object.assign(this.stats, this.base);
    addMods(this.stats, synergyMods(this.character.cls, this.weapons.map((w) => w.id)));
    for (const set of activeItemSets(this.items)) addMods(this.stats, set.mods);
  }

  /** Uses up one copy of an item (the phoenix feather). */
  consumeItem(id: string): void {
    const n = this.items.get(id) ?? 0;
    if (n <= 1) this.items.delete(id);
    else this.items.set(id, n - 1);
    const item = ITEMS.find((x) => x.id === id);
    if (item) for (const key of Object.keys(item.mods) as StatKey[]) this.base[key] -= item.mods[key] ?? 0;
    this.refreshStats();
  }

  xpToNext(): number {
    const n = this.level - 1;
    return Math.round(config.xpBase + config.xpPerLevel * n + config.xpQuad * n * n);
  }

  /** Picking up shards gives money and experience. Returns levels gained. */
  collectShards(n: number): number {
    const harvest = this.blessingCount('harvest');
    if (harvest > 0) {
      this.shardFraction += n * HARVEST_BONUS * harvest;
      const extra = Math.floor(this.shardFraction + 1e-9);
      this.shardFraction -= extra;
      this.shards += extra;
    }
    this.shards += n;
    this.xp += n * Math.max(0.1, 1 + this.stats.xpGain / 100);
    let gained = 0;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      gained++;
    }
    this.pendingLevels += gained;
    return gained;
  }

  /** Four different stat cards for one level-up. */
  rollUpgrades(): UpgradeCard[] {
    const pool = this.rng.shuffle([...LEVEL_UPGRADES]).slice(0, 4);
    return pool.map((u) => {
      const rarity = rollRarity(this.rng.next(), this.wave, this.stats.luck);
      return { key: u.key, value: u.values[rarity], rarity };
    });
  }

  applyUpgrade(card: UpgradeCard): void {
    this.base[card.key] += card.value;
    this.refreshStats();
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
  }

  price(base: number): number {
    return Math.round(base * priceScale(this));
  }

  rerollCost(): number {
    return config.rerollBase + this.wave + this.rerolls * 2;
  }

  /** Fresh shop stock; locked, unsold offers keep their slot (and their old price). */
  rollShop(): void {
    const old = this.offers;
    this.offers = [];
    for (let i = 0; i < config.shopSize; i++) {
      const kept = old[i];
      if (kept && kept.locked && !kept.sold) {
        this.offers.push(kept);
        continue;
      }
      if (this.rng.chance(WEAPON_OFFER_CHANCE)) {
        const w = WEAPONS[this.rng.int(0, WEAPONS.length - 1)];
        const tier = Math.min(MAX_TIER, rollRarity(this.rng.next(), this.wave, this.stats.luck));
        this.offers.push({ kind: 'weapon', id: w.id, tier, price: this.price(w.price * TIER_PRICE[tier]), sold: false, locked: false });
      } else {
        const item = this.randomItem();
        this.offers.push({ kind: 'item', id: item.id, tier: 0, price: this.price(item.price), sold: false, locked: false });
      }
    }
  }

  toggleLock(offer: ShopOffer): void {
    if (!offer.sold) offer.locked = !offer.locked;
  }

  sellValue(w: OwnedWeapon): number {
    return Math.max(1, Math.round(this.price(weaponById(w.id).price * TIER_PRICE[w.tier]) * SELL_SHARE));
  }

  /** Sells the weapon in a slot. The last weapon can't be sold. Returns shards gained. */
  sellWeapon(index: number): number {
    const w = this.weapons[index];
    if (!w || this.weapons.length <= 1) return 0;
    const value = this.sellValue(w);
    this.weapons.splice(index, 1);
    this.refreshStats();
    this.shards += value;
    return value;
  }

  /** A random item, skipping the ones already held at their cap. */
  randomItem(): ItemDef {
    const pool = ITEMS.filter((x) => !this.atCap(x));
    return pool[this.rng.int(0, pool.length - 1)];
  }

  /** True when the run already holds as many of this item as it may. */
  atCap(item: ItemDef): boolean {
    return item.max !== undefined && (this.items.get(item.id) ?? 0) >= item.max;
  }

  chestSellValue(item: ItemDef): number {
    return Math.max(1, Math.round(this.price(item.price) * CHEST_SELL_SHARE));
  }

  /** Resolves one chest: keep the item, or sell it for shards. */
  resolveChest(item: ItemDef, keep: boolean): void {
    this.chests = Math.max(0, this.chests - 1);
    if (keep) this.addItem(item);
    else this.shards += this.chestSellValue(item);
  }

  addItem(item: ItemDef): void {
    addMods(this.base, item.mods);
    // Record the item first: refreshStats checks item sets.
    this.items.set(item.id, (this.items.get(item.id) ?? 0) + 1);
    this.refreshStats();
  }

  /** New stock for the reroll price; free=true is the ad reward. */
  reroll(free = false): boolean {
    const cost = free ? 0 : this.rerollCost();
    if (this.shards < cost) return false;
    this.shards -= cost;
    if (!free) this.rerolls++;
    this.rollShop();
    return true;
  }

  buy(offer: ShopOffer): BuyResult {
    if (offer.sold) return 'sold';
    if (this.shards < offer.price) return 'poor';
    if (offer.kind === 'weapon') {
      const result = this.addWeapon(offer.id, offer.tier);
      if (result === 'full') return 'full';
      this.shards -= offer.price;
      offer.sold = true;
      offer.locked = false;
      return result;
    }
    const item = itemById(offer.id);
    if (this.atCap(item)) return 'max';
    this.addItem(item);
    this.shards -= offer.price;
    offer.sold = true;
    offer.locked = false;
    return 'bought';
  }

  /** Adds a weapon; two of the same name and tier merge into the next tier. */
  addWeapon(id: string, tier: number): 'bought' | 'merged' | 'full' {
    weaponById(id); // throws on a bad id
    if (tier < MAX_TIER) {
      const twin = this.weapons.findIndex((w) => w.id === id && w.tier === tier);
      if (twin >= 0) {
        this.weapons[twin] = { id, tier: tier + 1 };
        return 'merged';
      }
    }
    if (this.weapons.length >= config.maxWeapons) return 'full';
    this.weapons.push({ id, tier });
    this.refreshStats();
    return 'bought';
  }

  /** Called when a wave ends, before level-ups and the shop. */
  finishWave(): void {
    if (this.character.special === 'bonusShards') {
      this.shards += Math.floor(this.shards * SHENXI_INTEREST);
    }
    // Piggy bank: interest on saved shards, capped so it can't snowball forever.
    const piggy = this.items.get('piggy') ?? 0;
    if (piggy > 0) this.shards += Math.floor(this.shards * Math.min(0.3, 0.08 * piggy));
    this.rerolls = 0;
  }

  blessingCount(id: string): number {
    return this.blessings.get(id) ?? 0;
  }

  /** Three different blessings, skipping one-time ones already taken. */
  rollBlessings(): BlessingDef[] {
    const pool = BLESSINGS.filter((b) => !(b.once && this.blessingCount(b.id) > 0));
    return this.rng.shuffle([...pool]).slice(0, 3);
  }

  takeBlessing(b: BlessingDef): void {
    this.blessings.set(b.id, this.blessingCount(b.id) + 1);
    if (b.mods) addMods(this.base, b.mods);
    if (b.id === 'freeze') this.priceFreezeWave = this.wave;
    this.blessingChoices = [];
    this.refreshStats();
  }

  startNextWave(): void {
    this.wave++;
  }
}

export function itemById(id: string): ItemDef {
  const item = ITEMS.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown item: ${id}`);
  return item;
}
