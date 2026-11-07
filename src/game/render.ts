import { clamp } from '../engine/math';
import { roundRectPath, type Button } from '../engine/ui';
import type { ImageSource, Platform, Surface } from '../platform/types';
import { drawCharacter } from './art/chibi';
import type { LoadedRig, RigMotion } from './art/rig';
import { RIGS } from './art/rigs';
import { circle, diamondPath, ellipse, FONT, formatNumber, heartPath, outlinedText, paint, sparklePath } from './art/draw';
import { bakeBackdrop, bakeCloud, bakeIsland, type IslandSprite } from './art/ground';
import { drawCandy, drawChest, drawItemIcon, drawLock, drawShardIcon, drawWeaponIcon } from './art/icons';
import { drawMonster } from './art/monsters';
import { config } from './config';
import { avatarImagePath, CHARACTERS, chibiImagePath, portraitImagePath, type CharacterDef } from './data/characters';
import { activeItemSets, ITEMS, setsForItem } from './data/items';
import {
  activeCombos,
  activeTier,
  CLASSES,
  combosUnlockedBy,
  countTags,
  CLASS_WEAPON_BONUS,
  describeClass,
  fitsClass,
  nextThreshold,
  SET_TIERS,
  TAG_INFO,
  TAG_ORDER,
  type ComboDef,
} from './data/synergies';
import { RARITY_COLORS, RARITY_NAMES } from './data/upgrades';
import { TIER_COLORS, TIER_COOLDOWN, TIER_DAMAGE, TIER_NAMES, weaponById } from './data/weapons';
import type { Game } from './game';
import * as L from './layout';
import { darken, lighten, palette, rgba } from './palette';
import { itemById, type Run, type ShopOffer } from './run';
import * as S from './screens';
import { describeMods, formatMod, MAX_DODGE, STAT_INFO, STAT_ORDER, type StatKey } from './stats';
import { isWindingUp } from './boss';
import { bossTimeLimit, MODE_NAMES, TIDE_START, tideScale } from './waves';
import { TIPS } from './game';
import { SETTING_KEYS } from './save';

const SETTING_INFO: Record<string, { name: string; desc: string }> = {
  sound: { name: '音效', desc: '打击、拾取、技能等声音' },
  music: { name: '背景音乐', desc: '主界面、战斗和 Boss 战的音乐' },
  shake: { name: '震屏', desc: '受击、爆炸时画面抖动' },
  hitStop: { name: '顿帧', desc: '击杀和暴击时画面短暂停顿' },
  screenFlash: { name: '受伤红边', desc: '受伤和低血量时屏幕四周泛红' },
  stickFollow: { name: '摇杆跟随手指', desc: '关：圆圈停在按下处；开：圆圈跟着手指走' },
};
import {
  ALL_STAGES,
  chapterById,
  chapterOfStage,
  CHAPTERS,
  STAR_LABELS,
  starCount,
  type ChapterTheme,
  type StageTint,
} from './data/stages';

const CHAPTER_NUMBERS = ['一', '二', '三', '四', '五'];
import { TALENTS, talentCost, talentMods } from './data/talents';
import { totalStars } from './save';

/** Node colors on the chapter map. */
const TINT_COLORS: Record<StageTint, string> = { day: '#6FBF86', dusk: '#EE9265', night: '#6C7DDB', starry: '#9A6BE0' };
/** Multiplied over the battlefield; day stages are left alone. */
const STAGE_TINTS: Record<StageTint, string> = { day: '#FFFFFF', dusk: '#FFE0CC', night: '#BEC6EE', starry: '#D2C4F4' };
import { SKILL_MAX, type Decal, type World } from './world';
import { AFFIXES } from './data/affixes';

const BUTTON_COLORS = {
  primary: ['#FFC2DD', '#FF7FB2', '#C2477F'],
  secondary: ['#D4C8FF', '#8E9BFF', '#4B3F9E'],
  ad: ['#FFEDB0', '#FFC34D', '#A8700E'],
} as const;

const PETALS = 18;

export class Renderer {
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly backdrop: Surface;
  /** One baked battlefield per chapter theme, made on first use. */
  private readonly islands = new Map<ChapterTheme, IslandSprite>();
  private readonly clouds: Surface[];
  private readonly images = new Map<string, ImageSource>();
  /** Layered character art, by character id, once the atlas has loaded. */
  private readonly rigs = new Map<string, LoadedRig>();
  private readonly playerMotion: RigMotion = { blend: 0, last: 0 };
  private readonly drawList: Array<{ y: number; draw: () => void }> = [];
  /**
   * The whole window in design units. Wider or taller screens than 720×1280
   * show extra scenery around the design area, so full-screen layers
   * (sky, vignette, banners) must cover this, not just the design area.
   */
  private readonly view = { x: 0, y: 0, w: L.DESIGN_W, h: L.DESIGN_H };

  constructor(private readonly platform: Platform) {
    const ctx = platform.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.backdrop = bakeBackdrop(platform);
    this.islands.set('garden', bakeIsland(platform, 'garden'));
    this.clouds = [bakeCloud(platform, 1), bakeCloud(platform, 2), bakeCloud(platform, 3)];
    // Character art is optional: missing files just keep the placeholder.
    for (const c of CHARACTERS) {
      for (const path of [chibiImagePath(c.id), portraitImagePath(c.id), avatarImagePath(c.id)]) {
        platform.loadImage(path).then(
          (img) => this.images.set(path, img),
          () => undefined,
        );
      }
      const rig = RIGS[c.id];
      if (rig) {
        platform.loadImage(rig.atlas).then(
          (atlas) => this.rigs.set(c.id, { def: rig, atlas }),
          () => undefined,
        );
      }
    }
    this.resize();
  }

  resize(): void {
    const v = this.platform.viewport();
    this.scale = Math.min(v.width / L.DESIGN_W, v.height / L.DESIGN_H);
    this.offsetX = (v.width - L.DESIGN_W * this.scale) / 2;
    this.offsetY = (v.height - L.DESIGN_H * this.scale) / 2;
    this.view.x = -this.offsetX / this.scale;
    this.view.y = -this.offsetY / this.scale;
    this.view.w = v.width / this.scale;
    this.view.h = v.height / this.scale;
  }

  /** Fills the whole window with the current fill style. */
  private fillView(): void {
    const v = this.view;
    this.ctx.fillRect(v.x - 2, v.y - 2, v.w + 4, v.h + 4);
  }

  /** Radial gradient centered on the window, reaching its corners. */
  private edgeGradient(inner: string, outer: string): CanvasGradient {
    const v = this.view;
    const cx = v.x + v.w / 2;
    const cy = v.y + v.h * 0.55;
    const far = Math.hypot(v.w, v.h) * 0.55;
    const g = this.ctx.createRadialGradient(cx, cy, Math.min(v.w, v.h) * 0.38, cx, cy, far);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    return g;
  }

  /** CSS pixels to design coordinates. */
  toDesign(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
  }

  draw(game: Game): void {
    const ctx = this.ctx;
    const canvas = this.platform.canvas;
    const dpr = this.platform.viewport().dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const run = game.run;
    ctx.fillStyle = game.scene === 'select' || !run ? palette.bgBottom : palette.skyBottom;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = this.scale * dpr;
    ctx.setTransform(s, 0, 0, s, this.offsetX * dpr, this.offsetY * dpr);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const menu =
      game.scene === 'title' || game.scene === 'stages' || game.scene === 'talents' || game.scene === 'settings' || game.scene === 'select';
    if (menu || !run) {
      ctx.drawImage(this.backdrop, 0, 0);
      if (game.scene === 'title') this.drawTitle(game);
      else if (game.scene === 'stages') this.drawStages(game);
      else if (game.scene === 'talents') this.drawTalents(game);
      else if (game.scene === 'settings') this.drawSettings(game);
      else if (game.scene === 'leaderboard') this.drawLeaderboard(game);
      else this.drawSelect(game);
    } else {
      this.drawSky(game);
      this.drawWorld(game, run, game.world);
      this.drawPetals(game.time);
      this.drawStageTint(run);
      this.drawVignette(game, run, game.world);
      if (game.scene === 'battle') {
        this.drawJoystick(game);
        this.drawBossPointer(game, game.world);
        this.drawSkillButton(game, run, game.world);
        this.drawTutorial(game);
      }
      this.drawHud(game, run, game.world);
      if (game.cutin && game.scene === 'battle') this.drawCutin(game, run);
      if (game.bossIntro && game.scene === 'battle') this.drawBossIntro(game);
      switch (game.scene) {
        case 'blessing':
          this.drawBlessing(game, run);
          break;
        case 'chest':
          this.drawChestScreen(game, run);
          break;
        case 'levelup':
          this.drawLevelUp(game, run);
          break;
        case 'shop':
          this.drawShop(game, run);
          break;
        case 'pause':
          this.drawPause(game, run);
          break;
        case 'over':
        case 'victory':
          this.drawEnd(game, run);
          break;
        default:
          break;
      }
    }
    for (const b of game.ui.list) if (b.visible && b.style !== 'card') this.drawButton(b);
    this.drawToast(game);
  }

  // ---- Scenery ----

  private drawSky(game: Game): void {
    const ctx = this.ctx;
    const v = this.view;
    const g = ctx.createLinearGradient(0, v.y, 0, v.y + v.h);
    g.addColorStop(0, palette.skyTop);
    g.addColorStop(0.55, palette.skyMid);
    g.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = g;
    this.fillView();
    // Clouds drift slowly and move a little against the camera for depth.
    const px = (game.camera.x - L.ARENA_CX) * 0.18;
    const py = (game.camera.y - L.ARENA_CY) * 0.18;
    const span = v.w + 420;
    const rows = Math.ceil(v.h / 165) + 1;
    for (let i = 0; i < Math.max(8, rows); i++) {
      const speed = 6 + (i % 3) * 4;
      const x = v.x + ((((i * 290 + game.time * speed - px) % span) + span) % span) - 300;
      const y = v.y + 40 + i * 165 - py;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.clouds[i % 3], x, y, 320, 142);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Screen-space darkening toward the edges keeps the eye on the fight;
   * red edges flash when hurt and breathe when HP is low.
   */
  private drawVignette(game: Game, run: Run, world: World): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.edgeGradient('rgba(10, 6, 18, 0)', 'rgba(10, 6, 18, 0.6)');
    this.fillView();
    if (!config.screenFlash) return;
    const p = world.player;
    const lowHp = p.hp > 0 && p.hp / run.stats.maxHp < 0.3;
    const red = Math.max(p.hurt * 0.55, lowHp ? 0.18 + 0.12 * Math.sin(game.time * 5) : 0);
    if (red <= 0.01) return;
    ctx.fillStyle = this.edgeGradient('rgba(255, 40, 80, 0)', `rgba(255, 40, 80, ${red})`);
    this.fillView();
  }

  private drawPetals(time: number): void {
    const ctx = this.ctx;
    const v = this.view;
    // Keep the same density on wider windows.
    const count = Math.round(PETALS * Math.max(1, (v.w * v.h) / (L.DESIGN_W * L.DESIGN_H)));
    for (let i = 0; i < count; i++) {
      const sx = (i * 0.618) % 1;
      const sy = (i * 0.371) % 1;
      const x = v.x + ((sx * (v.w + 60) + time * (14 + (i % 4) * 5)) % (v.w + 60)) - 30;
      const y = v.y + ((sy * (v.h + 60) + time * (26 + (i % 3) * 8)) % (v.h + 60)) - 30;
      ctx.save();
      ctx.translate(x + Math.sin(time * 1.5 + i) * 12, y);
      ctx.rotate(time * (1 + (i % 3) * 0.4) + i);
      // Drifting ash and the odd ember.
      ctx.fillStyle = i % 5 === 0 ? 'rgba(255, 150, 90, 0.7)' : 'rgba(170, 160, 180, 0.45)';
      ellipse(ctx, 0, 0, i % 5 === 0 ? 2.4 : 3.6, i % 5 === 0 ? 2.4 : 1.8);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- World ----

  private drawWorld(game: Game, run: Run, world: World): void {
    const ctx = this.ctx;
    const t = game.time;
    ctx.save();
    ctx.translate(L.DESIGN_W / 2 - game.camera.x + game.fx.offsetX, L.DESIGN_H / 2 - game.camera.y + game.fx.offsetY);
    const island = this.islandFor(run);
    ctx.drawImage(island.surface, island.x, island.y);

    // Jelly stains where monsters burst
    for (const d of world.decals) {
      if (d.kind === 'crack') {
        this.drawCrack(d);
        continue;
      }
      const a = Math.min(1, d.life / 1.5) * 0.4;
      ctx.fillStyle = rgba(d.color, a);
      for (let i = 0; i < 3; i++) {
        const ox = Math.cos(d.seed + i * 2.1) * d.r * 0.35;
        const oy = Math.sin(d.seed + i * 2.1) * d.r * 0.15;
        ellipse(ctx, d.x + ox, d.y + oy, d.r * (0.55 - i * 0.12), d.r * (0.28 - i * 0.06));
        ctx.fill();
      }
    }

    // Poison pools from flasks
    for (const pd of world.puddles) {
      const fade = Math.min(1, pd.t / 0.6, (pd.max - pd.t) / 0.15);
      ctx.save();
      ctx.globalAlpha = fade;
      ellipse(ctx, pd.x, pd.y, pd.r, pd.r * 0.55);
      const g = ctx.createRadialGradient(pd.x, pd.y, pd.r * 0.1, pd.x, pd.y, pd.r);
      g.addColorStop(0, 'rgba(150, 230, 70, 0.55)');
      g.addColorStop(1, 'rgba(90, 160, 40, 0.25)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 70, 20, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.9 + i * 0.27 + pd.x * 0.01) % 1;
        const bx = pd.x + Math.cos(i * 2.4 + pd.y) * pd.r * 0.55;
        const by = pd.y + Math.sin(i * 1.7 + pd.x) * pd.r * 0.28;
        circle(ctx, bx, by - k * 6, 2 + k * 4);
        ctx.strokeStyle = `rgba(200, 255, 140, ${(1 - k) * 0.8})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Boss attack warnings: the red area fills up as the hit gets closer.
    for (const z of world.zones) {
      const k = 1 - z.t / z.max;
      const blink = 0.5 + 0.5 * Math.sin(t * 24);
      ctx.save();
      if (z.kind === 'circle') {
        ellipse(ctx, z.x, z.y, z.r, z.r * L.GROUND_SQUASH);
        ctx.fillStyle = 'rgba(255, 40, 80, 0.16)';
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 59, 107, ${0.6 + 0.4 * blink})`;
        ctx.lineWidth = 4;
        ctx.stroke();
        ellipse(ctx, z.x, z.y, z.r * k, z.r * L.GROUND_SQUASH * k);
        ctx.fillStyle = 'rgba(255, 40, 80, 0.28)';
        ctx.fill();
      } else {
        const len = Math.hypot(z.x2 - z.x, z.y2 - z.y);
        ctx.translate(z.x, z.y);
        ctx.rotate(Math.atan2(z.y2 - z.y, z.x2 - z.x));
        roundRectPath(ctx, 0, -z.r, len, z.r * 2, z.r);
        ctx.fillStyle = 'rgba(255, 40, 80, 0.16)';
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 59, 107, ${0.6 + 0.4 * blink})`;
        ctx.lineWidth = 4;
        ctx.stroke();
        roundRectPath(ctx, 0, -z.r, len * k, z.r * 2, z.r);
        ctx.fillStyle = 'rgba(255, 40, 80, 0.3)';
        ctx.fill();
      }
      ctx.restore();
    }

    // Rifts where monsters are about to climb out.
    for (const m of world.spawns) {
      const r = Math.min(m.def.boss ? 120 : 70, m.def.radius * (m.elite ? 2 : 1.5));
      const glow = m.def.boss ? '#FF3B6B' : m.elite ? '#FF7A4A' : '#B76BFF';
      const k = clamp(1 - m.t / m.max, 0, 1);
      this.drawRift(m.x, m.y + m.def.radius * 0.3, r, k, glow, m.x * 0.37 + m.y * 0.11, t);
    }

    // Charger telegraph: where the dash will go.
    for (const e of world.enemies) {
      if (!e.alive || !e.def.charge || e.phase === 'move') continue;
      const len = e.def.charge.speed * e.def.charge.duration + e.r;
      const a = e.phase === 'windup' ? 0.25 + 0.25 * Math.sin(t * 30) : 0.15;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.atan2(e.dashY, e.dashX));
      roundRectPath(ctx, 0, -e.r * 0.7, len, e.r * 1.4, e.r * 0.7);
      ctx.fillStyle = `rgba(255, 92, 138, ${a})`;
      ctx.fill();
      ctx.restore();
    }

    for (const d of world.drops) {
      const bob = Math.sin(t * 5 + d.seed) * 3;
      if (d.kind === 'shard') drawShardIcon(ctx, d.x, d.y + bob, 9);
      else if (d.kind === 'candy') drawCandy(ctx, d.x, d.y + bob, 1);
      else {
        drawChest(ctx, d.x, d.y + bob, 1.1);
        sparklePath(ctx, d.x + 18, d.y - 16 + bob, 5 + 3 * Math.sin(t * 6), 0);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }
    }

    // Depth sort: things lower on screen draw in front.
    const list = this.drawList;
    list.length = 0;
    const p = world.player;
    const whale = world.skill.whale;
    if (whale) {
      // Shadow grows as the whale comes down.
      const k = 1 - whale.t / whale.max;
      ctx.fillStyle = `rgba(60, 80, 160, ${0.12 + 0.25 * k})`;
      ellipse(ctx, whale.x, whale.y, 240 * (0.4 + 0.6 * k), 90 * (0.4 + 0.6 * k));
      ctx.fill();
      ctx.strokeStyle = `rgba(143, 200, 255, ${0.5 + 0.4 * Math.sin(t * 20)})`;
      ctx.lineWidth = 4;
      ellipse(ctx, whale.x, whale.y, 240, 90);
      ctx.stroke();
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (e.slow > 0) {
        // Little wind swirl under slowed monsters.
        list.push({
          y: e.y - 1,
          draw: () => {
            ctx.strokeStyle = `rgba(143, 227, 217, ${Math.min(1, e.slow) * 0.9})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(e.x, e.y + e.r * 0.5, e.r * 1.1, e.r * 0.35, 0, t * 6, t * 6 + Math.PI * 1.4);
            ctx.stroke();
          },
        });
      }
      list.push({
        y: e.y,
        draw: () =>
          drawMonster(ctx, {
            look: e.def.look,
            color: e.color,
            // A quick jitter right after a hit.
            x: e.x + (e.shake > 0 ? Math.sin(t * 90 + e.id) * 5 * (e.shake / 0.12) : 0),
            y: e.y,
            r: e.r,
            facing: e.facing,
            flash: e.flash,
            pulse: e.pulse,
            appear: e.appear,
            time: t,
            seed: e.id,
            lookX: p.x,
            lookY: p.y - 40,
            alert: e.phase === 'windup' || (e.brain !== null && isWindingUp(e.brain)),
            menace: e.def.boss ? 2 : e.elite ? 1 : 0,
            lift: e.brain ? e.brain.z : 0,
            aura: e.affix ? AFFIXES[e.affix].color : undefined,
          }),
      });
    }
    // Elite affix names and HP bars, above everything on the ground.
    const tags: Array<() => void> = [];
    for (const e of world.enemies) {
      if (!e.alive || !e.affix || e.appear < 1) continue;
      const info = AFFIXES[e.affix];
      tags.push(() => {
        const top = e.y - e.r * 2.15;
        const w = e.r * 1.7;
        roundRectPath(ctx, e.x - w / 2, top + 14, w, 7, 3.5);
        ctx.fillStyle = 'rgba(30, 20, 50, 0.55)';
        ctx.fill();
        roundRectPath(ctx, e.x - w / 2, top + 14, w * clamp(e.hp / e.maxHp, 0, 1), 7, 3.5);
        ctx.fillStyle = info.color;
        ctx.fill();
        outlinedText(ctx, info.name, e.x, top, 18, '#FFFFFF', 'center', darken(info.color, 0.45));
      });
    }
    list.push({ y: p.y, draw: () => this.drawPlayer(run.character, world, t) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    for (const tag of tags) tag();

    // Spear stabs: a bright tapered streak.
    for (const th of world.thrusts) {
      const k = th.life / th.maxLife;
      const reach = th.len * (1 - k * 0.35);
      ctx.save();
      ctx.translate(th.x, th.y);
      ctx.rotate(th.angle);
      ctx.beginPath();
      ctx.moveTo(10, -9 * k);
      ctx.lineTo(reach, 0);
      ctx.lineTo(10, 9 * k);
      ctx.closePath();
      const g = ctx.createLinearGradient(10, 0, reach, 0);
      g.addColorStop(0, rgba(th.color, 0));
      g.addColorStop(1, `rgba(255, 255, 255, ${0.9 * k})`);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
    // Orbiting stars
    for (const w of world.weapons) {
      for (const o of w.orbs) {
        const glow = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, 24);
        glow.addColorStop(0, 'rgba(255, 230, 140, 0.7)');
        glow.addColorStop(1, 'rgba(255, 230, 140, 0)');
        ctx.fillStyle = glow;
        circle(ctx, o.x, o.y, 24);
        ctx.fill();
        sparklePath(ctx, o.x, o.y, 12, t * 4);
        paint(ctx, '#FFF3B0', 2, '#C9922E');
      }
    }
    for (const w of world.weapons) {
      const bob = Math.sin(t * 3 + w.x * 0.05) * 3;
      const size = 34 * (1 + w.kick * 0.18);
      circle(ctx, w.x, w.y + bob, 20);
      ctx.fillStyle = rgba(TIER_COLORS[w.tier], 0.55);
      ctx.fill();
      // A ring in the character's color marks weapons that fit her class.
      if (fitsClass(run.character.cls, w.def.id)) {
        circle(ctx, w.x, w.y + bob, 22 + Math.sin(t * 4) * 1.5);
        ctx.strokeStyle = rgba(run.character.color, 0.9);
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      drawWeaponIcon(ctx, w.def.id, w.x, w.y + bob, size);
    }

    // Fire ring orbs
    for (const o of world.skill.orbs) {
      const glow = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, 30);
      glow.addColorStop(0, 'rgba(255, 210, 120, 0.8)');
      glow.addColorStop(1, 'rgba(255, 159, 90, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(o.x - 30, o.y - 30, 60, 60);
      circle(ctx, o.x, o.y, 13);
      const g = ctx.createRadialGradient(o.x - 4, o.y - 4, 1, o.x, o.y, 13);
      g.addColorStop(0, '#FFF6D8');
      g.addColorStop(1, '#FF9F5A');
      paint(ctx, g, 2, '#C9661E');
    }
    if (whale) {
      const k = 1 - whale.t / whale.max;
      this.drawWhale(whale.x, whale.y - 620 * (1 - k) - 60, 1.4 + k * 0.6, Math.min(1, k * 3));
    }

    this.drawShots(world);
    this.drawEffects(world, t);
    this.drawParticles(game);
    for (const tx of game.fx.texts) {
      const age = tx.maxLife - tx.life;
      // Numbers punch in big, then settle.
      const pop = age < 0.12 ? 1.9 - age * 7.5 : 1;
      ctx.globalAlpha = clamp((tx.life / tx.maxLife) * 2.5, 0, 1);
      outlinedText(ctx, tx.text, tx.x, tx.y, tx.size * pop, tx.color);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** A glowing crack in the ground that tears open before a monster climbs out. */
  private drawRift(x: number, y: number, r: number, k: number, glow: string, seed: number, t: number): void {
    const ctx = this.ctx;
    const open = 1 - (1 - k) * (1 - k);
    const pr = r * (0.3 + 0.7 * open);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, pr * 0.1, 0, 0, pr);
    g.addColorStop(0, 'rgba(18, 6, 36, 0.9)');
    g.addColorStop(0.6, 'rgba(40, 14, 70, 0.55)');
    g.addColorStop(1, 'rgba(40, 14, 70, 0)');
    ctx.fillStyle = g;
    circle(ctx, 0, 0, pr);
    ctx.fill();
    // Light leaking out of the middle, so the rift reads on bright grass.
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, pr * 0.7);
    core.addColorStop(0, rgba(glow, 0.7 * open));
    core.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = core;
    circle(ctx, 0, 0, pr * 0.7);
    ctx.fill();
    this.crackPath(r * open, seed, 7);
    ctx.strokeStyle = 'rgba(20, 8, 36, 0.85)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 14 + seed);
    ctx.strokeStyle = glow;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // A faint ring keeps the spawn spot readable at a glance.
    circle(ctx, 0, 0, r);
    ctx.strokeStyle = rgba(glow, 0.45 + 0.4 * k);
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    for (let j = 0; j < 4; j++) {
      const kk = (t * 1.3 + j / 4 + seed) % 1;
      circle(ctx, x + Math.sin(j * 2.1 + seed) * pr * 0.5, y - kk * r * 1.3, 2.5 + (1 - kk) * 2);
      ctx.fillStyle = rgba(glow, (1 - kk) * open);
      ctx.fill();
    }
  }

  /** Broken ground left by a boss slam; fades out over a few seconds. */
  private drawCrack(d: Decal): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, d.life / 2);
    ctx.translate(d.x, d.y);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, d.r * 0.1, 0, 0, d.r * 0.75);
    g.addColorStop(0, 'rgba(40, 28, 44, 0.45)');
    g.addColorStop(1, 'rgba(40, 28, 44, 0)');
    ctx.fillStyle = g;
    circle(ctx, 0, 0, d.r * 0.75);
    ctx.fill();
    this.crackPath(d.r, d.seed, 9);
    ctx.strokeStyle = rgba(d.color, 0.8);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /** Jagged rays out from the origin, with a small fork on every other one. */
  private crackPath(len: number, seed: number, rays: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < rays; i++) {
      const a = seed + (i / rays) * Math.PI * 2 + Math.sin(seed * 3 + i) * 0.3;
      const reach = len * (0.7 + 0.45 * Math.abs(Math.sin(seed + i * 1.7)));
      ctx.moveTo(0, 0);
      let px = 0;
      let py = 0;
      for (let j = 1; j <= 3; j++) {
        const d = (reach * j) / 3;
        const off = Math.sin(seed * 5 + i * 3 + j * 2) * len * 0.12;
        px = Math.cos(a) * d - Math.sin(a) * off;
        py = Math.sin(a) * d + Math.cos(a) * off;
        ctx.lineTo(px, py);
        if (j === 2 && i % 2 === 0) {
          const fa = a + 0.6;
          ctx.lineTo(px + Math.cos(fa) * reach * 0.25, py + Math.sin(fa) * reach * 0.25);
          ctx.moveTo(px, py);
        }
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  private drawPlayer(c: CharacterDef, world: World, t: number): void {
    const p = world.player;
    drawCharacter(
      this.ctx,
      c,
      {
        x: p.x,
        feetY: p.y + 22,
        scale: 0.95,
        facing: p.facing,
        time: t,
        moving: p.moving,
        hurt: p.hurt,
        ghost: p.invuln > 0 && p.hp > 0,
        motion: this.playerMotion,
      },
      this.images.get(chibiImagePath(c.id)) ?? null,
      this.rigs.get(c.id) ?? null,
    );
  }

  private drawShots(world: World): void {
    const ctx = this.ctx;
    for (const s of world.shots) {
      if (s.kind === 'flask') {
        // A lobbed bottle: drawn up on an arc, with its shadow on the ground.
        const k = 1 - s.life / Math.max(0.01, s.maxLife);
        const h = Math.sin(k * Math.PI) * 70;
        ctx.fillStyle = 'rgba(20, 15, 10, 0.3)';
        ellipse(ctx, s.x, s.y + 16, 9, 4);
        ctx.fill();
        ctx.save();
        ctx.translate(s.x, s.y - h);
        ctx.rotate(k * 9);
        roundRectPath(ctx, -6, -4, 12, 13, 4);
        paint(ctx, '#B6F25A', 2.4, '#17111C');
        ctx.beginPath();
        ctx.rect(-3, -10, 6, 7);
        paint(ctx, '#C9B08A', 2, '#17111C');
        ctx.restore();
        continue;
      }
      const tail = s.kind === 'arrow' ? 0.05 : 0.035;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
      if (s.kind === 'arrow') {
        ctx.strokeStyle = 'rgba(159, 216, 255, 0.55)';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = '#E8F6FF';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        const a = Math.atan2(s.vy, s.vx);
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(a) * 10, s.y + Math.sin(a) * 10);
        ctx.lineTo(s.x + Math.cos(a + 2.5) * 7, s.y + Math.sin(a + 2.5) * 7);
        ctx.lineTo(s.x + Math.cos(a - 2.5) * 7, s.y + Math.sin(a - 2.5) * 7);
        ctx.closePath();
        paint(ctx, '#FFFFFF', 1.6, '#4F86C9');
      } else if (s.kind === 'ice') {
        ctx.strokeStyle = 'rgba(168, 230, 255, 0.6)';
        ctx.lineWidth = 8;
        ctx.stroke();
        const a = Math.atan2(s.vy, s.vx);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(0, -6);
        ctx.lineTo(-9, 0);
        ctx.lineTo(0, 6);
        ctx.closePath();
        paint(ctx, '#E6F8FF', 2, '#3C8DB8');
        ctx.restore();
      } else if (s.kind === 'star') {
        ctx.strokeStyle = 'rgba(255, 207, 102, 0.75)';
        ctx.lineWidth = 8;
        ctx.stroke();
        sparklePath(ctx, s.x, s.y, 13, s.life * 18);
        paint(ctx, '#FFF3B0', 2, '#C9922E');
      } else if (s.kind === 'fire') {
        ctx.strokeStyle = 'rgba(255, 159, 90, 0.65)';
        ctx.lineWidth = 12;
        ctx.stroke();
        circle(ctx, s.x, s.y, s.r);
        const g = ctx.createRadialGradient(s.x - 3, s.y - 3, 1, s.x, s.y, s.r);
        g.addColorStop(0, '#FFF6D8');
        g.addColorStop(1, '#FF9F5A');
        paint(ctx, g, 2, '#C9661E');
      } else {
        circle(ctx, s.x, s.y, s.r);
        paint(ctx, 'rgba(205, 235, 255, 0.8)', 2, '#5B86C9');
        ellipse(ctx, s.x - 4, s.y - 4, 3.5, 2.4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }
    }
    for (const b of world.bullets) {
      circle(ctx, b.x, b.y, b.r + 5);
      ctx.fillStyle = 'rgba(182, 242, 90, 0.3)';
      ctx.fill();
      circle(ctx, b.x, b.y, b.r);
      paint(ctx, palette.enemyBullet, 3, '#17111C');
      circle(ctx, b.x - 3, b.y - 3, 3.5);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
  }

  private drawEffects(world: World, t: number): void {
    const ctx = this.ctx;
    for (const s of world.swings) {
      const k = s.life / s.maxLife;
      const half = s.half ?? Math.PI / 3;
      const sweep = (1 - k) * 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, s.angle - half + sweep, s.angle + half + sweep);
      ctx.arc(s.x, s.y, s.radius * 0.55, s.angle + half + sweep, s.angle - half + sweep, true);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.65 * k})`;
      ctx.fill();
      ctx.strokeStyle = rgba(s.color, k);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const l of world.lightning) {
      const k = l.life / l.maxLife;
      ctx.beginPath();
      for (let i = 0; i + 3 < l.points.length; i += 2) {
        const x0 = l.points[i];
        const y0 = l.points[i + 1];
        const x1 = l.points[i + 2];
        const y1 = l.points[i + 3];
        if (i === 0) ctx.moveTo(x0, y0);
        for (let j = 1; j <= 4; j++) {
          const f = j / 4;
          const jitter = j < 4 ? Math.sin(t * 90 + i * 7 + j * 13) * 14 : 0;
          ctx.lineTo(x0 + (x1 - x0) * f + jitter, y0 + (y1 - y0) * f - jitter * 0.6);
        }
      }
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * k})`;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = rgba('#B48CFF', k);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const w of world.waves) {
      const k = w.life / w.maxLife;
      const r = w.radius * (0.35 + 0.65 * (1 - k));
      circle(ctx, w.x, w.y, r);
      ctx.strokeStyle = rgba(w.color, k * 0.9);
      ctx.lineWidth = 10 * k + 2;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 255, 255, ${k})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private drawParticles(game: Game): void {
    const ctx = this.ctx;
    for (const p of game.fx.particles) {
      const k = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      switch (p.kind) {
        case 'dot':
          circle(ctx, p.x, p.y, p.size / 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          if (!p.glow) {
            ctx.strokeStyle = darken(p.color, 0.4);
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          break;
        case 'puff':
          ctx.globalAlpha = k * 0.85;
          circle(ctx, p.x, p.y, p.size);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(185, 168, 240, 0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case 'star':
          sparklePath(ctx, p.x, p.y, p.size, p.rot);
          paint(ctx, p.color, 1.6, palette.gold);
          break;
        case 'ring':
          circle(ctx, p.x, p.y, p.size);
          ctx.strokeStyle = p.color === '#FFFFFF' ? palette.frameLine : p.color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          break;
        case 'shard':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(p.rot) * p.size, p.y + Math.sin(p.rot) * p.size);
          ctx.lineTo(p.x + Math.cos(p.rot + 2.1) * p.size, p.y + Math.sin(p.rot + 2.1) * p.size);
          ctx.lineTo(p.x + Math.cos(p.rot + 4.2) * p.size, p.y + Math.sin(p.rot + 4.2) * p.size);
          ctx.closePath();
          ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawJoystick(game: Game): void {
    const s = game.stick;
    if (!s.active) return;
    const ctx = this.ctx;
    circle(ctx, s.ox, s.oy, config.joystickRadius);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(185, 168, 240, 0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    const k = d > config.joystickRadius ? config.joystickRadius / d : 1;
    circle(ctx, s.ox + dx * k, s.oy + dy * k, 34);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    ctx.stroke();
  }

  /** A round, friendly whale (the maid's skill), drawn facing right. */
  private drawWhale(x: number, y: number, s: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(0.15);
    // Tail fluke
    ctx.beginPath();
    ctx.moveTo(-50, -4);
    ctx.quadraticCurveTo(-74, -30, -86, -22);
    ctx.quadraticCurveTo(-74, -6, -64, 0);
    ctx.quadraticCurveTo(-74, 6, -86, 22);
    ctx.quadraticCurveTo(-74, 30, -50, 4);
    ctx.closePath();
    paint(ctx, '#5B86E0', 2.4, '#2F4F9E');
    // Body
    ctx.beginPath();
    ctx.ellipse(0, 0, 60, 36, 0, 0, Math.PI * 2);
    const body = ctx.createLinearGradient(0, -36, 0, 36);
    body.addColorStop(0, '#8FB2FF');
    body.addColorStop(1, '#4A6FD0');
    paint(ctx, body, 2.6, '#2F4F9E');
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 60, 36, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(8, 26, 52, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#EAF2FF';
    ctx.fill();
    ctx.restore();
    // Fin, eye, blush
    ctx.beginPath();
    ctx.ellipse(6, 14, 14, 7, 0.6, 0, Math.PI * 2);
    paint(ctx, '#6C93F0', 2, '#2F4F9E');
    circle(ctx, 34, -6, 5);
    ctx.fillStyle = '#2E2257';
    ctx.fill();
    circle(ctx, 32.5, -8, 1.8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 130, 160, 0.5)';
    ellipse(ctx, 40, 6, 6, 3);
    ctx.fill();
    // Water spout
    for (let i = -1; i <= 1; i++) {
      circle(ctx, 10 + i * 10, -48 - Math.abs(i) * -6, 6);
      paint(ctx, 'rgba(200, 232, 255, 0.9)', 1.6, '#5B86C9');
    }
    ctx.restore();
  }

  /**
   * Endless: total battle time under the wave box, then the abyss tide: a
   * countdown in its last minute, and how much stronger monsters are once it
   * rises.
   */
  private drawEndlessClock(game: Game, run: Run): void {
    const ctx = this.ctx;
    const t = Math.floor(run.playTime);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const toTide = TIDE_START - run.playTime;
    let text = `⏱ ${clock}`;
    let color = palette.ink;
    let fill = 'rgba(255, 255, 255, 0.85)';
    if (toTide <= 0) {
      text = `深渊涨潮 ×${tideScale(run).toFixed(1)}`;
      color = '#FFFFFF';
      fill = `rgba(160, 30, 70, ${0.8 + 0.15 * Math.sin(game.time * 6)})`;
    } else if (toTide <= 60) {
      text = `涨潮 ${Math.ceil(toTide)} 秒`;
      color = '#FFFFFF';
      fill = 'rgba(120, 60, 170, 0.9)';
    }
    ctx.font = `800 19px ${FONT}`;
    const w = Math.max(110, ctx.measureText(text).width + 28);
    roundRectPath(ctx, 550 - w / 2, 142, w, 32, 16);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 550, 159);
  }

  /** Skill button: the avatar inside an energy ring; glows when full. */
  private drawSkillButton(game: Game, run: Run, world: World): void {
    const ctx = this.ctx;
    const b = S.SKILL_BUTTON;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = 52;
    const c = run.character;
    const ratio = clamp(world.energy / SKILL_MAX, 0, 1);
    const ready = ratio >= 1;
    if (ready) {
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 6);
      const glow = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 26);
      glow.addColorStop(0, rgba(c.color, 0.6 * pulse + 0.3));
      glow.addColorStop(1, rgba(c.color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(cx - r - 30, cy - r - 30, (r + 30) * 2, (r + 30) * 2);
    }
    circle(ctx, cx, cy, r + 8);
    paint(ctx, 'rgba(255, 255, 255, 0.95)', 2.5, palette.frameLine);
    // Energy ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    ctx.strokeStyle = ready ? palette.gold : c.color;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.save();
    circle(ctx, cx, cy, r - 4);
    ctx.clip();
    const img = this.images.get(avatarImagePath(c.id));
    if (img) ctx.drawImage(img, cx - r + 4, cy - r + 4, (r - 4) * 2, (r - 4) * 2);
    else {
      ctx.fillStyle = lighten(c.color, 0.6);
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    if (!ready) {
      // Fill rises from the bottom as energy charges.
      ctx.fillStyle = 'rgba(60, 44, 110, 0.5)';
      ctx.fillRect(cx - r, cy - r, r * 2, (r * 2) * (1 - ratio));
    }
    ctx.restore();
    if (ready) {
      for (let i = 0; i < 3; i++) {
        const a = game.time * 2 + (i * Math.PI * 2) / 3;
        sparklePath(ctx, cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14), 7, 0);
        paint(ctx, '#FFFFFF', 1.4, palette.gold);
      }
    } else {
      outlinedText(ctx, `${Math.floor(ratio * 100)}%`, cx, cy + 2, 26, '#FFFFFF', 'center', palette.ink);
    }
    const label = c.skill.name;
    ctx.font = `800 18px ${FONT}`;
    const lw = ctx.measureText(label).width + 24;
    roundRectPath(ctx, cx - lw / 2, b.y - 26, lw, 30, 15);
    paint(ctx, ready ? palette.goldLight : 'rgba(255, 255, 255, 0.92)', 2, ready ? '#A8700E' : palette.frameLine);
    ctx.fillStyle = ready ? '#7A4E0A' : palette.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, b.y - 10);
  }

  /** Skill cut-in: a slanted banner with the character art and the skill name. */
  private drawCutin(game: Game, run: Run): void {
    const cut = game.cutin;
    if (!cut) return;
    const ctx = this.ctx;
    const c = run.character;
    const k = 1 - cut.t / cut.max;
    const enter = easeOut(clamp(k * 3, 0, 1));
    const fade = k > 0.82 ? 1 - (k - 0.82) / 0.18 : 1;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(40, 28, 80, 0.35)';
    this.fillView();
    ctx.translate(L.DESIGN_W / 2, L.DESIGN_H / 2);
    ctx.rotate(-0.14);
    // Wide enough to cross the whole window even on wide screens.
    const half = Math.max(700, this.view.w * 0.65 + 200);
    const bandH = 300 * enter;
    const band = ctx.createLinearGradient(-500, 0, 500, 0);
    band.addColorStop(0, rgba(darken(c.color, 0.25), 0.95));
    band.addColorStop(0.5, rgba(c.color, 0.95));
    band.addColorStop(1, rgba(lighten(c.color, 0.4), 0.95));
    ctx.fillStyle = band;
    ctx.fillRect(-half, -bandH / 2, half * 2, bandH);
    // Speed lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 3;
    const lines = Math.round(14 * (half / 700));
    for (let i = 0; i < lines; i++) {
      const y = -bandH / 2 + ((i * 37) % Math.max(1, bandH));
      const x = ((game.time * 1800 + i * 210) % (half * 2 + 200)) - half - 100;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 160, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-half, -bandH / 2 - 6, half * 2, 6);
    ctx.fillRect(-half, bandH / 2, half * 2, 6);
    // Character art slides in from the right, clipped to the band.
    ctx.save();
    ctx.beginPath();
    ctx.rect(-half, -bandH / 2, half * 2, bandH);
    ctx.clip();
    const art = this.images.get(portraitImagePath(c.id)) ?? this.images.get(chibiImagePath(c.id));
    const ax = 420 - 290 * enter;
    if (art) {
      const h = art === this.images.get(portraitImagePath(c.id)) ? 560 : 360;
      const w = (art.width / art.height) * h;
      ctx.drawImage(art, ax - w / 2, -h * 0.32, w, h);
    } else {
      drawCharacter(ctx, c, { x: ax, feetY: 170, scale: 2.4, facing: -1, time: game.time, moving: false, hurt: 0, ghost: false }, null);
    }
    ctx.restore();
    // Skill name slides in from the left.
    const tx = -460 + 330 * enter;
    outlinedText(ctx, c.name, tx, -52, 30, '#FFFFFF', 'left', darken(c.color, 0.45));
    outlinedText(ctx, c.skill.name, tx, 10, 64, '#FFFFFF', 'left', darken(c.color, 0.5));
    ctx.restore();

    // A white flash on the first frames.
    if (k < 0.12) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * (1 - k / 0.12)})`;
      this.fillView();
    }
  }

  /** Arrow at the screen edge pointing to a boss that is off screen. */
  private drawBossPointer(game: Game, world: World): void {
    const boss = world.boss;
    if (!boss || !boss.alive) return;
    const sx = boss.x - game.camera.x + L.DESIGN_W / 2;
    const sy = boss.y - boss.r * 0.5 - game.camera.y + L.DESIGN_H / 2;
    const v = this.view;
    const top = L.HUD_HEIGHT + 60;
    const bottom = v.y + v.h;
    // Only when the boss's body is really out of view (the window may be wider than the design).
    if (sx > v.x - boss.r && sx < v.x + v.w + boss.r && sy > L.HUD_HEIGHT && sy < bottom + boss.r) return;
    const x = clamp(sx, v.x + 50, v.x + v.w - 50);
    const y = clamp(sy, top, bottom - 50);
    const a = Math.atan2(sy - y, sx - x);
    const ctx = this.ctx;
    const bob = Math.sin(game.time * 8) * 4;
    ctx.save();
    ctx.translate(x + Math.cos(a) * bob, y + Math.sin(a) * bob);
    circle(ctx, 0, 0, 26);
    paint(ctx, 'rgba(255, 255, 255, 0.92)', 3, palette.danger);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(38, 0);
    ctx.lineTo(24, -10);
    ctx.lineTo(24, 10);
    ctx.closePath();
    paint(ctx, palette.danger, 2, '#A82E60');
    ctx.restore();
    outlinedText(ctx, 'BOSS', x, y + 1, 16, '#FFFFFF', 'center', palette.danger);
  }

  // ---- HUD ----

  private drawHud(game: Game, run: Run, world: World): void {
    const ctx = this.ctx;
    const stats = run.stats;
    const v = this.view;
    const top = Math.min(0, v.y);
    const fade = ctx.createLinearGradient(0, top, 0, L.HUD_HEIGHT);
    fade.addColorStop(0, 'rgba(30, 20, 60, 0.4)');
    fade.addColorStop(1, 'rgba(30, 20, 60, 0)');
    ctx.fillStyle = fade;
    ctx.fillRect(v.x - 2, top - 2, v.w + 4, L.HUD_HEIGHT - top + 2);

    this.drawAvatar(run.character, 70, 74, 52);

    const hp = Math.max(0, world.player.hp);
    this.bar(134, 32, 260, 30, hp / stats.maxHp, ['#FFA3C7', '#FF5C8A']);
    heartPath(ctx, 134, 47, 34);
    paint(ctx, palette.danger, 2.4, '#B0305C');
    outlinedText(ctx, `${Math.ceil(hp)} / ${stats.maxHp}`, 270, 48, 20, '#FFFFFF', 'center', '#C2477F');

    this.bar(134, 72, 260, 16, run.xp / run.xpToNext(), ['#D9C8FF', '#9C82E6']);
    outlinedText(ctx, `Lv ${run.level}`, 404, 80, 22, '#FFFFFF', 'left', palette.ink);

    drawShardIcon(ctx, 148, 122, 13);
    outlinedText(ctx, String(run.shards), 168, 123, 28, '#FFFFFF', 'left', '#3F6EB8');
    if (run.chests > 0) {
      drawChest(ctx, 270, 124, 0.85);
      outlinedText(ctx, `×${run.chests}`, 292, 124, 22, '#FFFFFF', 'left', '#5E4AA8');
    }
    if (run.pendingLevels > 0) {
      // Level-ups waiting for the end of the wave.
      roundRectPath(ctx, 346, 106, 98, 34, 17);
      paint(ctx, palette.goldLight, 2, '#A8700E');
      outlinedText(ctx, `升级 +${run.pendingLevels}`, 395, 123, 18, '#FFFFFF', 'center', '#A8700E');
    }

    // Wave and timer
    roundRectPath(ctx, 470, 22, 160, 112, 24);
    paint(ctx, 'rgba(255, 255, 255, 0.9)', 3, palette.frameLine);
    ctx.fillStyle = palette.ink;
    ctx.font = `800 21px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const waveLabel = run.stage ? `${run.stage.id} · ${run.wave}/${run.stage.waves} 波` : `无尽 第 ${run.wave} 波`;
    ctx.fillText(waveLabel, 550, 48);
    if (world.duration > 0) {
      const left = Math.ceil(world.remaining);
      outlinedText(ctx, String(left), 550, 96, 50, left <= 5 ? '#FFD0DE' : '#FFFFFF', 'center', left <= 5 ? '#C2477F' : palette.ink);
    } else if (bossTimeLimit(run) > 0) {
      // Endless: the boss leaves when this runs out.
      const left = Math.max(0, Math.ceil(bossTimeLimit(run) - world.elapsed));
      outlinedText(ctx, `BOSS ${left}`, 550, 96, 34, '#FFD0DE', 'center', '#C2477F');
    } else {
      outlinedText(ctx, 'BOSS', 550, 96, 38, '#FFD0DE', 'center', '#C2477F');
    }
    if (run.mode === 'endless') this.drawEndlessClock(game, run);

    // Pause button
    const pb = S.PAUSE_BUTTON;
    roundRectPath(ctx, pb.x, pb.y, pb.w, pb.h, 20);
    paint(ctx, 'rgba(255, 255, 255, 0.92)', 3, palette.frameLine);
    ctx.fillStyle = palette.ink;
    roundRectPath(ctx, pb.x + 21, pb.y + 19, 8, 28, 3);
    ctx.fill();
    roundRectPath(ctx, pb.x + 37, pb.y + 19, 8, 28, 3);
    ctx.fill();

    const boss = world.boss;
    if (boss && boss.alive && game.scene === 'battle' && !game.bossIntro) {
      // Big boss bar with phase marks.
      const y = L.HUD_HEIGHT + 16;
      const bx = 70;
      const bw = 580;
      roundRectPath(ctx, bx - 8, y - 30, bw + 16, 62, 18);
      ctx.fillStyle = 'rgba(30, 15, 50, 0.55)';
      ctx.fill();
      this.bar(bx, y, bw, 24, boss.hp / boss.maxHp, ['#FF8FB0', '#C2185B']);
      const marks = boss.def.boss === 'queen' ? [0.6, 0.3] : [0.5];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 3;
      for (const m of marks) {
        ctx.beginPath();
        ctx.moveTo(bx + bw * m, y + 2);
        ctx.lineTo(bx + bw * m, y + 22);
        ctx.stroke();
      }
      outlinedText(ctx, boss.def.name, bx + 6, y - 14, 22, '#FFD0DE', 'left', '#5A0F2E');
      if (boss.brain && boss.brain.phase > 1) {
        outlinedText(ctx, `第 ${boss.brain.phase} 阶段`, bx + bw - 4, y - 14, 20, '#FFFFFF', 'right', '#5A0F2E');
      }
    }
  }

  /** Boss entrance: letterbox bars, a red warning band, the boss name. */
  private drawBossIntro(game: Game): void {
    const intro = game.bossIntro;
    if (!intro) return;
    const ctx = this.ctx;
    const def = intro.boss.def;
    const k = 1 - intro.t / intro.max;
    const enter = easeOut(clamp(k * 4, 0, 1));
    const fade = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    // Letterbox bars
    const v = this.view;
    const bar = 150 * enter;
    ctx.fillStyle = 'rgba(10, 5, 20, 0.85)';
    ctx.fillRect(v.x - 2, v.y - 2, v.w + 4, bar + 2);
    ctx.fillRect(v.x - 2, v.y + v.h - bar, v.w + 4, bar + 2);
    // Red pulse at the edges
    ctx.fillStyle = this.edgeGradient('rgba(200, 20, 60, 0)', `rgba(200, 20, 60, ${0.35 + 0.15 * Math.sin(game.time * 10)})`);
    this.fillView();
    // Warning band with hazard stripes
    const y = L.DESIGN_H - 300;
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x - 2, y - 70, (v.w + 4) * enter, 140);
    ctx.clip();
    ctx.fillStyle = 'rgba(40, 8, 24, 0.9)';
    ctx.fillRect(v.x - 2, y - 70, v.w + 4, 140);
    ctx.fillStyle = '#C2185B';
    for (let x = v.x - 60 - ((game.time * 120) % 60); x < v.x + v.w + 60; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, y - 70);
      ctx.lineTo(x + 30, y - 70);
      ctx.lineTo(x + 14, y - 56);
      ctx.lineTo(x - 16, y - 56);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y + 56);
      ctx.lineTo(x + 30, y + 56);
      ctx.lineTo(x + 14, y + 70);
      ctx.lineTo(x - 16, y + 70);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const tx = -300 + 660 * enter;
    outlinedText(ctx, '⚠ BOSS 来袭 ⚠', tx, y - 30, 26, '#FF8FB0', 'center', '#3A0A1C');
    outlinedText(ctx, def.name, tx, y + 10, 50, '#FFFFFF', 'center', '#7A0F3A');
    if (def.title) {
      ctx.fillStyle = 'rgba(255, 220, 230, 0.9)';
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.title, tx, y + 48);
    }
    ctx.restore();
  }

  private drawAvatar(c: CharacterDef, x: number, y: number, r: number): void {
    const ctx = this.ctx;
    circle(ctx, x, y, r + 4);
    paint(ctx, '#FFFFFF', 3, c.color);
    const img = this.images.get(avatarImagePath(c.id));
    ctx.save();
    circle(ctx, x, y, r);
    ctx.clip();
    if (img) {
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = lighten(c.color, 0.6);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      outlinedText(ctx, c.name[0], x, y + 2, r, '#FFFFFF', 'center', darken(c.color, 0.3));
    }
    ctx.restore();
    circle(ctx, x, y, r);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  private bar(x: number, y: number, w: number, h: number, ratio: number, colors: readonly [string, string]): void {
    const ctx = this.ctx;
    roundRectPath(ctx, x, y, w, h, h / 2);
    paint(ctx, 'rgba(255, 255, 255, 0.9)', 2.5, palette.frameLine);
    const r = clamp(ratio, 0, 1);
    if (r <= 0) return;
    const fw = Math.max(h, w * r);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    roundRectPath(ctx, x + 2, y + 2, fw - 4, h - 4, (h - 4) / 2);
    ctx.fillStyle = g;
    ctx.fill();
    roundRectPath(ctx, x + 6, y + 4, Math.max(0, fw - 12), (h - 8) * 0.35, 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
  }

  // ---- Screens ----

  /** Main menu: logo, the whole cast, mode buttons and this device's records. */
  private drawTitle(game: Game): void {
    const ctx = this.ctx;
    const t = game.time;
    const glow = ctx.createRadialGradient(360, 250, 20, 360, 250, 340);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, L.DESIGN_W, 620);
    outlinedText(ctx, '星屑庭院', 360, 230, 108, '#FFFFFF', 'center', palette.ink);
    ctx.fillStyle = darken(palette.gold, 0.15);
    ctx.font = `800 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S T A R D U S T   G A R D E N', 360, 318);
    const sparkles: Array<[number, number, number]> = [
      [118, 168, 18],
      [606, 150, 22],
      [640, 292, 13],
      [86, 300, 12],
      [520, 372, 10],
    ];
    sparkles.forEach(([x, y, r], i) => {
      sparklePath(ctx, x, y, r + 3 * Math.sin(t * 2.4 + i * 1.7), 0);
      paint(ctx, '#FFFFFF', 2, palette.gold);
    });

    // The cast, standing in a shallow arc; the middle pair is closest.
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ellipse(ctx, 360, 790, 340, 50);
    ctx.fill();
    ctx.restore();
    const order = CHARACTERS.map((c, i) => ({ c, i, depth: Math.abs(i - (CHARACTERS.length - 1) / 2) })).sort(
      (a, b) => b.depth - a.depth,
    );
    for (const { c, i, depth } of order) {
      drawCharacter(
        ctx,
        c,
        {
          x: 80 + i * 112,
          feetY: 800 - depth * 34 + Math.sin(t * 2 + i) * 3,
          scale: 1.55 - depth * 0.12,
          facing: i < CHARACTERS.length / 2 ? 1 : -1,
          time: t + i,
          moving: false,
          hurt: 0,
          ghost: false,
        },
        this.images.get(chibiImagePath(c.id)) ?? null,
        this.rigs.get(c.id) ?? null,
      );
    }

    ctx.fillStyle = palette.textDim;
    ctx.font = `700 19px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(` 章 ·  个小关，每关 6～10 波`, 360, S.TITLE_STORY.y + S.TITLE_STORY.h + 22);
    ctx.fillText('没有尽头，看你能撑到第几波', 360, S.TITLE_ENDLESS.y + S.TITLE_ENDLESS.h + 22);

    // Progress on this device
    const endless = game.save.endless;
    const storyLine = `章节 ★ ${totalStars(game.save)} / ${ALL_STAGES.length * 3} · 星尘 ${game.save.stardust}`;
    const best = CHARACTERS.find((c) => c.id === endless.character);
    const endlessLine =
      endless.bestWave > 0
        ? `无尽最高：第 ${endless.bestWave} 波${best ? ` · ${best.name}` : ''} · 击败 ${endless.bestKills}`
        : '无尽：还没有纪录';
    roundRectPath(ctx, 110, 1150, 500, 82, 22);
    paint(ctx, 'rgba(255, 255, 255, 0.85)', 2, palette.frameLine);
    ctx.fillStyle = palette.ink;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(storyLine, 360, 1176);
    ctx.fillText(endlessLine, 360, 1206);
    ctx.fillStyle = 'rgba(61, 51, 102, 0.4)';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('试玩版 · 进度只保存在这台设备上', 360, 1258);
  }

  /** Endless leaderboard: all-time or this week, best run per player. */
  private drawLeaderboard(game: Game): void {
    const ctx = this.ctx;
    outlinedText(ctx, '无尽排行榜', 380, 96, 44, '#FFFFFF', 'center', palette.ink);
    // Tabs
    for (const [rect, kind, label] of [
      [S.BOARD_TAB_ALL, 'all', '总榜'],
      [S.BOARD_TAB_WEEK, 'week', '本周'],
    ] as const) {
      const on = game.board === kind;
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 32);
      paint(ctx, on ? '#8A5CE0' : 'rgba(255, 255, 255, 0.9)', 3, on ? '#5A2E9E' : palette.frameLine);
      ctx.fillStyle = on ? '#FFFFFF' : palette.ink;
      ctx.font = `800 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    }
    ctx.fillStyle = palette.textDim;
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      game.boardOnline ? '每人只算最好的一局 · 同波数比击败数' : '线上排行榜还没开通，先显示这台设备上的成绩',
      360,
      S.BOARD_TAB_ALL.y + S.BOARD_TAB_ALL.h + 16,
    );

    if (game.boardState !== 'ready' || game.boardRows.length === 0) {
      const text =
        game.boardState === 'loading' ? '加载中……' : game.boardState === 'error' ? '连不上排行榜，等一下再试' : '还没有人上榜，去打一局无尽吧';
      ctx.fillStyle = palette.ink;
      ctx.font = `700 24px ${FONT}`;
      ctx.fillText(text, 360, 600);
    }
    if (game.boardState === 'ready') {
      game.boardRows.forEach((row, i) => {
        const r = S.boardRow(i);
        const mine = row.playerId === game.save.playerId;
        roundRectPath(ctx, r.x, r.y, r.w, r.h, 16);
        paint(ctx, mine ? 'rgba(255, 236, 190, 0.97)' : 'rgba(255, 255, 255, 0.92)', 2, mine ? palette.gold : palette.frameLine);
        const cy = r.y + r.h / 2;
        // Place: gold, silver, bronze for the first three.
        const medal = ['#F2C65E', '#C9CED8', '#D99A6C'][i];
        if (medal) {
          circle(ctx, r.x + 34, cy, 19);
          paint(ctx, medal, 2, darken(medal, 0.35));
        }
        ctx.fillStyle = medal ? '#FFFFFF' : palette.textDim;
        ctx.font = `800 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), r.x + 34, cy + 1);
        const c = CHARACTERS.find((x) => x.id === row.character);
        const img = c ? this.images.get(avatarImagePath(c.id)) : undefined;
        ctx.save();
        circle(ctx, r.x + 86, cy, 21);
        ctx.clip();
        if (img) ctx.drawImage(img, r.x + 65, cy - 21, 42, 42);
        else {
          ctx.fillStyle = c ? lighten(c.color, 0.5) : palette.frameLine;
          ctx.fillRect(r.x + 65, cy - 21, 42, 42);
        }
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.fillStyle = palette.ink;
        ctx.font = `800 22px ${FONT}`;
        ctx.fillText(row.name, r.x + 120, cy - 9);
        ctx.fillStyle = palette.textDim;
        ctx.font = `600 15px ${FONT}`;
        const m = Math.floor(row.playTime / 60);
        ctx.fillText(`${c?.name ?? '?'} · 击败 ${row.kills} · ${m} 分钟`, r.x + 120, cy + 14);
        ctx.textAlign = 'right';
        outlinedText(ctx, `第 ${row.wave} 波`, r.x + r.w - 18, cy, 26, '#FFFFFF', 'right', '#5A2E9E');
      });
    }

    // Nickname
    const nb = S.BOARD_NAME;
    roundRectPath(ctx, nb.x, nb.y, nb.w, nb.h, 24);
    paint(ctx, 'rgba(255, 255, 255, 0.95)', 3, palette.frameLine);
    ctx.fillStyle = palette.ink;
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(game.save.name ? `我的名字：${game.save.name}  ✎` : '✎ 起个名字', nb.x + nb.w / 2, nb.y + nb.h / 2);
  }

  /** Chapter map: stage nodes on a winding path, with stars earned. */
  private drawStages(game: Game): void {
    const ctx = this.ctx;
    const chapter = CHAPTERS[game.chapterIndex] ?? CHAPTERS[0];
    outlinedText(ctx, `第${CHAPTER_NUMBERS[chapter.id - 1] ?? chapter.id}章 · ${chapter.name}`, 380, 96, 42, '#FFFFFF', 'center', palette.ink);
    ctx.fillStyle = palette.textDim;
    ctx.font = `700 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('每关从零开始配装 · 后面的关更难，开局星屑也更多', 360, 156);

    // The path, drawn under the nodes.
    const pts = S.STAGE_NODE_CENTERS;
    const trace = (): void => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const my = (ay + by) / 2;
        ctx.bezierCurveTo(ax, my, bx, my, bx, by);
      }
    };
    ctx.save();
    trace();
    ctx.lineWidth = 30;
    ctx.strokeStyle = 'rgba(185, 168, 240, 0.35)';
    ctx.stroke();
    trace();
    ctx.setLineDash([2, 18]);
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
    ctx.restore();

    chapter.stages.forEach((stage, i) => {
      const [x, y] = pts[i];
      const color = TINT_COLORS[stage.tint];
      const bits = game.save.stars[stage.id] ?? 0;
      circle(ctx, x, y + 7, 62);
      ctx.fillStyle = 'rgba(60, 40, 110, 0.18)';
      ctx.fill();
      if (stage.id === game.stageId) {
        circle(ctx, x, y, 74 + 3 * Math.sin(game.time * 3));
        ctx.fillStyle = rgba(palette.goldLight, 0.55);
        ctx.fill();
      }
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      g.addColorStop(0, lighten(color, 0.35));
      g.addColorStop(1, color);
      circle(ctx, x, y, 60);
      paint(ctx, g, 5, '#FFFFFF');
      outlinedText(ctx, stage.id, x, y - 2, 38, '#FFFFFF', 'center', darken(color, 0.45));

      // What waits at the end of the stage.
      const last = stage.bosses[stage.waves];
      const tag = last ? (last.length > 1 ? '双 Boss' : 'Boss') : stage.eliteRush ? '精英潮' : '';
      if (tag) {
        ctx.font = `800 15px ${FONT}`;
        const tw = ctx.measureText(tag).width + 18;
        roundRectPath(ctx, x + 30, y - 66, tw, 26, 13);
        paint(ctx, '#FF6B8F', 2, '#FFFFFF');
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(tag, x + 30 + tw / 2, y - 52);
      }
      ctx.fillStyle = palette.ink;
      ctx.font = `800 24px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(stage.name, x, y + 86);
      ctx.fillStyle = palette.textDim;
      ctx.font = `700 16px ${FONT}`;
      ctx.fillText(`${stage.waves} 波`, x, y + 112);
      for (let k = 0; k < 3; k++) {
        this.starPath(x + (k - 1) * 30, y + 138, 12);
        paint(ctx, bits & (1 << k) ? palette.gold : 'rgba(255, 255, 255, 0.85)', 2, bits & (1 << k) ? '#C9922E' : palette.frameLine);
      }
    });

    ctx.fillStyle = palette.ink;
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = 'center';
    const chapterStars = chapter.stages.reduce((n, s) => n + starCount(game.save.stars[s.id] ?? 0), 0);
    ctx.fillText(`本章 ★ ${chapterStars} / ${chapter.stages.length * 3}`, 360, 1210);
    ctx.fillStyle = palette.textDim;
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(`三颗星：${STAR_LABELS.join(' · ')}`, 360, 1262);
  }

  /** Option switches; the reset button below is drawn by the button pass. */
  private drawSettings(game: Game): void {
    const ctx = this.ctx;
    outlinedText(ctx, '设置', 360, 96, 46, '#FFFFFF', 'center', palette.ink);
    SETTING_KEYS.forEach((key, i) => {
      const r = S.settingsRow(i);
      const on = game.save.settings[key];
      const info = SETTING_INFO[key];
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 22);
      paint(ctx, 'rgba(255, 255, 255, 0.94)', 2.5, palette.frameLine);
      ctx.fillStyle = palette.ink;
      ctx.font = `800 28px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.name, r.x + 28, r.y + 32);
      ctx.fillStyle = palette.textDim;
      ctx.font = `600 17px ${FONT}`;
      ctx.fillText(info.desc, r.x + 28, r.y + 64);
      // Toggle switch
      const sx = r.x + r.w - 118;
      const sy = r.y + r.h / 2;
      roundRectPath(ctx, sx, sy - 20, 90, 40, 20);
      paint(ctx, on ? '#7CCB8E' : '#D6D0E8', 2.5, on ? '#3F8F5A' : '#A79FC4');
      circle(ctx, on ? sx + 70 : sx + 20, sy, 15);
      paint(ctx, '#FFFFFF', 2.5, on ? '#3F8F5A' : '#A79FC4');
      ctx.fillStyle = on ? '#2E6E44' : '#8A82A8';
      ctx.font = `800 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(on ? '开' : '关', on ? sx + 28 : sx + 62, sy + 1);
    });
    const armed = game.time < game.resetArmedUntil;
    ctx.fillStyle = armed ? '#D9466F' : palette.textDim;
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      armed ? '再点一次「清空进度」确认，不能撤销' : '清空星级、星尘、天赋和纪录（设置会保留）',
      360,
      S.SETTINGS_RESET.y + S.SETTINGS_RESET.h + 28,
    );
  }

  /** First-battle tips: a banner up top, plus a hint drawn where it points. */
  private drawTutorial(game: Game): void {
    const tip = game.tutorial;
    if (!tip || game.bossIntro || game.cutin) return;
    const ctx = this.ctx;
    const text = TIPS[tip.step];
    if (!text) return;
    const fade = Math.min(1, tip.t * 2, (3.8 - tip.t) * 4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.font = `800 26px ${FONT}`;
    const w = ctx.measureText(text).width + 70;
    roundRectPath(ctx, 360 - w / 2, 214, w, 58, 29);
    paint(ctx, 'rgba(30, 22, 48, 0.82)', 3, palette.goldLight);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 360, 244);
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = palette.goldLight;
    ctx.fillText(`${tip.step + 1} / ${TIPS.length}`, 360, 288);
    if (tip.step === 0) {
      // A finger dragging in a small loop at the bottom of the screen.
      const a = game.time * 2.2;
      const hx = 360 + Math.cos(a) * 60;
      const hy = 1000 + Math.sin(a) * 30;
      circle(ctx, 360, 1000, 80);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
      circle(ctx, hx, hy, 26);
      paint(ctx, 'rgba(255, 255, 255, 0.85)', 3, palette.goldLight);
    } else if (tip.step === 3) {
      // A pulsing ring around the skill button.
      const b = S.SKILL_BUTTON;
      const pulse = 1 + 0.12 * Math.sin(game.time * 6);
      circle(ctx, b.x + b.w / 2, b.y + b.h / 2, (b.w / 2 + 14) * pulse);
      ctx.strokeStyle = palette.goldLight;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Permanent talents bought with stardust. */
  private drawTalents(game: Game): void {
    const ctx = this.ctx;
    const save = game.save;
    outlinedText(ctx, '天赋', 360, 96, 46, '#FFFFFF', 'center', palette.ink);
    sparklePath(ctx, 300, 172, 16, 0);
    paint(ctx, palette.goldLight, 2, '#C9922E');
    outlinedText(ctx, `星尘 ${save.stardust}`, 324, 172, 30, '#FFFFFF', 'left', '#A8700E');
    TALENTS.forEach((t, i) => {
      const r = S.talentCard(i);
      const cx = r.x + r.w / 2;
      const level = save.talents[t.id] ?? 0;
      const maxed = level >= t.max;
      const cost = talentCost(level);
      const affordable = !maxed && save.stardust >= cost;
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 24);
      paint(ctx, 'rgba(255, 255, 255, 0.94)', affordable ? 4 : 2.5, affordable ? palette.gold : palette.frameLine);
      ctx.fillStyle = palette.ink;
      ctx.font = `800 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.name, cx, r.y + 42);
      ctx.fillStyle = palette.textDim;
      ctx.font = `700 18px ${FONT}`;
      ctx.fillText(`每级 ${t.desc}`, cx, r.y + 80);
      const total = t.mods ? describeMods(talentMods({ [t.id]: level })).join(' ') : `开局星屑 +${(t.shards ?? 0) * level}`;
      ctx.fillStyle = level > 0 ? '#2E9E6A' : palette.textDim;
      ctx.fillText(level > 0 ? `当前 ${total}` : '还没有学', cx, r.y + 108);
      for (let k = 0; k < t.max; k++) {
        circle(ctx, cx + (k - (t.max - 1) / 2) * 28, r.y + 142, 9);
        paint(ctx, k < level ? palette.gold : '#FFFFFF', 2, k < level ? '#C9922E' : palette.frameLine);
      }
      roundRectPath(ctx, cx - 100, r.y + r.h - 56, 200, 40, 20);
      paint(ctx, affordable ? '#FFE7A0' : '#E8E4F2', 2.5, affordable ? '#C9922E' : '#B9B3D9');
      ctx.fillStyle = affordable ? '#7A4E0A' : '#9A94B8';
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText(maxed ? '已满级' : `升级 · ${cost} 星尘`, cx, r.y + r.h - 35);
    });
    ctx.fillStyle = palette.textDim;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText('星尘：每局结束都会给，通关和拿星给得更多', 360, 1012);
    ctx.fillText('天赋对所有角色、所有模式都生效', 360, 1044);
  }

  private starPath(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const d = i % 2 === 0 ? r : r * 0.48;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
  }

  private islandFor(run: Run): IslandSprite {
    const theme = run.stage ? chapterById(chapterOfStage(run.stage)).theme : 'garden';
    let island = this.islands.get(theme);
    if (!island) {
      island = bakeIsland(this.platform, theme);
      this.islands.set(theme, island);
    }
    return island;
  }

  /** Dusk, night and starry stages darken the whole battlefield. */
  private drawStageTint(run: Run): void {
    const tint = run.stage?.tint;
    if (!tint || tint === 'day') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = STAGE_TINTS[tint];
    this.fillView();
    ctx.restore();
  }

  private drawSelect(game: Game): void {
    const ctx = this.ctx;
    outlinedText(ctx, '选择你的角色', 360, 96, 46, '#FFFFFF', 'center', palette.ink);
    for (const x of [170, 550]) {
      sparklePath(ctx, x, 96, 14 + 3 * Math.sin(game.time * 3 + x), 0);
      paint(ctx, '#FFFFFF', 2, palette.gold);
    }
    CHARACTERS.forEach((c, i) => {
      const r = S.selectCard(i);
      const selected = i === game.selected;
      const cx = r.x + r.w / 2;
      if (selected) {
        roundRectPath(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 30);
        ctx.fillStyle = rgba(c.color, 0.3);
        ctx.fill();
      }
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 24);
      paint(ctx, 'rgba(255, 255, 255, 0.92)', selected ? 5 : 2.5, selected ? c.color : palette.frameLine);
      ctx.save();
      roundRectPath(ctx, r.x + 4, r.y + 4, r.w - 8, 184, 20);
      ctx.clip();
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + 190);
      g.addColorStop(0, lighten(c.color, 0.7));
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, 190);
      ctx.restore();
      drawCharacter(
        ctx,
        c,
        { x: cx, feetY: r.y + 180, scale: 1.05, facing: 1, time: game.time + i, moving: false, hurt: 0, ghost: false },
        this.images.get(chibiImagePath(c.id)) ?? null,
        this.rigs.get(c.id) ?? null,
      );
      drawWeaponIcon(ctx, c.startWeapon, r.x + r.w - 34, r.y + 36, 34);
      const tagColor = TAG_INFO[CLASSES[c.cls].tag].color;
      roundRectPath(ctx, r.x + 12, r.y + 14, 64, 30, 15);
      paint(ctx, tagColor, 2, darken(tagColor, 0.25));
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CLASSES[c.cls].name, r.x + 44, r.y + 30);
      outlinedText(ctx, c.name, cx, r.y + 204, 30, '#FFFFFF', 'center', darken(c.color, 0.35));
      ctx.fillStyle = darken(c.color, 0.35);
      ctx.font = `700 19px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${c.title} · ${weaponById(c.startWeapon).name}`, cx, r.y + 232);
      ctx.fillStyle = palette.textDim;
      ctx.font = `600 15px ${FONT}`;
      c.passive.split('\n').forEach((line, j) => ctx.fillText(line, cx, r.y + 254 + j * 18));
    });
    const sel = CHARACTERS[game.selected];
    ctx.fillStyle = darken(sel.color, 0.35);
    ctx.font = `800 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`职业 · ${CLASSES[sel.cls].name}：${describeClass(sel.cls)}`, 360, 1060);
    ctx.fillText(`技能 · ${sel.skill.name}：${sel.skill.desc}`, 360, 1088);
    ctx.fillStyle = palette.textDim;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText('拖动屏幕移动 · 武器自动攻击 · 能量满了点右下角放技能', 360, 1246);
  }

  private drawChestScreen(game: Game, run: Run): void {
    const ctx = this.ctx;
    const item = game.chestItem;
    this.dim();
    this.panel(80, 300, 560, 720, palette.gold);
    outlinedText(ctx, '打开宝箱！', 360, 372, 52, palette.goldLight, 'center', '#A8700E');
    if (run.chests > 1) {
      ctx.fillStyle = palette.textDim;
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`还有 ${run.chests - 1} 个`, 360, 424);
    }
    if (!item) return;
    const glow = ctx.createRadialGradient(360, 560, 10, 360, 560, 150);
    glow.addColorStop(0, 'rgba(255, 231, 168, 0.8)');
    glow.addColorStop(1, 'rgba(255, 231, 168, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(210, 410, 300, 300);
    for (let i = 0; i < 6; i++) {
      const a = game.time * 0.8 + (i * Math.PI) / 3;
      sparklePath(ctx, 360 + Math.cos(a) * 120, 560 + Math.sin(a) * 120, 8, 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
    drawItemIcon(ctx, item.icon, 360, 545, 130, palette.gold);
    ctx.fillStyle = palette.ink;
    ctx.font = `800 36px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, 360, 648);
    // Same facts as the shop card: what it does, its stats, its set.
    const font = `700 22px ${FONT}`;
    const lines: Array<{ text: string; color: string }> = [];
    if (item.note) lines.push(...wrap(ctx, item.note, 470, font).map((text) => ({ text, color: '#B07A12' })));
    for (const text of describeMods(item.mods)) lines.push({ text, color: text.startsWith('-') ? '#D9466F' : '#2E9E6A' });
    const owned = run.items.get(item.id) ?? 0;
    const set = setsForItem(run.items, item.id)[0];
    if (set) {
      const have = set.have + (owned > 0 ? 0 : 1);
      lines.push({ text: `套装「${set.set.name}」收下后 ${have}/${set.set.items.length}`, color: '#6F5FC0' });
      lines.push({ text: `集齐：${describeMods(set.set.mods).join('，')}`, color: '#6F5FC0' });
    }
    if (owned > 0) lines.push({ text: `已经有 ${owned} 个${item.max ? `（最多 ${item.max} 个）` : ''}`, color: palette.textDim });
    if (lines.length === 0) lines.push({ text: '没有额外效果', color: palette.textDim });
    ctx.font = font;
    const step = lines.length > 5 ? 28 : 32;
    lines.forEach((line, i) => {
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, 360, 700 + i * step);
    });
  }

  /** Endless: pick one abyss blessing of three after beating a boss. */
  private drawBlessing(game: Game, run: Run): void {
    const ctx = this.ctx;
    this.dim();
    outlinedText(ctx, '深渊祝福', 360, 214, 60, '#E8D8FF', 'center', '#5A2E9E');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('击败 Boss 的奖励 · 选一项，整局有效', 360, 276);
    const color = '#8A5CE0';
    run.blessingChoices.forEach((b, i) => {
      const r = S.upgradeCard(i);
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 24);
      paint(ctx, 'rgba(255, 255, 255, 0.96)', 3, color);
      ctx.save();
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 24);
      ctx.clip();
      const g = ctx.createLinearGradient(r.x, 0, r.x + 140, 0);
      g.addColorStop(0, 'rgba(138, 92, 224, 0.25)');
      g.addColorStop(1, 'rgba(138, 92, 224, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, 140, r.h);
      ctx.restore();
      ctx.font = `64px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.icon, r.x + 72, r.y + r.h / 2);
      ctx.textAlign = 'left';
      ctx.fillStyle = palette.ink;
      ctx.font = `800 36px ${FONT}`;
      ctx.fillText(b.name, r.x + 140, r.y + 52);
      ctx.fillStyle = '#5A2E9E';
      ctx.font = `700 23px ${FONT}`;
      ctx.fillText(b.desc, r.x + 140, r.y + 100);
      const have = run.blessingCount(b.id);
      if (have > 0) {
        ctx.fillStyle = palette.textDim;
        ctx.font = `700 18px ${FONT}`;
        ctx.fillText(`已经有 ${have} 层`, r.x + 140, r.y + 132);
      }
    });
    void game;
  }

  private drawLevelUp(game: Game, run: Run): void {
    const ctx = this.ctx;
    this.dim();
    outlinedText(ctx, '升级！', 360, 214, 64, palette.goldLight, 'center', '#A8700E');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`选一项属性 · 还可以选 ${run.pendingLevels} 次`, 360, 276);
    game.upgradeCards.forEach((card, i) => {
      const r = S.upgradeCard(i);
      const color = RARITY_COLORS[card.rarity];
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 24);
      paint(ctx, 'rgba(255, 255, 255, 0.96)', 3, color);
      ctx.save();
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 24);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(r.x, r.y, 18, r.h);
      ctx.restore();
      const [value, name] = formatMod(card.key, card.value).split(' ');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = darken(color, 0.35);
      ctx.font = `700 20px ${FONT}`;
      ctx.fillText(RARITY_NAMES[card.rarity], r.x + 50, r.y + 36);
      ctx.fillStyle = palette.ink;
      ctx.font = `800 38px ${FONT}`;
      ctx.fillText(name, r.x + 50, r.y + 84);
      ctx.fillStyle = palette.textDim;
      ctx.font = `700 19px ${FONT}`;
      const hint = STAT_INFO[card.key].hint;
      ctx.fillText(`当前 ${statValue(card.key, run.stats[card.key])}${hint ? ` · ${hint}` : ''}`, r.x + 50, r.y + 126);
      outlinedText(ctx, value, r.x + r.w - 40, r.y + r.h / 2, 48, '#FFFFFF', 'right', darken(color, 0.3));
    });
  }

  private drawShop(game: Game, run: Run): void {
    const ctx = this.ctx;
    this.dim();
    this.panel(10, 140, 700, 1126, palette.frameLine);
    outlinedText(ctx, '商店', 60, 192, 46, '#FFFFFF', 'left', palette.ink);
    ctx.fillStyle = palette.textDim;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(game.preShop ? '出发前整备' : `第 ${run.wave} 波结束`, 172, 196);
    drawShardIcon(ctx, 400, 190, 16);
    outlinedText(ctx, String(run.shards), 424, 192, 36, '#FFFFFF', 'left', '#3F6EB8');

    run.offers.forEach((offer, i) => this.drawOffer(i, offer, run, game.offerButtons[i]?.disabled ?? false));

    ctx.fillStyle = palette.textDim;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`武器 ${run.weapons.length} / ${config.maxWeapons}`, 34, 968);
    if (game.selectedSlot < 0) {
      this.drawTagPills(run, 150, 968);
      ctx.fillStyle = 'rgba(61, 51, 102, 0.45)';
      ctx.font = `600 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('点武器可以卖掉 · 同流派武器凑 2 / 4 / 6 把有羁绊加成', 360, 1116);
    }
    for (let i = 0; i < config.maxWeapons; i++) {
      const r = S.shopSlot(i);
      const w = run.weapons[i];
      const selected = i === game.selectedSlot;
      const lift = selected ? -6 : 0;
      roundRectPath(ctx, r.x, r.y + lift, r.w, r.h, 18);
      if (w) {
        const border = selected ? palette.danger : TIER_COLORS[w.tier] === '#FFFFFF' ? palette.frameLine : TIER_COLORS[w.tier];
        paint(ctx, 'rgba(255, 255, 255, 0.96)', selected ? 4.5 : 3.5, border);
        drawWeaponIcon(ctx, w.id, r.x + r.w / 2, r.y + r.h / 2 - 6 + lift, 48);
        outlinedText(ctx, TIER_NAMES[w.tier], r.x + r.w / 2, r.y + r.h - 16 + lift, 18, '#FFFFFF', 'center', palette.ink);
      } else {
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = palette.frameLine;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /** One pill per weapon tag: "法术 3/4", filled in the tag color once a set tier is active. */
  private drawTagPills(run: Run, x: number, y: number): void {
    const ctx = this.ctx;
    const counts = countTags(run.weapons.map((w) => w.id));
    TAG_ORDER.forEach((tag, i) => {
      const info = TAG_INFO[tag];
      const n = counts[tag];
      const on = activeTier(tag, n) >= 0;
      const next = nextThreshold(tag, n);
      const px = x + i * 136;
      roundRectPath(ctx, px, y - 17, 126, 34, 17);
      paint(ctx, on ? info.color : 'rgba(255, 255, 255, 0.92)', 2, on ? darken(info.color, 0.25) : lighten(info.color, 0.45));
      ctx.fillStyle = on ? '#FFFFFF' : darken(info.color, 0.1);
      ctx.font = `800 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(next === null ? `${info.name} ${n} 满` : `${info.name} ${n}/${next}`, px + 63, y + 1);
    });
  }

  private drawOffer(i: number, offer: ShopOffer, run: Run, disabled: boolean): void {
    const ctx = this.ctx;
    const r = S.offerCard(i);
    const cx = r.x + r.w / 2;
    ctx.save();
    if (offer.sold) ctx.globalAlpha = 0.45;
    let accent: string = palette.frameLine;
    let title = '';
    let kind = '';
    let lines: Array<{ text: string; color: string }> = [];
    let unlocks: ComboDef[] = [];
    if (offer.kind === 'weapon') {
      const def = weaponById(offer.id);
      accent = TIER_COLORS[offer.tier] === '#FFFFFF' ? def.color : TIER_COLORS[offer.tier];
      title = `${def.name} ${TIER_NAMES[offer.tier]}`;
      // ★ marks the tag that matches the character's class.
      const classTag = CLASSES[run.character.cls].tag;
      kind = `武器 · ${def.tags.map((t) => (t === classTag ? '★' : '') + TAG_INFO[t].name).join(' · ')}`;
      const dmg = Math.round(def.damage * TIER_DAMAGE[offer.tier]);
      const cd = (def.cooldown * TIER_COOLDOWN[offer.tier]).toFixed(2);
      lines = [
        ...wrap(ctx, def.desc, r.w - 40, `600 17px ${FONT}`).map((text) => ({ text, color: palette.ink })),
        { text: `伤害 ${dmg} · 冷却 ${cd} 秒`, color: '#6F5FC0' },
        ...(fitsClass(run.character.cls, def.id)
          ? [{ text: `★ 契合${run.character.name}：伤害 +${Math.round(CLASS_WEAPON_BONUS * 100)}%`, color: '#B07A12' }]
          : []),
      ];
      unlocks = combosUnlockedBy(
        run.weapons.map((w) => w.id),
        def.id,
      );
      if (unlocks.length > 0) {
        const c = unlocks[0];
        lines.push({ text: `联动「${c.name}」`, color: '#B07A12' }, { text: c.desc, color: '#B07A12' });
      } else if (offer.tier >= 2) {
        const names = def.traits.slice(0, offer.tier - 1).map((t) => t.name);
        lines.push({ text: `特性：${names.join(' · ')}`, color: '#B07A12' });
      } else {
        lines.push({ text: `III「${def.traits[0].name}」 IV「${def.traits[1].name}」`, color: palette.textDim });
      }
    } else {
      const item = itemById(offer.id);
      title = item.name;
      kind = item.effect ? '道具 · 特殊效果' : '道具';
      lines = [];
      if (item.note) {
        lines.push(...wrap(ctx, item.note, r.w - 40, `700 17px ${FONT}`).map((text) => ({ text, color: '#B07A12' })));
      }
      lines.push(...describeMods(item.mods).map((text) => ({ text, color: text.startsWith('-') ? '#D9466F' : '#2E9E6A' })));
      // Set progress counts this item as owned once bought.
      const set = setsForItem(run.items, item.id)[0];
      if (set) {
        const have = set.have + ((run.items.get(item.id) ?? 0) > 0 ? 0 : 1);
        lines.push({ text: `套装「${set.set.name}」${have}/${set.set.items.length}`, color: '#6F5FC0' });
      }
    }
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 24);
    paint(ctx, '#FFFFFF', offer.locked ? 5 : 3, offer.locked ? palette.gold : accent);
    circle(ctx, cx, r.y + 76, 48);
    ctx.fillStyle = lighten(accent, 0.6);
    ctx.fill();
    if (offer.kind === 'weapon') drawWeaponIcon(ctx, offer.id, cx, r.y + 76, 68);
    else drawItemIcon(ctx, itemById(offer.id).icon, cx, r.y + 76, 68, palette.frameLine);
    ctx.fillStyle = palette.ink;
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, cx, r.y + 148);
    ctx.fillStyle = palette.textDim;
    ctx.font = `700 17px ${FONT}`;
    ctx.fillText(kind, cx, r.y + 176);
    lines.slice(0, 4).forEach((l, j) => {
      ctx.font = `${l.color === '#B07A12' ? 700 : 600} 17px ${FONT}`;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, cx, r.y + 204 + j * 23);
    });
    if (unlocks.length > 0 && !offer.sold) {
      roundRectPath(ctx, r.x + 12, r.y + 14, 64, 30, 15);
      paint(ctx, '#FFE7A0', 2, '#C9922E');
      ctx.fillStyle = '#7A4E0A';
      ctx.font = `800 17px ${FONT}`;
      ctx.fillText('联动', r.x + 44, r.y + 30);
    }
    const pw = 150;
    const px = cx - pw / 2;
    const py = r.y + r.h - 54;
    roundRectPath(ctx, px, py, pw, 40, 20);
    const affordable = run.shards >= offer.price;
    paint(ctx, affordable ? '#FFE7A0' : '#E8E4F2', 2.5, affordable ? '#C9922E' : '#B9B3D9');
    drawShardIcon(ctx, px + 32, py + 20, 11);
    ctx.fillStyle = affordable ? '#7A4E0A' : '#9A94B8';
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(String(offer.price), px + 88, py + 21);
    ctx.restore();
    if (!offer.sold) {
      const lock = S.offerLock(i);
      drawLock(ctx, lock.x + lock.w / 2, lock.y + lock.h / 2, 1.1, offer.locked);
    }
    if (offer.sold) {
      ctx.save();
      ctx.translate(cx, r.y + r.h / 2);
      ctx.rotate(-0.25);
      outlinedText(ctx, '已购买', 0, 0, 40, '#FFFFFF', 'center', '#9C82E6');
      ctx.restore();
    } else if (disabled) {
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 24);
      ctx.fillStyle = 'rgba(240, 236, 250, 0.35)';
      ctx.fill();
    }
  }

  /** Stats, items and weapons; opened from the pause button or the shop. */
  private drawPause(_game: Game, run: Run): void {
    const ctx = this.ctx;
    const p = S.PAUSE_PANEL;
    this.dim();
    this.panel(p.x, p.y, p.w, p.h, palette.frameLine);
    const c = run.character;
    this.drawAvatar(c, p.x + 80, p.y + 84, 50);
    outlinedText(ctx, c.name, p.x + 150, p.y + 64, 34, '#FFFFFF', 'left', darken(c.color, 0.35));
    ctx.fillStyle = palette.textDim;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${c.title} · 第 ${run.wave} 波 · Lv ${run.level}`, p.x + 152, p.y + 108);
    ctx.fillStyle = darken(c.color, 0.35);
    ctx.font = `800 18px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`技能 · ${c.skill.name}：${c.skill.desc}`, p.x + 34, p.y + 146);
    ctx.fillText(`职业 · ${CLASSES[c.cls].name}：${describeClass(c.cls)}`, p.x + 34, p.y + 176);

    // Stats in two columns
    const top = p.y + 222;
    const rowH = 38;
    const half = Math.ceil(STAT_ORDER.length / 2);
    STAT_ORDER.forEach((key, i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      const x = p.x + 34 + col * 316;
      const y = top + row * rowH;
      roundRectPath(ctx, x, y - 16, 296, 32, 12);
      ctx.fillStyle = row % 2 === 0 ? 'rgba(185, 168, 240, 0.14)' : 'rgba(185, 168, 240, 0.06)';
      ctx.fill();
      ctx.fillStyle = palette.ink;
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(STAT_INFO[key].name, x + 14, y);
      const v = run.stats[key];
      ctx.textAlign = 'right';
      ctx.fillStyle = key === 'maxHp' || v === 0 ? palette.ink : v > 0 ? '#2E9E6A' : '#D9466F';
      ctx.font = `800 21px ${FONT}`;
      ctx.fillText(statValue(key, v), x + 282, y);
    });

    // Weapons
    let y = top + half * rowH + 22;
    ctx.fillStyle = palette.textDim;
    ctx.font = `800 21px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('武器', p.x + 40, y);
    // Active weapon combos, as gold pills next to the heading.
    const combos = activeCombos(run.weapons.map((w) => w.id));
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(combos.length > 0 ? '联动' : '联动：凑齐特定两把武器触发', p.x + 100, y + 1);
    let cx = p.x + 148;
    ctx.font = `800 16px ${FONT}`;
    for (const combo of combos) {
      const tw = ctx.measureText(combo.name).width + 24;
      if (cx + tw > p.x + p.w - 24) break;
      roundRectPath(ctx, cx, y - 14, tw, 28, 14);
      paint(ctx, '#FFE7A0', 2, '#C9922E');
      ctx.fillStyle = '#7A4E0A';
      ctx.textAlign = 'center';
      ctx.fillText(combo.name, cx + tw / 2, y + 1);
      ctx.textAlign = 'left';
      cx += tw + 8;
    }
    y += 50;
    run.weapons.forEach((w, i) => {
      const x = p.x + 74 + i * 100;
      circle(ctx, x, y, 38);
      paint(ctx, '#FFFFFF', 3, TIER_COLORS[w.tier] === '#FFFFFF' ? palette.frameLine : TIER_COLORS[w.tier]);
      drawWeaponIcon(ctx, w.id, x, y - 4, 44);
      outlinedText(ctx, TIER_NAMES[w.tier], x, y + 26, 16, '#FFFFFF', 'center', palette.ink);
    });

    // Synergies: one line per tag with the current and the next set tier.
    y += 62;
    ctx.fillStyle = palette.textDim;
    ctx.font = `800 21px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('羁绊', p.x + 40, y);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText('同流派武器凑 2 / 4 / 6 把', p.x + 92, y + 1);
    const counts = countTags(run.weapons.map((w) => w.id));
    y += 34;
    for (const tag of TAG_ORDER) {
      const info = TAG_INFO[tag];
      const n = counts[tag];
      const tier = activeTier(tag, n);
      const next = nextThreshold(tag, n);
      const x = p.x + 40;
      roundRectPath(ctx, x, y - 13, 96, 26, 13);
      paint(ctx, tier >= 0 ? info.color : 'rgba(255, 255, 255, 0.9)', 2, tier >= 0 ? darken(info.color, 0.25) : lighten(info.color, 0.45));
      ctx.fillStyle = tier >= 0 ? '#FFFFFF' : darken(info.color, 0.1);
      ctx.font = `800 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${info.name} ${n}`, x + 48, y + 1);
      const parts: string[] = [];
      if (tier >= 0) parts.push(`当前 ${describeMods(SET_TIERS[tag][tier].mods).join(' ')}`);
      if (next !== null) {
        const t = SET_TIERS[tag].find((s) => s.count === next);
        if (t) parts.push(`${next} 把：${describeMods(t.mods).join(' ')}`);
      } else parts.push('（满）');
      ctx.textAlign = 'left';
      ctx.font = `600 16px ${FONT}`;
      ctx.fillStyle = tier >= 0 ? darken(info.color, 0.2) : palette.textDim;
      ctx.fillText(parts.join('　'), x + 108, y + 1);
      y += 28;
    }

    // Items
    y += 16;
    ctx.fillStyle = palette.textDim;
    ctx.font = `800 21px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(run.items.size > 0 ? '道具' : '道具（还没有）', p.x + 40, y);
    // Completed item sets, as pills next to the heading.
    let sx = p.x + 100;
    ctx.font = `800 16px ${FONT}`;
    for (const set of activeItemSets(run.items)) {
      const label = `套装·${set.name}`;
      const tw = ctx.measureText(label).width + 24;
      if (sx + tw > p.x + p.w - 24) break;
      roundRectPath(ctx, sx, y - 14, tw, 28, 14);
      paint(ctx, '#E4DCFF', 2, '#6F5FC0');
      ctx.fillStyle = '#4B3F99';
      ctx.textAlign = 'center';
      ctx.fillText(label, sx + tw / 2, y + 1);
      ctx.textAlign = 'left';
      sx += tw + 8;
    }
    y += 42;
    let n = 0;
    for (const item of ITEMS) {
      const count = run.items.get(item.id);
      if (!count) continue;
      const x = p.x + 62 + (n % 10) * 58;
      const yy = y + Math.floor(n / 10) * 58;
      drawItemIcon(ctx, item.icon, x, yy, 46, palette.frameLine);
      if (count > 1) outlinedText(ctx, `×${count}`, x + 18, yy + 20, 16, '#FFFFFF', 'center', palette.ink);
      n++;
    }
  }

  private drawEnd(game: Game, run: Run): void {
    const ctx = this.ctx;
    const won = game.scene === 'victory';
    this.dim();
    this.panel(60, 250, 600, 800, won ? palette.gold : palette.frameLine);
    const title = won ? '通关！' : run.mode === 'endless' ? '挑战结束' : '挑战失败';
    outlinedText(ctx, title, 360, 322, 60, won ? palette.goldLight : '#FFD0DE', 'center', won ? '#A8700E' : '#C2477F');
    const c = run.character;
    const portrait = this.images.get(portraitImagePath(c.id));
    if (portrait) {
      const h = 240;
      const w = (portrait.width / portrait.height) * h;
      ctx.drawImage(portrait, 360 - w / 2, 362, w, h);
    } else {
      drawCharacter(
        ctx,
        c,
        { x: 360, feetY: 590, scale: 1.4, facing: 1, time: game.time, moving: false, hurt: won ? 0 : 0.5, ghost: false },
        this.images.get(chibiImagePath(c.id)) ?? null,
        this.rigs.get(c.id) ?? null,
      );
    }
    ctx.fillStyle = palette.ink;
    ctx.font = `800 28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const where = run.stage ? `${run.stage.id} ${run.stage.name}` : MODE_NAMES[run.mode];
    ctx.fillText(`${c.name} · ${where}`, 360, 630);
    ctx.fillStyle = palette.textDim;
    ctx.font = `700 21px ${FONT}`;
    ctx.fillText(`第 ${run.wave} 波 · 击败 ${run.kills} 只 · 等级 ${run.level}`, 360, 666);

    const result = game.lastResult;
    if (run.stage && won && result) {
      // Three stars; the ones earned this run light up.
      for (let k = 0; k < 3; k++) {
        const on = (result.stars & (1 << k)) !== 0;
        this.starPath(240 + k * 120, 708, 20);
        paint(ctx, on ? palette.gold : '#FFFFFF', 3, on ? '#C9922E' : palette.frameLine);
        ctx.fillStyle = on ? darken(palette.gold, 0.3) : palette.textDim;
        ctx.font = `700 14px ${FONT}`;
        ctx.fillText(STAR_LABELS[k], 240 + k * 120, 740);
      }
    } else if (run.mode === 'endless') {
      if (game.newRecord) {
        outlinedText(ctx, '★ 新纪录！', 360, 700, 28, palette.goldLight, 'center', '#A8700E');
      } else {
        const rec = game.save.endless;
        ctx.fillStyle = darken(palette.gold, 0.25);
        ctx.font = `800 20px ${FONT}`;
        ctx.fillText(`最高：第 ${rec.bestWave} 波 · 击败 ${rec.bestKills}`, 360, 700);
      }
      this.drawEndRank(game);
    }
    if (result && result.stardust > 0) {
      const extra = result.newStars > 0 ? `（新星 +${result.newStars}）` : '';
      outlinedText(ctx, `+${result.stardust} 星尘${extra}`, 360, 770, 22, palette.goldLight, 'center', '#A8700E');
    }
  }

  /** Where the finished endless run landed on the leaderboard. */
  private drawEndRank(game: Game): void {
    const ctx = this.ctx;
    const r = S.END_RANK;
    const e = game.endRank;
    let text = '';
    let tappable = false;
    if (e.state === 'noname') {
      text = '🏆 点这里起个名字，上排行榜';
      tappable = true;
    } else if (e.state === 'sending') text = '正在上传成绩……';
    else if (e.state === 'error') {
      text = '成绩没传上去，点这里重试';
      tappable = true;
    } else if (e.state === 'done') {
      const where = game.boardOnline ? '' : '本机';
      text = `🏆 ${where}总榜第 ${e.all} 名 · 本周第 ${e.week} 名`;
    }
    if (!text) return;
    if (tappable) {
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 21);
      paint(ctx, 'rgba(138, 92, 224, 0.12)', 2, '#8A5CE0');
    }
    ctx.fillStyle = '#5A2E9E';
    ctx.font = `800 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2);
  }

  private panel(x: number, y: number, w: number, h: number, border: string): void {
    const ctx = this.ctx;
    roundRectPath(ctx, x + 6, y + 10, w, h, 34);
    ctx.fillStyle = 'rgba(60, 40, 110, 0.18)';
    ctx.fill();
    roundRectPath(ctx, x, y, w, h, 34);
    paint(ctx, 'rgba(252, 250, 255, 0.98)', 4, border);
    roundRectPath(ctx, x + 8, y + 8, w - 16, h - 16, 28);
    ctx.strokeStyle = rgba(palette.gold, 0.45);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (const [cx, cy] of [
      [x + 30, y + 30],
      [x + w - 30, y + 30],
    ]) {
      diamondPath(ctx, cx, cy, 6, 9);
      paint(ctx, '#FFFFFF', 1.6, palette.gold);
    }
  }

  private drawButton(b: Button): void {
    const ctx = this.ctx;
    const style = b.style === 'card' ? 'secondary' : b.style;
    const [light, base, line] = BUTTON_COLORS[style];
    const depth = b.h > 60 ? 7 : 5;
    const r = Math.min(26, b.h / 2);
    ctx.save();
    if (b.disabled) ctx.globalAlpha = 0.5;
    roundRectPath(ctx, b.x, b.y + depth, b.w, b.h, r);
    ctx.fillStyle = darken(base, 0.18);
    ctx.fill();
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, light);
    g.addColorStop(1, base);
    roundRectPath(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fillStyle = g;
    ctx.fill();
    roundRectPath(ctx, b.x + 4, b.y + 4, b.w - 8, b.h - 8, r - 4);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    roundRectPath(ctx, b.x, b.y, b.w, b.h + depth, r);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const label = b.style === 'ad' ? `▶ ${b.label}` : b.label;
    const size = b.h > 96 ? 34 : b.h > 60 ? 28 : 22;
    outlinedText(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 1, size, '#FFFFFF', 'center', line);
    ctx.restore();
  }

  private drawToast(game: Game): void {
    const t = game.toast;
    if (t.t <= 0 || !t.text) return;
    const ctx = this.ctx;
    const y = game.scene === 'battle' ? 320 : 1090;
    ctx.globalAlpha = Math.min(1, t.t * 3);
    ctx.font = `800 32px ${FONT}`;
    const w = ctx.measureText(t.text).width + 64;
    roundRectPath(ctx, 360 - w / 2, y - 32, w, 64, 32);
    paint(ctx, 'rgba(255, 255, 255, 0.95)', 3, palette.frameLine);
    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.text, 360, y + 1);
    ctx.globalAlpha = 1;
  }

  private dim(): void {
    const ctx = this.ctx;
    const canvas = this.platform.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(60, 44, 110, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** A stat as shown in panels: "15%", "+3", "20". */
function statValue(key: StatKey, v: number): string {
  const info = STAT_INFO[key];
  if (key === 'maxHp') return formatNumber(v);
  // Dodge stops counting at the cap; say so instead of showing a useless 80%.
  if (key === 'dodge' && v >= MAX_DODGE) return `+${MAX_DODGE}%（满）`;
  const sign = v > 0 ? '+' : '';
  return `${sign}${Math.round(v)}${info.percent ? '%' : ''}`;
}

/** Greedy wrap that works for Chinese (no spaces needed). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
  ctx.font = font;
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}
