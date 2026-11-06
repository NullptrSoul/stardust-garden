import { clamp } from '../engine/math';
import { roundRectPath, type Button } from '../engine/ui';
import type { ImageSource, Platform, Surface } from '../platform/types';
import { drawCharacter } from './art/chibi';
import { circle, diamondPath, ellipse, FONT, formatNumber, heartPath, outlinedText, paint, sparklePath } from './art/draw';
import { bakeBackdrop, bakeCloud, bakeIsland, type IslandSprite } from './art/ground';
import { drawCandy, drawChest, drawItemIcon, drawLock, drawShardIcon, drawWeaponIcon } from './art/icons';
import { drawMonster } from './art/monsters';
import { config } from './config';
import { avatarImagePath, CHARACTERS, chibiImagePath, portraitImagePath, type CharacterDef } from './data/characters';
import { ITEMS } from './data/items';
import { RARITY_COLORS, RARITY_NAMES } from './data/upgrades';
import { TIER_COLORS, TIER_COOLDOWN, TIER_DAMAGE, TIER_NAMES, weaponById } from './data/weapons';
import type { Game } from './game';
import * as L from './layout';
import { darken, lighten, palette, rgba } from './palette';
import { itemById, type Run, type ShopOffer } from './run';
import * as S from './screens';
import { describeMods, formatMod, STAT_INFO, STAT_ORDER, type StatKey } from './stats';
import { isWindingUp } from './boss';
import { SKILL_MAX, type World } from './world';

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
  private readonly island: IslandSprite;
  private readonly clouds: Surface[];
  private readonly images = new Map<string, ImageSource>();
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
    this.island = bakeIsland(platform);
    this.clouds = [bakeCloud(platform, 1), bakeCloud(platform, 2), bakeCloud(platform, 3)];
    // Character art is optional: missing files just keep the placeholder.
    for (const c of CHARACTERS) {
      for (const path of [chibiImagePath(c.id), portraitImagePath(c.id), avatarImagePath(c.id)]) {
        platform.loadImage(path).then(
          (img) => this.images.set(path, img),
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

    if (game.scene === 'select' || !run) {
      ctx.drawImage(this.backdrop, 0, 0);
      this.drawSelect(game);
    } else {
      this.drawSky(game);
      this.drawWorld(game, run, game.world);
      this.drawPetals(game.time);
      this.drawVignette(game, run, game.world);
      if (game.scene === 'battle') {
        this.drawJoystick(game);
        this.drawBossPointer(game, game.world);
        this.drawSkillButton(game, run, game.world);
      }
      this.drawHud(game, run, game.world);
      if (game.cutin && game.scene === 'battle') this.drawCutin(game, run);
      if (game.bossIntro && game.scene === 'battle') this.drawBossIntro(game);
      switch (game.scene) {
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
    ctx.fillStyle = this.edgeGradient('rgba(25, 15, 55, 0)', 'rgba(25, 15, 55, 0.5)');
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
      ctx.fillStyle = i % 3 === 0 ? 'rgba(217, 200, 255, 0.75)' : 'rgba(255, 190, 215, 0.8)';
      ellipse(ctx, 0, 0, 5.5, 2.8);
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
    ctx.drawImage(this.island.surface, this.island.x, this.island.y);

    // Jelly stains where monsters burst
    for (const d of world.decals) {
      const a = Math.min(1, d.life / 1.5) * 0.4;
      ctx.fillStyle = rgba(d.color, a);
      for (let i = 0; i < 3; i++) {
        const ox = Math.cos(d.seed + i * 2.1) * d.r * 0.35;
        const oy = Math.sin(d.seed + i * 2.1) * d.r * 0.15;
        ellipse(ctx, d.x + ox, d.y + oy, d.r * (0.55 - i * 0.12), d.r * (0.28 - i * 0.06));
        ctx.fill();
      }
    }

    // Boss attack warnings: the red area fills up as the hit gets closer.
    for (const z of world.zones) {
      const k = 1 - z.t / z.max;
      const blink = 0.5 + 0.5 * Math.sin(t * 24);
      ctx.save();
      if (z.kind === 'circle') {
        ellipse(ctx, z.x, z.y, z.r, z.r * 0.55);
        ctx.fillStyle = 'rgba(255, 40, 80, 0.16)';
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 59, 107, ${0.6 + 0.4 * blink})`;
        ctx.lineWidth = 4;
        ctx.stroke();
        ellipse(ctx, z.x, z.y, z.r * k, z.r * 0.55 * k);
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

    for (const m of world.spawns) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 14);
      const r = Math.min(m.def.boss ? 90 : 46, m.def.radius * (m.elite ? 1.3 : 0.9));
      const y = m.y + m.def.radius * 0.3;
      ctx.globalAlpha = 0.5 + 0.4 * pulse;
      circle(ctx, m.x, y, r);
      ctx.fillStyle = 'rgba(255, 92, 138, 0.18)';
      ctx.fill();
      ctx.strokeStyle = palette.danger;
      ctx.lineWidth = 3;
      ctx.stroke();
      const k = r * 0.45;
      ctx.beginPath();
      ctx.moveTo(m.x - k, y - k);
      ctx.lineTo(m.x + k, y + k);
      ctx.moveTo(m.x + k, y - k);
      ctx.lineTo(m.x - k, y + k);
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = 1;
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
          }),
      });
    }
    list.push({ y: p.y, draw: () => this.drawPlayer(run.character, world, t) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    for (const w of world.weapons) {
      const bob = Math.sin(t * 3 + w.x * 0.05) * 3;
      const size = 34 * (1 + w.kick * 0.18);
      circle(ctx, w.x, w.y + bob, 20);
      ctx.fillStyle = rgba(TIER_COLORS[w.tier], 0.55);
      ctx.fill();
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

  private drawPlayer(c: CharacterDef, world: World, t: number): void {
    const p = world.player;
    drawCharacter(
      this.ctx,
      c,
      { x: p.x, feetY: p.y + 22, scale: 0.95, facing: p.facing, time: t, moving: p.moving, hurt: p.hurt, ghost: p.invuln > 0 && p.hp > 0 },
      this.images.get(chibiImagePath(c.id)) ?? null,
    );
  }

  private drawShots(world: World): void {
    const ctx = this.ctx;
    for (const s of world.shots) {
      const tail = 0.035;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
      if (s.kind === 'star') {
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
      ctx.fillStyle = 'rgba(255, 123, 172, 0.28)';
      ctx.fill();
      circle(ctx, b.x, b.y, b.r);
      paint(ctx, palette.enemyBullet, 2.5, '#A82E60');
      circle(ctx, b.x - 3, b.y - 3, 3.5);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
  }

  private drawEffects(world: World, t: number): void {
    const ctx = this.ctx;
    for (const s of world.swings) {
      const k = s.life / s.maxLife;
      const half = Math.PI / 3;
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
    ctx.fillText(`第 ${run.wave}/${config.waveCount} 波`, 550, 48);
    if (world.duration > 0) {
      const left = Math.ceil(world.remaining);
      outlinedText(ctx, String(left), 550, 96, 50, left <= 5 ? '#FFD0DE' : '#FFFFFF', 'center', left <= 5 ? '#C2477F' : palette.ink);
    } else {
      outlinedText(ctx, 'BOSS', 550, 96, 38, '#FFD0DE', 'center', '#C2477F');
    }

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
      );
      drawWeaponIcon(ctx, c.startWeapon, r.x + r.w - 34, r.y + 36, 34);
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
    ctx.fillText(`技能 · ${sel.skill.name}：${sel.skill.desc}`, 360, 1082);
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
    drawItemIcon(ctx, item.icon, 360, 560, 150, palette.gold);
    ctx.fillStyle = palette.ink;
    ctx.font = `800 36px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, 360, 690);
    ctx.font = `700 24px ${FONT}`;
    describeMods(item.mods).forEach((line, i) => {
      ctx.fillStyle = line.startsWith('-') ? '#D9466F' : '#2E9E6A';
      ctx.fillText(line, 360, 744 + i * 34);
    });
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
      ctx.fillText(`当前 ${statValue(card.key, run.stats[card.key])}`, r.x + 50, r.y + 126);
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
    ctx.fillText(`第 ${run.wave} 波结束`, 172, 196);
    drawShardIcon(ctx, 400, 190, 16);
    outlinedText(ctx, String(run.shards), 424, 192, 36, '#FFFFFF', 'left', '#3F6EB8');

    run.offers.forEach((offer, i) => this.drawOffer(i, offer, run, game.offerButtons[i]?.disabled ?? false));

    ctx.fillStyle = palette.textDim;
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`武器 ${run.weapons.length} / ${config.maxWeapons}`, 34, 968);
    if (game.selectedSlot < 0) {
      ctx.fillStyle = 'rgba(61, 51, 102, 0.45)';
      ctx.font = `600 17px ${FONT}`;
      ctx.fillText('点武器可以卖掉', 160, 968);
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
    if (offer.kind === 'weapon') {
      const def = weaponById(offer.id);
      accent = TIER_COLORS[offer.tier] === '#FFFFFF' ? def.color : TIER_COLORS[offer.tier];
      title = `${def.name} ${TIER_NAMES[offer.tier]}`;
      kind = `武器 · ${def.cls === 'melee' ? '近战' : '远程'}`;
      const dmg = Math.round(def.damage * TIER_DAMAGE[offer.tier]);
      const cd = (def.cooldown * TIER_COOLDOWN[offer.tier]).toFixed(2);
      lines = [
        ...wrap(ctx, def.desc, r.w - 44, `600 18px ${FONT}`).map((text) => ({ text, color: palette.ink })),
        { text: `伤害 ${dmg} · 冷却 ${cd} 秒`, color: '#6F5FC0' },
      ];
    } else {
      const item = itemById(offer.id);
      title = item.name;
      kind = '道具';
      lines = describeMods(item.mods).map((text) => ({ text, color: text.startsWith('-') ? '#D9466F' : '#2E9E6A' }));
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
    ctx.font = `600 18px ${FONT}`;
    lines.slice(0, 3).forEach((l, j) => {
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, cx, r.y + 208 + j * 25);
    });
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
  private drawPause(game: Game, run: Run): void {
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
    outlinedText(ctx, game.pausedFrom === 'battle' ? '暂停' : '属性', p.x + p.w - 40, p.y + 70, 34, '#FFFFFF', 'right', palette.ink);
    ctx.fillStyle = darken(c.color, 0.35);
    ctx.font = `800 18px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`技能 · ${c.skill.name}：${c.skill.desc}`, p.x + 34, p.y + 146);

    // Stats in two columns
    const top = p.y + 186;
    const rowH = 44;
    const half = Math.ceil(STAT_ORDER.length / 2);
    STAT_ORDER.forEach((key, i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      const x = p.x + 34 + col * 316;
      const y = top + row * rowH;
      roundRectPath(ctx, x, y - 18, 296, 36, 12);
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
    let y = top + half * rowH + 26;
    ctx.fillStyle = palette.textDim;
    ctx.font = `800 21px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('武器', p.x + 40, y);
    y += 50;
    run.weapons.forEach((w, i) => {
      const x = p.x + 74 + i * 100;
      circle(ctx, x, y, 38);
      paint(ctx, '#FFFFFF', 3, TIER_COLORS[w.tier] === '#FFFFFF' ? palette.frameLine : TIER_COLORS[w.tier]);
      drawWeaponIcon(ctx, w.id, x, y - 4, 44);
      outlinedText(ctx, TIER_NAMES[w.tier], x, y + 26, 16, '#FFFFFF', 'center', palette.ink);
    });

    // Items
    y += 66;
    ctx.fillStyle = palette.textDim;
    ctx.font = `800 21px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(run.items.size > 0 ? '道具' : '道具（还没有）', p.x + 40, y);
    y += 46;
    let n = 0;
    for (const item of ITEMS) {
      const count = run.items.get(item.id);
      if (!count) continue;
      const x = p.x + 64 + (n % 9) * 66;
      const yy = y + Math.floor(n / 9) * 70;
      drawItemIcon(ctx, item.icon, x, yy, 52, palette.frameLine);
      if (count > 1) outlinedText(ctx, `×${count}`, x + 18, yy + 20, 16, '#FFFFFF', 'center', palette.ink);
      n++;
    }
  }

  private drawEnd(game: Game, run: Run): void {
    const ctx = this.ctx;
    const won = game.scene === 'victory';
    this.dim();
    this.panel(60, 250, 600, 800, won ? palette.gold : palette.frameLine);
    outlinedText(ctx, won ? '通关！' : '冒险失败', 360, 330, 60, won ? palette.goldLight : '#FFD0DE', 'center', won ? '#A8700E' : '#C2477F');
    const c = run.character;
    const portrait = this.images.get(portraitImagePath(c.id));
    if (portrait) {
      const h = 290;
      const w = (portrait.width / portrait.height) * h;
      ctx.drawImage(portrait, 360 - w / 2, 362, w, h);
    } else {
      drawCharacter(
        ctx,
        c,
        { x: 360, feetY: 610, scale: 1.6, facing: 1, time: game.time, moving: false, hurt: won ? 0 : 0.5, ghost: false },
        this.images.get(chibiImagePath(c.id)) ?? null,
      );
    }
    ctx.fillStyle = palette.ink;
    ctx.font = `800 28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${c.name} · 第 ${run.wave} 波`, 360, 680);
    ctx.fillStyle = palette.textDim;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(`击败 ${run.kills} 只怪物 · 等级 ${run.level}`, 360, 724);
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
