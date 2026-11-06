import { palette } from '../palette';

export const FONT = '"PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
/** Lineart width for characters and monsters, in design units. Thin, anime style. */
export const LINE = 2.6;

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
}

/** Fill the current path, then draw its lineart. */
export function paint(
  ctx: CanvasRenderingContext2D,
  fill: string | CanvasGradient,
  lineWidth = LINE,
  line: string = palette.outline,
): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** Game text: bright fill over a soft colored stroke. */
export function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string = palette.text,
  align: CanvasTextAlign = 'center',
  stroke: string = palette.ink,
): void {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.2);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Four-point sparkle centered on (x, y). */
export function sparklePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.28;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.1, y + s * 0.2, x - s * 0.55, y - s * 0.05, x - s * 0.5, y - s * 0.3);
  ctx.bezierCurveTo(x - s * 0.45, y - s * 0.6, x - s * 0.05, y - s * 0.55, x, y - s * 0.28);
  ctx.bezierCurveTo(x + s * 0.05, y - s * 0.55, x + s * 0.45, y - s * 0.6, x + s * 0.5, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.55, y - s * 0.05, x + s * 0.1, y + s * 0.2, x, y + s * 0.35);
  ctx.closePath();
}

export function diamondPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
}

export function formatNumber(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 10000) return String(v);
  return `${(v / 10000).toFixed(v < 100000 ? 1 : 0)}万`;
}
