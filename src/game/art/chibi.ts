import type { CharacterDef } from '../data/characters';
import { darken, lighten } from '../palette';
import type { ImageSource } from '../../platform/types';
import { roundRectPath } from '../../engine/ui';
import { circle, ellipse, LINE, paint, sparklePath } from './draw';
import { drawRig, type LoadedRig, type RigMotion } from './rig';

export interface ChibiPose {
  x: number;
  feetY: number;
  scale: number;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
  time: number;
  moving: boolean;
  /** 1 right after taking damage. */
  hurt: number;
  /** Semi-transparent while invulnerable. */
  ghost: boolean;
  /** Kept by the caller so layered hair and cloth ease in and out of running. */
  motion?: RigMotion;
}

/** Standing height at scale 1, in design units. */
export const CHIBI_HEIGHT = 130;

/**
 * Draws the character. Prefers the layered rig, then the single chibi image,
 * then a code-drawn placeholder in the character's colors.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  c: CharacterDef,
  p: ChibiPose,
  image: ImageSource | null,
  rig: LoadedRig | null = null,
): void {
  const run = p.moving ? p.time * 14 : 0;
  // A rig breathes on its own, so it keeps its feet on the ground when idle.
  const bob = p.moving ? Math.abs(Math.sin(run)) * (rig ? 3.5 : 5) : rig ? 0 : Math.sin(p.time * 2.4) * 1.2;
  ctx.save();
  ctx.translate(p.x, p.feetY);
  ctx.scale(p.scale, p.scale);
  ctx.fillStyle = 'rgba(80, 60, 140, 0.22)';
  ellipse(ctx, 0, 2, 28, 7);
  ctx.fill();
  if (p.ghost) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(p.time * 40);
  ctx.scale(p.facing, 1);
  ctx.translate(0, -bob);
  if (p.hurt > 0) ctx.rotate(Math.sin(p.time * 60) * 0.06 * p.hurt);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (rig) {
    // The rig's height is measured to the top of the art, so it needs less
    // headroom than chibi.png.
    const s = (CHIBI_HEIGHT * 1.07) / rig.def.height;
    ctx.scale(s, s);
    drawRig(ctx, rig, p);
  } else if (image) {
    const h = CHIBI_HEIGHT * 1.1;
    const w = (image.width / image.height) * h;
    ctx.drawImage(image, -w / 2, -h, w, h);
  } else {
    drawPlaceholder(ctx, c, run, p);
  }
  ctx.restore();
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, c: CharacterDef, run: number, p: ChibiPose): void {
  const hairLine = darken(c.hair, 0.5);
  const skin = '#FFE6D8';
  const skinLine = '#D9A090';
  const outfitLine = darken(c.outfit, 0.45);

  // Tails go behind everything.
  if (c.accessory === 'catEars') {
    const sway = Math.sin(p.time * 3) * 6;
    ctx.beginPath();
    ctx.moveTo(-10, -30);
    ctx.quadraticCurveTo(-42, -36 + sway, -34, -66 + sway);
    ctx.strokeStyle = hairLine;
    ctx.lineWidth = 11;
    ctx.stroke();
    ctx.strokeStyle = c.hair;
    ctx.lineWidth = 7;
    ctx.stroke();
  } else if (c.accessory === 'maid') {
    const sway = Math.sin(p.time * 2.5) * 0.15;
    ctx.save();
    ctx.translate(-12, -24);
    ctx.rotate(-0.4 + sway);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-22, -4, -30, -16);
    ctx.quadraticCurveTo(-42, -16, -46, -28);
    ctx.quadraticCurveTo(-34, -24, -30, -16);
    ctx.quadraticCurveTo(-26, -30, -34, -40);
    ctx.quadraticCurveTo(-20, -30, -22, -14);
    ctx.quadraticCurveTo(-14, -8, 0, -8);
    ctx.closePath();
    paint(ctx, c.hair, LINE, hairLine);
    ctx.restore();
  }

  // Long back hair
  const back = ctx.createLinearGradient(0, -100, 0, -10);
  back.addColorStop(0, lighten(c.hair, 0.25));
  back.addColorStop(1, c.hair);
  ctx.beginPath();
  ctx.moveTo(-30, -82);
  ctx.bezierCurveTo(-44, -52, -42, -22, -30, -12);
  ctx.quadraticCurveTo(0, -6, 30, -12);
  ctx.bezierCurveTo(42, -22, 44, -52, 30, -82);
  ctx.closePath();
  paint(ctx, back, LINE, hairLine);

  // Legs and shoes
  const step = p.moving ? Math.sin(run) : 0;
  for (const [x, lift] of [
    [-6, Math.max(0, step) * 6],
    [6, Math.max(0, -step) * 6],
  ] as const) {
    roundRectPath(ctx, x - 3.5, -20 - lift, 7, 16, 3);
    paint(ctx, skin, 2, skinLine);
    roundRectPath(ctx, x - 5, -7 - lift, 10, 7, 3.5);
    paint(ctx, darken(c.color, 0.25), 2, darken(c.color, 0.55));
  }

  // Dress with a frilled hem
  const dress = ctx.createLinearGradient(0, -54, 0, -16);
  dress.addColorStop(0, lighten(c.outfit, 0.15));
  dress.addColorStop(1, c.outfit);
  ctx.beginPath();
  ctx.moveTo(-11, -54);
  ctx.lineTo(11, -54);
  ctx.quadraticCurveTo(19, -36, 25, -18);
  for (let i = 0; i < 5; i++) {
    const x0 = 25 - i * 10;
    ctx.quadraticCurveTo(x0 - 5, -13, x0 - 10, -18);
  }
  ctx.quadraticCurveTo(-19, -36, -11, -54);
  ctx.closePath();
  paint(ctx, dress, LINE, outfitLine);
  ctx.beginPath();
  ctx.moveTo(-23, -21);
  for (let i = 0; i < 5; i++) {
    const x0 = -23 + i * 9.2;
    ctx.quadraticCurveTo(x0 + 4.6, -15, x0 + 9.2, -21);
  }
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.stroke();
  if (c.accessory === 'maid') {
    roundRectPath(ctx, -9, -46, 18, 26, 4);
    paint(ctx, '#FFFFFF', 2, '#B9A8F0');
  }
  // Sash and bow in the signature color
  roundRectPath(ctx, -13, -43, 26, 5, 2.5);
  paint(ctx, c.color, 1.8, darken(c.color, 0.45));
  sparklePath(ctx, 0, -41, 5, Math.PI / 4);
  paint(ctx, lighten(c.color, 0.4), 1.6, darken(c.color, 0.45));

  // Arms
  const swing = p.moving ? Math.sin(run) * 0.4 : 0;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 12, -50);
    ctx.rotate(side * 0.25 + swing * side);
    ellipse(ctx, 0, 8, 4, 9);
    paint(ctx, skin, 2, skinLine);
    ctx.restore();
  }

  // Head
  const hy = -78;
  circle(ctx, 0, hy, 30);
  paint(ctx, skin, LINE, skinLine);

  // Bangs
  const bangs = ctx.createLinearGradient(0, -112, 0, -70);
  bangs.addColorStop(0, lighten(c.hair, 0.35));
  bangs.addColorStop(1, c.hair);
  ctx.beginPath();
  ctx.moveTo(-31, -74);
  ctx.bezierCurveTo(-35, -114, 35, -114, 31, -74);
  const tips = [26, 20, 12, 4, -4, -12, -20, -26];
  tips.forEach((x, i) => ctx.lineTo(x, i % 2 === 0 ? -82 : -72));
  ctx.closePath();
  paint(ctx, bangs, LINE, hairLine);
  // Side locks
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 29, -80);
    ctx.quadraticCurveTo(side * 37, -58, side * 31, -42);
    ctx.quadraticCurveTo(side * 26, -56, side * 23, -72);
    ctx.closePath();
    paint(ctx, c.hair, 2.2, hairLine);
  }
  // Hair shine
  ctx.beginPath();
  ctx.ellipse(-4, -100, 14, 4, -0.15, Math.PI * 1.1, Math.PI * 1.9);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Face
  const blink = (p.time * 0.25) % 1 < 0.03;
  for (const side of [-1, 1]) {
    const ex = side * 11 + 2;
    const ey = -70;
    if (p.hurt > 0.4) {
      ctx.beginPath();
      ctx.moveTo(ex - side * 5, ey - 5);
      ctx.lineTo(ex + side * 4, ey);
      ctx.lineTo(ex - side * 5, ey + 5);
      ctx.strokeStyle = hairLine;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      continue;
    }
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(ex - 6, ey + 1);
      ctx.quadraticCurveTo(ex, ey - 6, ex + 6, ey + 1);
      ctx.strokeStyle = hairLine;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      continue;
    }
    ellipse(ctx, ex, ey, 6.5, 8.5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.save();
    ellipse(ctx, ex, ey, 6.5, 8.5);
    ctx.clip();
    const g = ctx.createLinearGradient(0, ey - 8, 0, ey + 8);
    g.addColorStop(0, darken(c.eyes, 0.45));
    g.addColorStop(1, lighten(c.eyes, 0.3));
    ellipse(ctx, ex + 1, ey + 1, 5.4, 7.6);
    ctx.fillStyle = g;
    ctx.fill();
    ellipse(ctx, ex + 1, ey + 1.5, 2.4, 3.6);
    ctx.fillStyle = darken(c.eyes, 0.7);
    ctx.fill();
    ellipse(ctx, ex - 1.5, ey - 3, 2.2, 1.8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    circle(ctx, ex + 3, ey + 3.5, 1);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(ex, ey, 6.5, 8.5, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.strokeStyle = hairLine;
    ctx.lineWidth = 2.8;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 130, 160, 0.42)';
  ellipse(ctx, -14, -60, 5, 2.6);
  ctx.fill();
  ellipse(ctx, 18, -60, 5, 2.6);
  ctx.fill();
  ctx.beginPath();
  if (p.hurt > 0.4) {
    ellipse(ctx, 2, -57, 3, 3.5);
    paint(ctx, '#FF8FAE', 1.6, skinLine);
  } else {
    ctx.moveTo(-2, -58);
    ctx.quadraticCurveTo(2, -54, 6, -58);
    ctx.strokeStyle = skinLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawAccessory(ctx, c, hairLine);
}

function drawAccessory(ctx: CanvasRenderingContext2D, c: CharacterDef, hairLine: string): void {
  switch (c.accessory) {
    case 'horns':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 14, -102);
        ctx.quadraticCurveTo(side * 30, -116, side * 22, -134);
        ctx.quadraticCurveTo(side * 24, -116, side * 8, -104);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -134, 0, -102);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(1, '#E4DCFF');
        paint(ctx, g, 2.2, '#9C8CD6');
      }
      flower(ctx, 24, -96, '#FFFFFF', '#F2C65E');
      break;
    case 'catEars':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 10, -103);
        ctx.lineTo(side * 24, -130);
        ctx.lineTo(side * 31, -96);
        ctx.closePath();
        paint(ctx, c.hair, LINE, hairLine);
        ctx.beginPath();
        ctx.moveTo(side * 15, -103);
        ctx.lineTo(side * 24, -122);
        ctx.lineTo(side * 27, -100);
        ctx.closePath();
        ctx.fillStyle = '#FFC2D6';
        ctx.fill();
      }
      break;
    case 'headdress':
      ctx.beginPath();
      ctx.arc(0, -84, 31, Math.PI * 1.15, Math.PI * 1.85);
      ctx.strokeStyle = '#2E2440';
      ctx.lineWidth = 7;
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 1.15 + (i / 6) * Math.PI * 0.7;
        circle(ctx, Math.cos(a) * 35, -84 + Math.sin(a) * 35, 3.2);
        ctx.fillStyle = '#2E2440';
        ctx.fill();
      }
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 26, -96);
        ctx.lineTo(side * 40, -104);
        ctx.lineTo(side * 38, -88);
        ctx.closePath();
        paint(ctx, '#B0304A', 2, '#5A1426');
      }
      sparklePath(ctx, 0, -112, 6, 0);
      paint(ctx, '#F2C65E', 1.6, '#9C7420');
      break;
    case 'flower':
      flower(ctx, 24, -98, c.color, '#FFE07A');
      flower(ctx, 32, -86, lighten(c.color, 0.3), '#FFE07A', 0.7);
      break;
    case 'hat': {
      ctx.save();
      ctx.translate(6, -106);
      ctx.rotate(0.18);
      ellipse(ctx, 0, 0, 26, 8);
      paint(ctx, darken(c.color, 0.15), LINE, darken(c.color, 0.55));
      ctx.beginPath();
      ctx.moveTo(-16, -2);
      ctx.bezierCurveTo(-16, -22, 16, -22, 16, -2);
      ctx.closePath();
      paint(ctx, darken(c.color, 0.15), LINE, darken(c.color, 0.55));
      roundRectPath(ctx, -16, -7, 32, 5, 2);
      paint(ctx, '#FFFFFF', 1.6, '#B9A8F0');
      sparklePath(ctx, 12, -8, 5, 0);
      paint(ctx, '#F2C65E', 1.4, '#9C7420');
      ctx.restore();
      break;
    }
    case 'maid':
      ctx.beginPath();
      ctx.arc(0, -82, 32, Math.PI * 1.18, Math.PI * 1.82);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 1.18 + (i / 5) * Math.PI * 0.64;
        circle(ctx, Math.cos(a) * 36, -82 + Math.sin(a) * 36, 4.2);
        paint(ctx, '#FFFFFF', 1.6, '#B9A8F0');
      }
      break;
  }
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, petal: string, center: string, s = 1): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ellipse(ctx, x + Math.cos(a) * 5 * s, y + Math.sin(a) * 5 * s, 4.2 * s, 4.2 * s);
    paint(ctx, petal, 1.4, darken(petal, 0.4));
  }
  circle(ctx, x, y, 2.6 * s);
  ctx.fillStyle = center;
  ctx.fill();
}
