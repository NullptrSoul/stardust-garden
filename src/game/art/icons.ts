import { roundRectPath } from '../../engine/ui';
import { darken, lighten, palette } from '../palette';
import { circle, ellipse, FONT, paint, sparklePath } from './draw';

/** Weapon icon centered on (x, y), about `size` across. */
export function drawWeaponIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 40;
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (id) {
    case 'staff':
      ctx.beginPath();
      ctx.moveTo(-12, 18);
      ctx.lineTo(8, -8);
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = '#C9A35A';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      sparklePath(ctx, 10, -10, 13, 0);
      paint(ctx, '#FFE07A', 2.2, '#B8862A');
      break;
    case 'crescent':
      ctx.beginPath();
      ctx.arc(0, 0, 18, -Math.PI * 0.7, Math.PI * 0.7);
      ctx.arc(-7, 0, 13, Math.PI * 0.62, -Math.PI * 0.62, true);
      ctx.closePath();
      paint(ctx, '#E9E2FF', 2.4, '#7E6CC9');
      sparklePath(ctx, 12, -12, 5, 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      break;
    case 'talisman':
      roundRectPath(ctx, -11, -18, 22, 32, 3);
      paint(ctx, '#FFF6E0', 2.2, '#B48C5A');
      ctx.beginPath();
      ctx.moveTo(2, -12);
      ctx.lineTo(-5, 0);
      ctx.lineTo(1, 0);
      ctx.lineTo(-3, 10);
      ctx.lineTo(6, -3);
      ctx.lineTo(0, -3);
      ctx.closePath();
      paint(ctx, '#B48CFF', 1.6, '#6F55C9');
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(0, 20);
      ctx.strokeStyle = palette.danger;
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    case 'fan':
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.arc(0, 14, 26, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.closePath();
      paint(ctx, '#BFF2EC', 2.4, '#4FA89C');
      ctx.strokeStyle = 'rgba(79, 168, 156, 0.6)';
      ctx.lineWidth = 1.6;
      for (let i = 1; i < 5; i++) {
        const a = -Math.PI * 0.85 + (i / 5) * Math.PI * 0.7;
        ctx.beginPath();
        ctx.moveTo(0, 14);
        ctx.lineTo(Math.cos(a) * 25, 14 + Math.sin(a) * 25);
        ctx.stroke();
      }
      circle(ctx, 0, 14, 3);
      paint(ctx, '#F2C65E', 1.4, '#9C7420');
      break;
    case 'bubble':
      for (const [bx, by, r] of [
        [-6, 4, 12],
        [9, -8, 8],
        [10, 10, 5],
      ]) {
        circle(ctx, bx, by, r);
        paint(ctx, 'rgba(200, 232, 255, 0.85)', 2, '#5B86C9');
        ellipse(ctx, bx - r * 0.35, by - r * 0.35, r * 0.3, r * 0.2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }
      break;
    case 'tome':
      roundRectPath(ctx, -15, -16, 30, 32, 4);
      paint(ctx, '#FF9F5A', 2.4, '#A8501E');
      roundRectPath(ctx, -11, -12, 22, 24, 2);
      ctx.strokeStyle = '#FFE07A';
      ctx.lineWidth = 2;
      ctx.stroke();
      sparklePath(ctx, 0, 0, 7, 0);
      ctx.fillStyle = '#FFE07A';
      ctx.fill();
      break;
    case 'bow':
      ctx.beginPath();
      ctx.arc(-8, 0, 20, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#9FD8FF';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8 + Math.cos(-Math.PI * 0.42) * 20, Math.sin(-Math.PI * 0.42) * 20);
      ctx.lineTo(-8 + Math.cos(Math.PI * 0.42) * 20, Math.sin(Math.PI * 0.42) * 20);
      ctx.strokeStyle = '#E8F6FF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(16, 0);
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(13, -5);
      ctx.lineTo(13, 5);
      ctx.closePath();
      paint(ctx, '#FFFFFF', 1.8, palette.outline);
      break;
    case 'scythe':
      ctx.beginPath();
      ctx.moveTo(-10, 20);
      ctx.lineTo(6, -16);
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#7A5A3A';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(6, -16);
      ctx.quadraticCurveTo(-14, -26, -22, -8);
      ctx.quadraticCurveTo(-10, -16, 4, -10);
      ctx.closePath();
      paint(ctx, '#D9CCFF', 2.4, '#6F55C9');
      break;
    case 'spear':
      ctx.beginPath();
      ctx.moveTo(-16, 18);
      ctx.lineTo(10, -8);
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#B8935A';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(18, -16);
      ctx.lineTo(6, -10);
      ctx.lineTo(10, -4);
      ctx.closePath();
      paint(ctx, '#F4F0E6', 2.2, palette.outline);
      ctx.beginPath();
      ctx.moveTo(4, -4);
      ctx.lineTo(8, 0);
      ctx.strokeStyle = palette.danger;
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    case 'frost':
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(9, -4);
      ctx.lineTo(5, 18);
      ctx.lineTo(-5, 18);
      ctx.lineTo(-9, -4);
      ctx.closePath();
      paint(ctx, '#E6F8FF', 2.4, '#3C8DB8');
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(0, 14);
      ctx.strokeStyle = 'rgba(60, 141, 184, 0.5)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      sparklePath(ctx, 10, -12, 5, 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      break;
    case 'flask':
      ctx.beginPath();
      ctx.moveTo(-5, -16);
      ctx.lineTo(-5, -6);
      ctx.quadraticCurveTo(-16, 0, -14, 10);
      ctx.quadraticCurveTo(-12, 18, 0, 18);
      ctx.quadraticCurveTo(12, 18, 14, 10);
      ctx.quadraticCurveTo(16, 0, 5, -6);
      ctx.lineTo(5, -16);
      ctx.closePath();
      paint(ctx, '#B6F25A', 2.4, '#3E6E28');
      ctx.beginPath();
      ctx.rect(-6, -20, 12, 6);
      paint(ctx, '#C9B08A', 2, '#7A5A3A');
      circle(ctx, -4, 8, 3);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();
      break;
    case 'spirit':
      for (const [sx, sy, r] of [
        [-8, 4, 10],
        [10, -8, 7],
      ]) {
        sparklePath(ctx, sx, sy, r, 0);
        paint(ctx, '#FFF3B0', 2, '#C9922E');
      }
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0.3, Math.PI * 1.4);
      ctx.strokeStyle = 'rgba(255, 207, 102, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Item icon: a soft round plate with the placeholder glyph on it. */
export function drawItemIcon(ctx: CanvasRenderingContext2D, glyph: string, x: number, y: number, size: number, tint: string): void {
  circle(ctx, x, y, size * 0.55);
  const g = ctx.createRadialGradient(x - size * 0.15, y - size * 0.2, 2, x, y, size * 0.55);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, lighten(tint, 0.55));
  paint(ctx, g, 2.4, darken(tint, 0.2));
  ctx.font = `${Math.round(size * 0.6)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.fillText(glyph, x, y + size * 0.04);
}

/** Healing candy: a wrapped sweet with stripes. */
export function drawCandy(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 9 * s, 0);
    ctx.lineTo(side * 18 * s, -7 * s);
    ctx.lineTo(side * 18 * s, 7 * s);
    ctx.closePath();
    paint(ctx, '#FFD6E6', 2, '#D9668F');
  }
  circle(ctx, 0, 0, 10 * s);
  paint(ctx, '#FF8FB8', 2, '#C2477F');
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.moveTo(-6 * s, -7 * s);
  ctx.lineTo(4 * s, 8 * s);
  ctx.moveTo(1 * s, -9 * s);
  ctx.lineTo(8 * s, 3 * s);
  ctx.stroke();
  ctx.restore();
}

/** Treasure chest pickup. */
export function drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  roundRectPath(ctx, -18, -6, 36, 22, 4);
  paint(ctx, '#B48CFF', 2.4, '#5E4AA8');
  ctx.beginPath();
  ctx.moveTo(-18, -4);
  ctx.quadraticCurveTo(0, -24, 18, -4);
  ctx.closePath();
  paint(ctx, '#C9AEFF', 2.4, '#5E4AA8');
  roundRectPath(ctx, -20, -7, 40, 6, 3);
  paint(ctx, palette.gold, 1.8, '#9C7420');
  roundRectPath(ctx, -4, -4, 8, 10, 2);
  paint(ctx, palette.goldLight, 1.6, '#9C7420');
  ctx.restore();
}

export function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, locked: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  if (locked) ctx.arc(0, -6, 8, Math.PI, 0);
  else ctx.arc(-8, -8, 8, Math.PI, -0.2);
  ctx.strokeStyle = locked ? '#A8700E' : '#9A94B8';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  roundRectPath(ctx, -11, -6, 22, 18, 4);
  paint(ctx, locked ? '#FFD34D' : '#E8E4F2', 2.2, locked ? '#A8700E' : '#9A94B8');
  circle(ctx, 0, 2, 2.6);
  ctx.fillStyle = locked ? '#A8700E' : '#9A94B8';
  ctx.fill();
  ctx.restore();
}

/** Star shard currency icon. */
export function drawShardIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.72, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.72, y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x, y - size, x, y + size);
  g.addColorStop(0, '#E6F6FF');
  g.addColorStop(1, palette.shard);
  paint(ctx, g, 2, '#4F86C9');
  ctx.beginPath();
  ctx.moveTo(x - size * 0.2, y - size * 0.6);
  ctx.lineTo(x - size * 0.45, y - size * 0.05);
  ctx.lineTo(x - size * 0.1, y - size * 0.05);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();
}
