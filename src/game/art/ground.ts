import { Rng } from '../../engine/rng';
import type { Platform, Surface } from '../../platform/types';
import * as L from '../layout';
import { darken, lighten, palette } from '../palette';
import { sparklePath } from './draw';

/** Grass extends this far past the walkable arena on every side. */
export const ISLAND_PAD = 80;
/** Visible thickness of the island's soil under its bottom edge. */
const CLIFF = 74;

/** Screen backdrop for menus: soft lavender with arches and sparkles. */
export function bakeBackdrop(platform: Platform): Surface {
  const w = L.DESIGN_W;
  const h = L.DESIGN_H;
  const c = platform.createCanvas(w, h);
  const g = c.getContext('2d');
  if (!g) return c;
  const rng = new Rng(7);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, palette.bgTop);
  bg.addColorStop(1, palette.bgBottom);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(185, 168, 240, 0.35)';
  g.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const x = 90 + i * 180;
    g.beginPath();
    g.moveTo(x - 70, 200);
    g.lineTo(x - 70, 80);
    g.quadraticCurveTo(x - 70, 10, x, -10);
    g.quadraticCurveTo(x + 70, 10, x + 70, 80);
    g.lineTo(x + 70, 200);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    sparklePath(g, rng.range(0, w), rng.range(0, h), rng.range(3, 9), 0);
    g.fillStyle = `rgba(255, 255, 255, ${rng.range(0.4, 0.9)})`;
    g.fill();
  }
  return c;
}

export interface IslandSprite {
  surface: Surface;
  /** World position of the sprite's top-left corner. */
  x: number;
  y: number;
}

/**
 * The floating garden island, painted once. Walkable ground is the arena;
 * around it a strip of grass with bushes, then a wobbly edge, soil and roots.
 */
export function bakeIsland(platform: Platform): IslandSprite {
  const pad = ISLAND_PAD;
  const w = L.ARENA.w + pad * 2;
  const h = L.ARENA.h + pad * 2 + CLIFF + 60;
  const c = platform.createCanvas(w, h);
  const g = c.getContext('2d');
  const sprite = { surface: c, x: L.ARENA.x - pad, y: L.ARENA.y - pad };
  if (!g) return sprite;
  const rng = new Rng(20261106);
  const cx = pad + L.ARENA.w / 2;
  const cy = pad + L.ARENA.h / 2;
  const outline = islandOutline(cx, cy, L.ARENA.w / 2 + pad * 0.62, L.ARENA.h / 2 + pad * 0.62);
  const trace = (dy = 0): void => {
    g.beginPath();
    outline.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y + dy) : g.lineTo(x, y + dy)));
    g.closePath();
  };

  // Hanging roots and vines under the island.
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = rng.range(pad, w - pad);
    const top = cy + L.ARENA.h / 2 + pad * 0.4 + CLIFF;
    const len = rng.range(20, 60);
    g.strokeStyle = rng.chance(0.5) ? palette.soilLine : '#7DB88B';
    g.lineWidth = rng.range(2, 4);
    g.beginPath();
    g.moveTo(x, top);
    g.quadraticCurveTo(x + rng.range(-12, 12), top + len * 0.6, x + rng.range(-8, 8), top + len);
    g.stroke();
  }

  // Soil cliff: the outline shifted down, showing under the bottom edge.
  const soil = g.createLinearGradient(0, cy + L.ARENA.h / 2, 0, cy + L.ARENA.h / 2 + pad + CLIFF);
  soil.addColorStop(0, palette.soilTop);
  soil.addColorStop(1, palette.soilBottom);
  trace(CLIFF);
  g.fillStyle = soil;
  g.fill();
  g.strokeStyle = palette.soilLine;
  g.lineWidth = 3;
  g.stroke();
  g.save();
  trace(CLIFF);
  g.clip();
  g.strokeStyle = 'rgba(142, 108, 88, 0.35)';
  g.lineWidth = 3;
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    const y = cy + L.ARENA.h / 2 + pad * 0.5 + i * 20;
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.25)' : 'rgba(110, 80, 64, 0.25)';
    g.beginPath();
    g.ellipse(rng.range(0, w), cy + L.ARENA.h / 2 + pad * 0.5 + rng.range(0, CLIFF), rng.range(3, 8), rng.range(2, 5), 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // Grass top
  const grass = g.createLinearGradient(0, 0, 0, h);
  grass.addColorStop(0, palette.grassTop);
  grass.addColorStop(1, palette.grassBottom);
  trace();
  g.fillStyle = grass;
  g.fill();

  g.save();
  trace();
  g.clip();
  // Soft light and shade patches, like evening light through leaves.
  for (let i = 0; i < 60; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(80, 240);
    const light = rng.chance(0.45);
    const blob = g.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, light ? 'rgba(255, 240, 210, 0.13)' : 'rgba(40, 90, 70, 0.16)');
    blob.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = blob;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Landmarks, so different corners of the big island look different.
  const ax = pad;
  const ay = pad;
  const aw = L.ARENA.w;
  const ah = L.ARENA.h;
  drawPlaza(g, cx, cy, rng);
  drawPath(g, cx, cy + 200, cx - 160, ay + ah - 30, rng);
  drawPath(g, cx + 30, cy - 200, cx + 260, ay + 40, rng);
  drawPath(g, cx + 200, cy + 40, ax + aw - 40, cy + 220, rng);
  drawPath(g, cx - 200, cy - 40, ax + 40, cy - 260, rng);
  drawFlowerBed(g, ax + aw * 0.2, ay + ah * 0.16, '#FFC7DD', rng);
  drawFlowerBed(g, ax + aw * 0.82, ay + ah * 0.34, '#D9C8FF', rng);
  drawFlowerBed(g, ax + aw * 0.22, ay + ah * 0.7, '#FFE58A', rng);
  drawFlowerBed(g, ax + aw * 0.76, ay + ah * 0.86, '#FFFFFF', rng);
  drawRuins(g, ax + aw * 0.74, ay + ah * 0.12, rng);
  drawRuins(g, ax + aw * 0.16, ay + ah * 0.44, rng);
  drawRuins(g, ax + aw * 0.6, ay + ah * 0.66, rng);
  scatter(g, rng, w, h);
  g.restore();

  // Rim: bright lip, then lineart.
  trace();
  g.strokeStyle = palette.grassEdge;
  g.lineWidth = 12;
  g.stroke();
  g.strokeStyle = palette.grassLine;
  g.lineWidth = 3.5;
  g.stroke();

  // Flowering bushes in the strip between the walkable ground and the edge.
  drawRimBushes(g, rng, pad);
  return sprite;
}

/** Rounded-rectangle outline (a superellipse) with a gentle hand-drawn wobble. */
function islandOutline(cx: number, cy: number, a: number, b: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const n = 8;
  const steps = 360;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const wobble = 1 + 0.012 * Math.sin(t * 7 + 1) + 0.008 * Math.sin(t * 13 + 2) + 0.005 * Math.sin(t * 29);
    pts.push([cx + a * wobble * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + b * wobble * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
  }
  return pts;
}

/** A ring of flat stepping stones around a small flower bed: the courtyard's center. */
function drawPlaza(g: CanvasRenderingContext2D, cx: number, cy: number, rng: Rng): void {
  const ring = 170;
  for (let i = 0; i < 22; i++) {
    // Leave gaps so it reads as an old, half-overgrown ring.
    if (rng.chance(0.25)) continue;
    const a = (i / 22) * Math.PI * 2 + rng.range(-0.05, 0.05);
    const rr = ring + rng.range(-8, 8);
    stone(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85, rng.range(11, 16), rng);
  }
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 60);
    flower(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85, rng.range(0.8, 1.2), pick(rng, ['#FFFFFF', '#FFC7DD', '#D9C8FF', '#FFE58A']));
  }
}

function drawPath(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, rng: Rng): void {
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    if (rng.chance(0.2)) continue;
    const t = i / steps;
    const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI * 2) * 40;
    const y = y0 + (y1 - y0) * t;
    stone(g, x + rng.range(-10, 10), y, rng.range(10, 15), rng);
  }
}

/** A flat, irregular stepping stone half sunk into the grass. */
function stone(g: CanvasRenderingContext2D, x: number, y: number, r: number, rng: Rng): void {
  const pts: Array<[number, number]> = [];
  const n = 7;
  const rot = rng.range(0, Math.PI);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = r * rng.range(0.75, 1.05);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62]);
  }
  const shape = (dy: number): void => {
    g.beginPath();
    pts.forEach(([px, py], i) => {
      const [nx, ny] = pts[(i + 1) % n];
      const mx = (px + nx) / 2;
      const my = (py + ny) / 2 + dy;
      if (i === 0) g.moveTo(mx, my);
      g.quadraticCurveTo(nx, ny + dy, (nx + pts[(i + 2) % n][0]) / 2, (ny + pts[(i + 2) % n][1]) / 2 + dy);
    });
    g.closePath();
  };
  shape(3);
  g.fillStyle = 'rgba(80, 120, 90, 0.16)';
  g.fill();
  shape(0);
  const s = g.createLinearGradient(x, y - r, x, y + r);
  s.addColorStop(0, '#F6F1E7');
  s.addColorStop(1, '#E3DACB');
  g.fillStyle = s;
  g.fill();
  g.strokeStyle = 'rgba(150, 130, 110, 0.35)';
  g.lineWidth = 1.6;
  g.stroke();
  // Moss and a grass blade creeping over the edge keep it from looking pasted on.
  g.fillStyle = 'rgba(150, 200, 150, 0.45)';
  g.beginPath();
  g.ellipse(x - r * 0.4, y + r * 0.25, r * 0.35, r * 0.15, 0, 0, Math.PI * 2);
  g.fill();
}

/** A round bed of one flower color, rimmed with small stones. */
function drawFlowerBed(g: CanvasRenderingContext2D, x: number, y: number, petal: string, rng: Rng): void {
  const r = rng.range(70, 95);
  g.fillStyle = 'rgba(50, 100, 70, 0.28)';
  g.beginPath();
  g.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    stone(g, x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8) * 0.75, rng.range(8, 11), rng);
  }
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * (r - 10);
    const fx = x + Math.cos(a) * d;
    const fy = y + Math.sin(a) * d * 0.75;
    g.strokeStyle = '#4E8160';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(fx, fy + 6);
    g.lineTo(fx, fy);
    g.stroke();
    flower(g, fx, fy, rng.range(1, 1.4), petal);
  }
}

/** Old courtyard ruins lying flat: cracked floor tiles and a fallen column. */
function drawRuins(g: CanvasRenderingContext2D, x: number, y: number, rng: Rng): void {
  const tile = 46;
  for (let i = -2; i <= 2; i++) {
    for (let j = -1; j <= 1; j++) {
      if (rng.chance(0.3)) continue;
      const tx = x + i * (tile + 4) + rng.range(-3, 3);
      const ty = y + j * (tile * 0.7 + 4) + rng.range(-3, 3);
      g.beginPath();
      g.rect(tx - tile / 2, ty - tile * 0.35, tile, tile * 0.7);
      g.fillStyle = rng.chance(0.5) ? '#D9D0C2' : '#CFC5B5';
      g.fill();
      g.strokeStyle = 'rgba(110, 90, 80, 0.45)';
      g.lineWidth = 1.6;
      g.stroke();
      if (rng.chance(0.4)) {
        g.beginPath();
        g.moveTo(tx - tile * 0.3, ty - tile * 0.2);
        g.lineTo(tx, ty);
        g.lineTo(tx + tile * 0.2, ty + tile * 0.25);
        g.stroke();
      }
    }
  }
  // Fallen column
  g.save();
  g.translate(x + 70, y + 70);
  g.rotate(rng.range(-0.5, 0.5));
  g.fillStyle = 'rgba(40, 70, 50, 0.25)';
  g.beginPath();
  g.ellipse(4, 14, 92, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.rect(-86, -16, 172, 32);
  const col = g.createLinearGradient(0, -16, 0, 16);
  col.addColorStop(0, '#EFE8DC');
  col.addColorStop(1, '#C9BEAE');
  g.fillStyle = col;
  g.fill();
  g.strokeStyle = 'rgba(110, 90, 80, 0.55)';
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = 'rgba(110, 90, 80, 0.3)';
  for (let k = -60; k <= 60; k += 30) {
    g.beginPath();
    g.moveTo(k, -16);
    g.lineTo(k, 16);
    g.stroke();
  }
  g.fillStyle = 'rgba(120, 180, 120, 0.55)';
  g.beginPath();
  g.ellipse(-50, 10, 26, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Many small, low-contrast details: they give texture without hurting readability. */
function scatter(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number): void {
  // Keep the same density whatever the island size.
  const k = (w * h) / 2.4e6;
  const n = (base: number): number => Math.round(base * k);
  g.lineCap = 'round';
  for (let i = 0; i < n(320); i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const s = rng.range(0.7, 1.3);
    g.strokeStyle = rng.chance(0.7) ? palette.tuftDark : palette.tuftLight;
    g.lineWidth = 2.6 * s;
    for (let b = -1; b <= 1; b++) {
      g.beginPath();
      g.moveTo(x + b * 3.5 * s, y);
      g.quadraticCurveTo(x + b * 5 * s, y - 7 * s, x + b * 8 * s, y - (b === 0 ? 13 : 9) * s);
      g.stroke();
    }
  }
  // Clover patches
  for (let i = 0; i < n(40); i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI * 2 - Math.PI / 2;
      g.fillStyle = '#86BE8F';
      g.beginPath();
      g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < n(120); i++) {
    flower(g, rng.range(0, w), rng.range(0, h), rng.range(0.7, 1.1), pick(rng, ['#FFFFFF', '#FFFFFF', '#FFC7DD', '#D9C8FF', '#FFE58A']));
  }
  // Fallen petals
  for (let i = 0; i < n(90); i++) {
    g.save();
    g.translate(rng.range(0, w), rng.range(0, h));
    g.rotate(rng.range(0, Math.PI));
    g.fillStyle = pick(rng, ['rgba(255, 183, 210, 0.85)', 'rgba(255, 220, 235, 0.85)', 'rgba(217, 200, 255, 0.8)']);
    g.beginPath();
    g.ellipse(0, 0, 5, 2.6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // Pebbles
  for (let i = 0; i < n(46); i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(3, 7);
    g.fillStyle = '#C9C2B6';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.6)';
    g.beginPath();
    g.ellipse(x - r * 0.3, y - r * 0.25, r * 0.35, r * 0.2, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Star dust glints: the "stardust" in the courtyard's name.
  for (let i = 0; i < n(60); i++) {
    sparklePath(g, rng.range(0, w), rng.range(0, h), rng.range(2.5, 6), 0);
    g.fillStyle = `rgba(255, 255, 255, ${rng.range(0.55, 0.95)})`;
    g.fill();
  }
}

function drawRimBushes(g: CanvasRenderingContext2D, rng: Rng, pad: number): void {
  const left = pad - 36;
  const right = pad + L.ARENA.w + 36;
  const top = pad - 34;
  const bottom = pad + L.ARENA.h + 30;
  const spots: Array<[number, number]> = [];
  for (let x = left + 40; x < right - 40; x += rng.range(70, 120)) {
    spots.push([x, top]);
    spots.push([x + rng.range(-20, 20), bottom]);
  }
  for (let y = top + 80; y < bottom - 60; y += rng.range(90, 140)) {
    spots.push([left, y]);
    spots.push([right, y + rng.range(-20, 20)]);
  }
  // Draw top to bottom so lower bushes overlap upper ones.
  spots.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of spots) {
    if (rng.chance(0.25)) continue;
    bush(g, x, y, rng.range(0.8, 1.25), rng);
  }
}

function bush(g: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  const base = pick(rng, ['#8FD19C', '#9AD8A4', '#86C995']);
  const line = darken(base, 0.45);
  g.fillStyle = 'rgba(60, 110, 80, 0.2)';
  g.beginPath();
  g.ellipse(x, y + 16 * s, 38 * s, 12 * s, 0, 0, Math.PI * 2);
  g.fill();
  const lobes: Array<[number, number, number]> = [
    [-20, 2, 20],
    [20, 4, 19],
    [0, -10, 25],
  ];
  for (const [dx, dy, r] of lobes) {
    g.beginPath();
    g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    const grad = g.createLinearGradient(x, y + (dy - r) * s, x, y + (dy + r) * s);
    grad.addColorStop(0, lighten(base, 0.3));
    grad.addColorStop(1, base);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = line;
    g.lineWidth = 2.4;
    g.stroke();
  }
  g.fillStyle = 'rgba(255, 255, 255, 0.45)';
  g.beginPath();
  g.ellipse(x - 6 * s, y - 22 * s, 9 * s, 4 * s, -0.4, 0, Math.PI * 2);
  g.fill();
  const petal = pick(rng, ['#FFFFFF', '#FFB7D2', '#D9C8FF', '#FFE58A']);
  for (let i = 0; i < 4; i++) {
    flower(g, x + rng.range(-24, 24) * s, y + rng.range(-24, 6) * s, 0.9 * s, petal);
  }
}

function flower(g: CanvasRenderingContext2D, x: number, y: number, s: number, petal: string): void {
  g.fillStyle = petal;
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    g.beginPath();
    g.arc(x + Math.cos(a) * 3.6 * s, y + Math.sin(a) * 3.6 * s, 2.8 * s, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#FFCF4A';
  g.beginPath();
  g.arc(x, y, 2.2 * s, 0, Math.PI * 2);
  g.fill();
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[rng.int(0, list.length - 1)];
}

/** A puffy cloud sprite for the sky behind the island. */
export function bakeCloud(platform: Platform, seed: number): Surface {
  const w = 360;
  const h = 160;
  const c = platform.createCanvas(w, h);
  const g = c.getContext('2d');
  if (!g) return c;
  const rng = new Rng(seed);
  const puffs: Array<[number, number, number]> = [];
  for (let i = 0; i < 7; i++) puffs.push([rng.range(70, w - 70), rng.range(70, h - 40), rng.range(34, 62)]);
  for (const [x, y, r] of puffs) {
    g.fillStyle = 'rgba(214, 200, 245, 0.55)';
    g.beginPath();
    g.arc(x, y + 8, r, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, r] of puffs) {
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    grad.addColorStop(1, 'rgba(250, 245, 255, 0.9)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
