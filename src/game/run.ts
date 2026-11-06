import { Rng } from '../engine/rng';
import { config } from './config';
import type { CharacterDef } from './data/characters';
import { ITEMS, type ItemDef } from './data/items';
import { LEVEL_UPGRADES, rollRarity } from './data/upgrades';
import { MAX_TIER, TIER_PRICE, WEAPONS, weaponById } from './data/weapons';
import { addMods, BASE_STATS, type StatKey, type Stats } from './stats';

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

/** Share of a weapon's price returned when selling it. */
const SELL_SHARE = 0.35;
/** Share of an item's price returned when selling it from a chest. */
const CHEST_SELL_SHARE = 0.5;

export type BuyResult = 'bought' | 'merged' | 'poor' | 'full' | 'sold';

/** Chance a shop slot holds a weapon rather than an item. */
const WEAPON_OFFER_CHANCE = 0.4;

/** Everything that persists across the waves of one run. */
export class Run {
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
  /** Treasure chests picked up this wave, opened when it ends. */
  chests = 0;
  offers: ShopOffer[] = [];
  rerolls = 0;
  private readonly rng: Rng;

  constructor(
    readonly character: CharacterDef,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.stats = { ...BASE_STATS };
    addMods(this.stats, character.mods);
    this.weapons.push({ id: character.startWeapon, tier: 0 });
  }

  xpToNext(): number {
    return config.xpBase + config.xpPerLevel * (this.level - 1);
  }

  /** Picking up shards gives money and experience. Returns levels gained. */
  collectShards(n: number): number {
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
    this.stats[card.key] += card.value;
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
  }

  price(base: number): number {
    return Math.round(base * (1 + config.priceGrowth * (this.wave - 1)));
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
    this.shards += value;
    return value;
  }

  randomItem(): ItemDef {
    return ITEMS[this.rng.int(0, ITEMS.length - 1)];
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
    addMods(this.stats, item.mods);
    this.items.set(item.id, (this.items.get(item.id) ?? 0) + 1);
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
    this.addItem(itemById(offer.id));
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
    return 'bought';
  }

  /** Called when a wave ends, before level-ups and the shop. */
  finishWave(): void {
    if (this.character.special === 'bonusShards') {
      this.shards += Math.floor(this.shards * 0.15);
    }
    this.rerolls = 0;
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
