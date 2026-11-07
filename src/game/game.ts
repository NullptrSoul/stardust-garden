import { clamp, smoothing } from '../engine/math';
import { Rng } from '../engine/rng';
import { ButtonSet, type Button } from '../engine/ui';
import type { Platform, PlatformStorage, PointerInput } from '../platform/types';
import { Sfx } from './audio';
import { config } from './config';
import { CHARACTERS } from './data/characters';
import { activeItemSets, type ItemDef } from './data/items';
import { combosUnlockedBy } from './data/synergies';
import { weaponById } from './data/weapons';
import { Fx } from './fx';
import * as L from './layout';
import { Music } from './music';
import { itemById, Run, type UpgradeCard } from './run';
import { enemyById } from './data/enemies';
import { ALL_STAGES, chapterOfStage, CHAPTERS, nextStage, STAR_CLEAR, STAR_HEALTHY, STAR_NO_REVIVE, stageById } from './data/stages';
import { TALENTS, talentMods, talentShards } from './data/talents';
import {
  applySettings,
  awardStars,
  buyTalent,
  loadSave,
  resetProgress,
  SETTING_KEYS,
  stardustFor,
  submitEndless,
  writeSave,
  type SaveData,
} from './save';
import * as S from './screens';
import { bossesForWave, isEliteRush, isFinalWave, type GameMode } from './waves';
import { SKILL_MAX, World, type Enemy } from './world';

/** First-battle tips, shown one after another at the top of the screen. */
export const TIPS = [
  '按住屏幕任意位置拖动，角色就会移动',
  '武器会自动攻击附近的敌人，专心走位',
  '捡星屑升级，波次结束后去商店买装备',
  '能量满了点右下角，放出角色技能',
];
const TIP_TIME = 3.8;

/** Seconds the boss entrance banner holds the fight. */
const BOSS_INTRO_TIME = 2.2;

/** Seconds the world freezes for the skill cut-in before the skill lands. */
const CUTIN_TIME = 0.8;

/**
 * title: main menu. stages: chapter map. talents: spend stardust. select:
 * choose a character. battle: a wave is running. chest: open chests after a
 * wave. levelup: pick stat cards. shop: spend shards. pause: stats and
 * inventory. over: died. victory: cleared the stage.
 */
export type Scene = 'title' | 'stages' | 'talents' | 'settings' | 'select' | 'battle' | 'chest' | 'levelup' | 'shop' | 'pause' | 'over' | 'victory';

const MOVE_KEYS: Record<string, [number, number]> = {
  w: [0, -1],
  arrowup: [0, -1],
  s: [0, 1],
  arrowdown: [0, 1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

export class Game {
  scene: Scene = 'title';
  selected = 0;
  mode: GameMode = 'stage';
  /** Stage picked on the chapter map. */
  stageId = ALL_STAGES[0].id;
  /** Chapter shown on the chapter map. */
  chapterIndex = 0;
  /** Progress on this device: stars, stardust, talents, endless record. */
  readonly save: SaveData;
  /** The endless run that just ended set a new best. */
  newRecord = false;
  /** First-run tips shown at the top of the battle: which one, and seconds left on it. */
  tutorial: { step: number; t: number } | null = null;
  /** Where the settings screen returns to. */
  private settingsFrom: 'title' | 'pause' = 'title';
  /** The progress reset needs a second tap within a few seconds. */
  resetArmedUntil = 0;
  /** What the run that just ended earned, for the end screen. */
  lastResult: { stars: number; newStars: number; stardust: number } | null = null;
  run: Run | null = null;
  upgradeCards: UpgradeCard[] = [];
  chestItem: ItemDef | null = null;
  /** Weapon slot picked in the shop for selling, or -1. */
  selectedSlot = -1;
  /** Where the pause/stats screen returns to. */
  pausedFrom: 'battle' | 'shop' = 'battle';
  /** The shop open before wave 1, for spending the stage's starting shards. */
  preShop = false;
  time = 0;
  toast = { text: '', t: 0 };
  /** Floating virtual joystick, in design coordinates. */
  readonly stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  /** World point at the center of the screen. */
  readonly camera = { x: L.ARENA_CX, y: L.ARENA_CY };
  adRerollUsed = false;
  /** Skill cut-in in progress: the world is frozen until it ends. */
  cutin: { t: number; max: number } | null = null;
  /** Boss entrance in progress: the world is frozen and the camera looks at the boss. */
  bossIntro: { t: number; max: number; boss: Enemy } | null = null;
  /** Shop offer buttons, in offer order; the renderer reads their disabled state. */
  offerButtons: Button[] = [];
  readonly fx = new Fx();
  readonly ui = new ButtonSet();
  readonly sfx: Sfx;
  readonly music: Music;
  readonly world: World;
  private readonly rng: Rng;
  private readonly keys = new Set<string>();
  private pressed: Button | null = null;
  private pointerId: number | null = null;
  private skillWasReady = false;
  private readonly storage: PlatformStorage;

  constructor(platform: Platform) {
    this.sfx = new Sfx(platform);
    this.music = new Music(platform);
    this.storage = platform.storage;
    this.save = loadSave(this.storage);
    applySettings(this.save.settings);
    this.rng = new Rng((Math.random() * 0xffffffff) >>> 0);
    this.world = new World(this.rng, this.fx, this.sfx);
    this.enterTitle();
  }

  update(dt: number): void {
    this.updateMusic();
    this.toast.t = Math.max(0, this.toast.t - dt);
    const battle = this.scene === 'battle' && this.run !== null;
    // Freeze frames: everything holds still for a moment, effects included.
    if (battle && this.world.hitStop > 0) {
      this.world.hitStop -= dt;
      return;
    }
    this.time += dt;
    this.fx.update(dt);
    if (!battle || !this.run) return;
    if (this.bossIntro) {
      const intro = this.bossIntro;
      intro.t -= dt;
      // Look at the boss for most of the banner, then swing back to the player.
      const focus = intro.t > 0.5 ? intro.boss : null;
      this.updateCamera(dt, false, focus ? focus.x : undefined, focus ? focus.y : undefined);
      if (intro.t <= 0) this.bossIntro = null;
      return;
    }
    if (this.cutin) {
      this.cutin.t -= dt;
      if (this.cutin.t <= 0) {
        this.cutin = null;
        this.world.castSkill(this.run.character.skill.kind);
      }
      return;
    }
    this.updateTutorial(dt);
    const move = this.moveInput();
    const event = this.world.update(dt, move.x, move.y);
    this.updateCamera(dt, false);
    if (this.world.introBoss) {
      this.bossIntro = { t: BOSS_INTRO_TIME, max: BOSS_INTRO_TIME, boss: this.world.introBoss };
      this.world.introBoss = null;
      this.stick.active = false;
    }
    const ready = this.world.energy >= SKILL_MAX;
    if (ready && !this.skillWasReady) this.showToast('技能就绪！');
    this.skillWasReady = ready;
    if (this.world.bossFled) {
      this.world.bossFled = false;
      this.showToast('Boss 撤退了……');
    }
    if (event === 'waveCleared') this.onWaveCleared();
    else if (event === 'playerDied') this.enterEnd('over');
  }

  /** Calm music in menus, driving music in a run, the boss theme while a boss is up. */
  private updateMusic(): void {
    this.music.setEnabled(config.music);
    const menu = this.scene === 'title' || this.scene === 'stages' || this.scene === 'talents' || this.scene === 'select';
    const boss = this.world.boss !== null && this.world.boss.alive && this.scene === 'battle';
    this.music.setMood(menu || this.scene === 'over' || this.scene === 'victory' ? 'menu' : boss ? 'boss' : 'battle');
    this.music.update();
  }

  /** Spends full energy on the character's skill, starting with the cut-in. */
  private tryCast(): void {
    const run = this.run;
    if (this.scene !== 'battle' || !run || this.cutin || this.bossIntro || this.world.ending > 0) return;
    if (this.world.energy < SKILL_MAX) {
      this.fail(`技能充能中 ${Math.floor(this.world.energy)}%`);
      return;
    }
    this.world.energy = 0;
    this.skillWasReady = false;
    this.cutin = { t: CUTIN_TIME, max: CUTIN_TIME };
    this.sfx.skill();
  }

  // ---- Input ----

  /** Pointer input in design coordinates. */
  onPointer(type: PointerInput['type'], x: number, y: number, id: number): void {
    if (type === 'down') {
      this.sfx.unlock();
      if (this.pointerId !== null) {
        // A second finger while the first steers: buttons fire right away
        // (so the skill can be cast mid-dodge); anything else is ignored.
        const extra = this.ui.hit(x, y);
        if (extra && extra !== this.pressed) extra.onClick();
        return;
      }
      const b = this.ui.hit(x, y);
      if (b) {
        this.pressed = b;
        this.pointerId = id;
        return;
      }
      if (this.scene === 'battle') {
        this.pointerId = id;
        Object.assign(this.stick, { active: true, ox: x, oy: y, x, y });
      }
      return;
    }
    if (id !== this.pointerId) return;

    if (type === 'move') {
      if (!this.stick.active) return;
      const s = this.stick;
      s.x = x;
      s.y = y;
      // The base follows the finger once it goes past the rim.
      const dx = x - s.ox;
      const dy = y - s.oy;
      const d = Math.hypot(dx, dy);
      const max = config.joystickRadius;
      if (d > max) {
        s.ox = x - (dx / d) * max;
        s.oy = y - (dy / d) * max;
      }
      return;
    }

    this.pointerId = null;
    this.stick.active = false;
    if (this.pressed) {
      const b = this.pressed;
      this.pressed = null;
      if (type === 'up' && this.ui.hit(x, y) === b) b.onClick();
    }
  }

  onKey(type: 'down' | 'up', key: string): void {
    if (key === '*') {
      this.keys.clear();
      return;
    }
    if (type === 'down') {
      this.keys.add(key);
      if (key === 'escape' || key === 'p') {
        if (this.scene === 'battle') this.enterPause('battle');
        else if (this.scene === 'pause') this.leavePause();
      }
      if (key === ' ' || key === 'e') this.tryCast();
    } else {
      this.keys.delete(key);
    }
  }

  private moveInput(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.stick.active) {
      x = (this.stick.x - this.stick.ox) / config.joystickRadius;
      y = (this.stick.y - this.stick.oy) / config.joystickRadius;
    }
    for (const k of this.keys) {
      const v = MOVE_KEYS[k];
      if (v) {
        x += v[0];
        y += v[1];
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /**
   * Follows the player (or a focus point, for the boss entrance), but never
   * shows more than a margin past the island.
   */
  private updateCamera(dt: number, snap: boolean, focusX?: number, focusY?: number): void {
    const p = this.world.player;
    const hw = L.DESIGN_W / 2;
    const hh = L.DESIGN_H / 2;
    const fx = focusX ?? p.x;
    const fy = focusY ?? p.y;
    const tx = clamp(fx, L.ARENA.x - L.VIEW_MARGIN_X + hw, L.ARENA_RIGHT + L.VIEW_MARGIN_X - hw);
    const ty = clamp(fy - 30, L.ARENA.y - L.VIEW_MARGIN_TOP + hh, L.ARENA_BOTTOM + L.VIEW_MARGIN_BOTTOM - hh);
    const k = snap ? 1 : smoothing(focusX !== undefined ? 4 : 7, dt);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
  }

  // ---- Scenes ----

  private enterTitle(): void {
    this.scene = 'title';
    this.run = null;
    this.ui.clear();
    this.ui.add(S.TITLE_STORY, '章节冒险', 'primary', () => {
      this.sfx.click();
      this.enterStages();
    });
    this.ui.add(S.TITLE_ENDLESS, '无尽模式', 'secondary', () => {
      this.sfx.click();
      this.mode = 'endless';
      this.enterSelect();
    });
    this.ui.add(S.TITLE_TALENTS, '天赋', 'secondary', () => {
      this.sfx.click();
      this.enterTalents();
    });
    this.ui.add(S.TITLE_SETTINGS, '设置', 'secondary', () => {
      this.sfx.click();
      this.enterSettings('title');
    });
  }

  /** Chapter map, one chapter at a time. Every stage is open on the web build. */
  private enterStages(chapterIndex?: number): void {
    this.scene = 'stages';
    this.run = null;
    this.chapterIndex = chapterIndex ?? Math.max(0, chapterOfStage(stageById(this.stageId)) - 1);
    const chapter = CHAPTERS[this.chapterIndex];
    this.ui.clear();
    this.ui.add(S.SELECT_BACK, '◀ 返回', 'secondary', () => {
      this.sfx.click();
      this.enterTitle();
    });
    if (this.chapterIndex > 0) {
      this.ui.add(S.CHAPTER_PREV, '◀ 上一章', 'secondary', () => {
        this.sfx.click();
        this.enterStages(this.chapterIndex - 1);
      });
    }
    if (this.chapterIndex < CHAPTERS.length - 1) {
      this.ui.add(S.CHAPTER_NEXT, '下一章 ▶', 'secondary', () => {
        this.sfx.click();
        this.enterStages(this.chapterIndex + 1);
      });
    }
    chapter.stages.forEach((stage, i) => {
      this.ui.add(S.stageNode(i), '', 'card', () => {
        this.sfx.click();
        this.mode = 'stage';
        this.stageId = stage.id;
        this.enterSelect();
      });
    });
  }

  /** Spend stardust on permanent talents. */
  private enterTalents(): void {
    this.scene = 'talents';
    this.run = null;
    this.ui.clear();
    this.ui.add(S.SELECT_BACK, '◀ 返回', 'secondary', () => {
      this.sfx.click();
      this.enterTitle();
    });
    TALENTS.forEach((talent, i) => {
      this.ui.add(S.talentCard(i), '', 'card', () => {
        const result = buyTalent(this.save, talent.id);
        if (result === 'ok') {
          writeSave(this.storage, this.save);
          this.sfx.levelUp();
          this.showToast(`${talent.name}升到 ${this.save.talents[talent.id]} 级`);
        } else if (result === 'poor') this.fail('星尘不够');
        else this.fail('已经满级了');
      });
    });
  }

  /** Sound and screen-effect switches, plus the progress reset. */
  private enterSettings(from: 'title' | 'pause'): void {
    this.settingsFrom = from;
    this.scene = 'settings';
    this.resetArmedUntil = 0;
    this.ui.clear();
    this.ui.add(S.SELECT_BACK, '◀ 返回', 'secondary', () => {
      this.sfx.click();
      if (this.settingsFrom === 'pause') this.enterPause(this.pausedFrom);
      else this.enterTitle();
    });
    SETTING_KEYS.forEach((key, i) => {
      this.ui.add(S.settingsRow(i), '', 'card', () => {
        this.save.settings[key] = !this.save.settings[key];
        applySettings(this.save.settings);
        writeSave(this.storage, this.save);
        this.sfx.click();
      });
    });
    this.ui.add(S.SETTINGS_RESET, '清空进度', 'secondary', () => {
      if (this.time < this.resetArmedUntil) {
        resetProgress(this.save);
        writeSave(this.storage, this.save);
        this.resetArmedUntil = 0;
        this.sfx.levelUp();
        this.showToast('进度已清空');
      } else {
        this.resetArmedUntil = this.time + 3;
        this.fail('再点一次确认清空');
      }
    });
  }

  private enterSelect(): void {
    this.scene = 'select';
    this.run = null;
    this.ui.clear();
    this.ui.add(S.SELECT_BACK, '◀ 返回', 'secondary', () => {
      this.sfx.click();
      if (this.mode === 'stage') this.enterStages();
      else this.enterTitle();
    });
    CHARACTERS.forEach((_, i) => {
      this.ui.add(S.selectCard(i), '', 'card', () => {
        this.selected = i;
        this.sfx.click();
      });
    });
    const label = this.mode === 'endless' ? '开始无尽' : `开始 ${this.stageId}`;
    this.ui.add(S.SELECT_START, label, 'primary', () => this.startRun());
  }

  private startRun(): void {
    this.sfx.click();
    const stage = this.mode === 'stage' ? stageById(this.stageId) : undefined;
    this.run = new Run(CHARACTERS[this.selected], (this.rng.next() * 0xffffffff) >>> 0, this.mode, {
      stage,
      bonus: talentMods(this.save.talents),
      startShards: (stage?.startShards ?? 0) + talentShards(this.save.talents),
    });
    // Reset the arena now: the shop draws over it.
    this.world.startWave(this.run);
    // Later stages hand out starting shards; spend them before the first wave.
    this.preShop = this.run.shards > 0;
    if (this.preShop) this.enterShop();
    else this.beginWave();
  }

  /** Starts the run's current wave. */
  private beginWave(): void {
    if (!this.run) return;
    this.world.startWave(this.run);
    this.enterBattle(true);
    // First run on this device: walk through the controls.
    if (this.run.wave === 1 && !this.save.tips.includes('battle')) this.tutorial = { step: 0, t: TIP_TIME };
  }

  private enterBattle(newWave: boolean): void {
    this.scene = 'battle';
    this.ui.clear();
    this.ui.add(S.PAUSE_BUTTON, '', 'card', () => this.enterPause('battle'));
    this.ui.add(S.SKILL_BUTTON, '', 'card', () => this.tryCast());
    this.stick.active = false;
    this.pointerId = null;
    this.pressed = null;
    if (newWave && this.run) {
      this.cutin = null;
      this.bossIntro = null;
      this.skillWasReady = false;
      this.updateCamera(0, true);
      const run = this.run;
      const bosses = bossesForWave(run);
      const final = isFinalWave(run);
      let text = final ? '最终波' : `第 ${run.wave} 波`;
      if (isEliteRush(run)) text += ' · 精英怪潮！';
      else if (bosses.length > 1) text += ' · 双 Boss 来袭！';
      else if (bosses.length === 1) text += final ? `：${enemyById(bosses[0]).name}` : ' · Boss 来袭';
      this.showToast(text);
    }
  }

  private onWaveCleared(): void {
    const run = this.run;
    if (!run) return;
    run.finishWave();
    if (isFinalWave(run)) {
      this.enterEnd('victory');
      return;
    }
    this.afterWave();
  }

  /** Chests first, then level-ups, then the shop. */
  private afterWave(): void {
    const run = this.run;
    if (!run) return;
    if (run.chests > 0) this.enterChest();
    else if (run.pendingLevels > 0) this.enterLevelUp();
    else this.enterShop();
  }

  private enterChest(): void {
    const run = this.run;
    if (!run) return;
    this.scene = 'chest';
    const item = run.randomItem();
    this.chestItem = item;
    this.ui.clear();
    this.sfx.levelUp();
    this.ui.add(S.CHEST_KEEP, '收下', 'primary', () => {
      run.resolveChest(item, true);
      this.sfx.buy();
      this.afterWave();
    });
    this.ui.add(S.CHEST_SELL, `卖掉 +${run.chestSellValue(item)}`, 'secondary', () => {
      run.resolveChest(item, false);
      this.sfx.buy();
      this.afterWave();
    });
  }

  private enterLevelUp(): void {
    const run = this.run;
    if (!run) return;
    this.scene = 'levelup';
    this.upgradeCards = run.rollUpgrades();
    this.ui.clear();
    this.upgradeCards.forEach((card, i) => {
      this.ui.add(S.upgradeCard(i), '', 'card', () => {
        run.applyUpgrade(card);
        this.sfx.levelUp();
        this.afterWave();
      });
    });
  }

  private enterShop(): void {
    const run = this.run;
    if (!run) return;
    this.scene = 'shop';
    this.adRerollUsed = false;
    this.selectedSlot = -1;
    run.rollShop();
    this.buildShopButtons();
    if (!this.save.tips.includes('shop')) {
      this.markTip('shop');
      this.toast = { text: '点卡片购买，点锁头留到下一波', t: 4 };
    }
  }

  private buildShopButtons(): void {
    const run = this.run;
    if (!run) return;
    this.scene = 'shop';
    this.ui.clear();
    this.offerButtons = run.offers.map((offer, i) =>
      this.ui.add(S.offerCard(i), '', 'card', () => {
        const unlocks = offer.kind === 'weapon' ? combosUnlockedBy(run.weapons.map((w) => w.id), offer.id) : [];
        const setsBefore = activeItemSets(run.items).map((s) => s.id);
        const result = run.buy(offer);
        const newSet = activeItemSets(run.items).find((s) => !setsBefore.includes(s.id));
        if (result === 'poor') this.fail('星屑不够');
        else if (result === 'full') this.fail('武器栏满了，先卖掉一把');
        else if (result === 'max') this.fail('这件道具已经带满了');
        else if (result === 'merged') {
          this.sfx.levelUp();
          // Merging into III or IV unlocks that tier's trait.
          const tier = offer.tier + 1;
          const trait = tier >= 2 ? weaponById(offer.id).traits[tier - 2] : null;
          this.showToast(trait ? `合成升级！获得特性「${trait.name}」` : '合成升级！');
        } else if (result === 'bought') {
          this.sfx.buy();
          if (unlocks.length > 0) {
            this.sfx.levelUp();
            this.showToast(`联动激活「${unlocks.map((c) => c.name).join('」「')}」`);
          } else if (newSet) {
            this.sfx.levelUp();
            this.showToast(`套装集齐「${newSet.name}」`);
          }
        }
        this.refreshShopButtons();
      }),
    );
    // Locks are added after the cards so a tap on the lock wins.
    run.offers.forEach((offer, i) => {
      this.ui.add(S.offerLock(i), '', 'card', () => {
        if (offer.sold) return;
        run.toggleLock(offer);
        this.sfx.click();
      });
    });
    for (let i = 0; i < config.maxWeapons; i++) {
      this.ui.add(S.shopSlot(i), '', 'card', () => {
        if (!run.weapons[i]) return;
        this.selectedSlot = this.selectedSlot === i ? -1 : i;
        this.sfx.click();
        this.refreshShopButtons();
      });
    }
    this.ui.add(S.SHOP_SELL, '', 'secondary', () => {
      const slot = this.selectedSlot;
      if (slot < 0) return;
      if (run.weapons.length <= 1) {
        this.fail('至少要留一把武器');
        return;
      }
      const value = run.sellWeapon(slot);
      this.selectedSlot = -1;
      this.sfx.buy();
      this.showToast(`卖掉了，+${value} 星屑`);
      this.refreshShopButtons();
    });
    this.ui.add(S.SHOP_STATS, '属性', 'secondary', () => this.enterPause('shop'));
    this.ui.add(S.SHOP_REROLL, '', 'secondary', () => {
      if (!run.reroll()) {
        this.fail('星屑不够');
        return;
      }
      this.sfx.buy();
      this.buildShopButtons();
    });
    if (!this.adRerollUsed) {
      this.ui.add(S.SHOP_AD, '广告刷新', 'ad', () => {
        // Ad placeholder: the web build grants the reward right away.
        this.adRerollUsed = true;
        run.reroll(true);
        this.sfx.buy();
        this.buildShopButtons();
      });
    }
    this.ui.add(S.SHOP_NEXT, `第 ${this.preShop ? 1 : run.wave + 1} 波 ▶`, 'primary', () => {
      this.sfx.click();
      if (this.preShop) this.preShop = false;
      else run.startNextWave();
      this.beginWave();
    });
    this.refreshShopButtons();
  }

  private refreshShopButtons(): void {
    const run = this.run;
    if (!run) return;
    run.offers.forEach((offer, i) => {
      const b = this.offerButtons[i];
      const capped = offer.kind === 'item' && run.atCap(itemById(offer.id));
      if (b) b.disabled = offer.sold || capped || run.shards < offer.price;
    });
    for (const b of this.ui.list) {
      if (b.x === S.SHOP_REROLL.x && b.y === S.SHOP_REROLL.y) {
        b.label = `刷新 ${run.rerollCost()}`;
        b.disabled = run.shards < run.rerollCost();
      }
      if (b.x === S.SHOP_SELL.x && b.y === S.SHOP_SELL.y) {
        const w = run.weapons[this.selectedSlot];
        b.visible = !!w;
        b.disabled = run.weapons.length <= 1;
        b.label = w ? `卖掉 +${run.sellValue(w)}` : '';
      }
    }
  }

  private enterPause(from: 'battle' | 'shop'): void {
    this.pausedFrom = from;
    this.scene = 'pause';
    this.stick.active = false;
    this.ui.clear();
    this.ui.add(S.PAUSE_RESUME, from === 'battle' ? '继续' : '返回商店', 'primary', () => this.leavePause());
    this.ui.add(S.PAUSE_SETTINGS, '设置', 'secondary', () => {
      this.sfx.click();
      this.enterSettings('pause');
    });
    this.ui.add(S.PAUSE_QUIT, '放弃本局', 'secondary', () => (this.mode === 'stage' ? this.enterStages() : this.enterTitle()));
    this.sfx.click();
  }

  private leavePause(): void {
    if (this.pausedFrom === 'shop') this.buildShopButtons();
    else this.enterBattle(false);
  }

  private enterEnd(scene: 'over' | 'victory'): void {
    const run = this.run;
    this.scene = scene;
    this.ui.clear();
    this.stick.active = false;
    this.toast.t = 0;
    this.newRecord = false;
    this.lastResult = null;
    if (run) this.recordResult(run, scene === 'victory');
    const backLabel = this.mode === 'stage' ? '回地图' : '回主界面';
    const back = (): void => (this.mode === 'stage' ? this.enterStages() : this.enterTitle());
    if (scene === 'over' && run && !run.revived) {
      this.ui.add(S.END_PRIMARY, '看广告复活', 'ad', () => {
        // Ad placeholder: the web build grants the reward right away.
        run.revived = true;
        this.world.revive();
        this.enterBattle(false);
      });
      this.ui.add(S.END_SECONDARY, backLabel, 'secondary', back);
      return;
    }
    const next = scene === 'victory' && run?.stage ? nextStage(run.stage.id) : null;
    if (next) {
      this.ui.add(S.END_PRIMARY, `下一关 ${next.id} ▶`, 'primary', () => {
        this.stageId = next.id;
        this.enterSelect();
      });
    } else {
      this.ui.add(S.END_PRIMARY, '再来一局', 'primary', () => this.enterSelect());
    }
    this.ui.add(S.END_SECONDARY, backLabel, 'secondary', back);
  }

  /** Stars, stardust and the endless record for a run that just ended. */
  private recordResult(run: Run, cleared: boolean): void {
    const wavesCleared = cleared ? run.wave : run.wave - 1;
    let stars = 0;
    let newStars = 0;
    if (run.stage && cleared) {
      const healthy = this.world.player.hp >= run.stats.maxHp * 0.5;
      stars = STAR_CLEAR | (healthy ? STAR_HEALTHY : 0) | (run.revived ? 0 : STAR_NO_REVIVE);
      newStars = awardStars(this.save, run.stage.id, stars);
    }
    if (run.mode === 'endless') {
      const result = { wave: run.wave, kills: run.kills, character: run.character.id };
      this.newRecord = submitEndless(this.save, result, !run.recorded);
    }
    // Waves already paid out before a revive don't pay again.
    const stardust = stardustFor({
      wavesCleared: Math.max(0, wavesCleared - run.paidWaves),
      cleared,
      newStars,
      stageIndex: run.stage ? ALL_STAGES.indexOf(run.stage) : 0,
    });
    run.paidWaves = Math.max(run.paidWaves, wavesCleared);
    run.recorded = true;
    this.save.stardust += stardust;
    writeSave(this.storage, this.save);
    this.lastResult = { stars, newStars, stardust };
  }

  private markTip(id: string): void {
    if (this.save.tips.includes(id)) return;
    this.save.tips.push(id);
    writeSave(this.storage, this.save);
  }

  private updateTutorial(dt: number): void {
    const tip = this.tutorial;
    if (!tip) return;
    tip.t -= dt;
    if (tip.t > 0) return;
    tip.step++;
    tip.t = TIP_TIME;
    if (tip.step >= TIPS.length) {
      this.tutorial = null;
      this.markTip('battle');
    }
  }

  // ---- Feedback ----

  private showToast(text: string): void {
    this.toast = { text, t: 1.6 };
  }

  private fail(text: string): void {
    this.sfx.error();
    this.showToast(text);
  }

  // ---- Debug helpers (tuning panel and automated checks) ----

  debugEndWave(): void {
    if (this.scene !== 'battle') return;
    const w = this.world;
    if (w.duration > 0) w.elapsed = w.duration;
    else for (const b of w.bosses) b.hp = 0;
  }

  debugAddStardust(n: number): void {
    this.save.stardust += n;
    writeSave(this.storage, this.save);
  }

  debugFillSkill(): void {
    this.world.energy = SKILL_MAX;
  }

  /** Starts a given wave right away (testing bosses); starts a run if needed. */
  debugJumpToWave(wave: number): void {
    if (!this.run) this.startRun();
    const run = this.run;
    if (!run) return;
    run.wave = wave;
    this.world.startWave(run);
    this.enterBattle(true);
  }

  debugAddShards(n: number): void {
    if (!this.run) return;
    this.run.collectShards(n);
    if (this.scene === 'shop') this.refreshShopButtons();
  }
}
