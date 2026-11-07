import { Rng } from '../../engine/rng';
import type { Platform, Surface } from '../../platform/types';
import type { ChapterTheme } from '../data/stages';
import * as L from '../layout';
import { lighten, palette } from '../palette';
import { sparklePath } from './draw';

/** Grass extends this far past the walkable arena on every side. */
export const ISLAND_PAD = 80;
/** Visible thickness of the island's soil under its bottom edge. */
const CLIFF = 74;
/** Chapter 2: grey-green marsh mud. */
const MARSH = { top: '#58624F', bottom: '#4A5345', tuft: '#3E4A34', tuftLight: '#7A845C' };
/** Faded flowers that survive in the ruined garden: muted, never candy-bright. */
const DIM_FLOWERS = ['#8E7BAA', '#6F6492', '#A8946E', '#7E5A6E'];

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
export function bakeIsland(platform: Platform, theme: ChapterTheme = 'garden'): IslandSprite {
  const marsh = theme === 'marsh';
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
    g.strokeStyle = rng.chance(0.5) ? palette.soilLine : '#3A3A2E';
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
  g.strokeStyle = 'rgba(8, 6, 4, 0.35)';
  g.lineWidth = 3;
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    const y = cy + L.ARENA.h / 2 + pad * 0.5 + i * 20;
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(120, 110, 100, 0.18)' : 'rgba(0, 0, 0, 0.25)';
    g.beginPath();
    g.ellipse(rng.range(0, w), cy + L.ARENA.h / 2 + pad * 0.5 + rng.range(0, CLIFF), rng.range(3, 8), rng.range(2, 5), 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // Grass top
  const grass = g.createLinearGradient(0, 0, 0, h);
  grass.addColorStop(0, marsh ? MARSH.top : palette.grassTop);
  grass.addColorStop(1, marsh ? MARSH.bottom : palette.grassBottom);
  trace();
  g.fillStyle = grass;
  g.fill();

  g.save();
  trace();
  g.clip();
  // Patches of darker dirt and paler worn ground, so the earth isn't flat.
  for (let i = 0; i < 60; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(80, 240);
    const light = rng.chance(0.45);
    const blob = g.createRadialGradient(x, y, 0, x, y, r);
    if (marsh) blob.addColorStop(0, light ? 'rgba(90, 130, 120, 0.16)' : 'rgba(10, 20, 18, 0.25)');
    else blob.addColorStop(0, light ? 'rgba(170, 160, 125, 0.12)' : 'rgba(25, 20, 15, 0.2)');
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
  const beds: Array<[number, number]> = [
    [0.2, 0.16],
    [0.82, 0.34],
    [0.22, 0.7],
    [0.76, 0.86],
  ];
  beds.forEach(([fx, fy], i) => {
    if (marsh) drawPool(g, ax + aw * fx, ay + ah * fy, rng);
    else drawFlowerBed(g, ax + aw * fx, ay + ah * fy, DIM_FLOWERS[[0, 3, 2, 1][i]], rng);
  });
  drawRuins(g, ax + aw * 0.74, ay + ah * 0.12, rng);
  drawRuins(g, ax + aw * 0.16, ay + ah * 0.44, rng);
  drawRuins(g, ax + aw * 0.6, ay + ah * 0.66, rng);
  scatter(g, rng, w, h, marsh);
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
  drawRimBushes(g, rng, pad, marsh);
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
    flower(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85, rng.range(0.8, 1.2), pick(rng, DIM_FLOWERS));
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
  g.fillStyle = 'rgba(15, 12, 10, 0.3)';
  g.fill();
  shape(0);
  const s = g.createLinearGradient(x, y - r, x, y + r);
  s.addColorStop(0, '#A29C8E');
  s.addColorStop(1, '#7C766A');
  g.fillStyle = s;
  g.fill();
  g.strokeStyle = '#2A2621';
  g.lineWidth = 2;
  g.stroke();
  // Moss creeping over the edge keeps it from looking pasted on.
  g.fillStyle = 'rgba(70, 82, 52, 0.55)';
  g.beginPath();
  g.ellipse(x - r * 0.4, y + r * 0.25, r * 0.35, r * 0.15, 0, 0, Math.PI * 2);
  g.fill();
}

/** An overgrown, withered flower bed: dark soil, dead stalks, a few faded blooms. */
function drawFlowerBed(g: CanvasRenderingContext2D, x: number, y: number, petal: string, rng: Rng): void {
  const r = rng.range(70, 95);
  g.fillStyle = 'rgba(30, 24, 18, 0.4)';
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
    g.strokeStyle = '#3B3A2A';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(fx, fy + 6);
    g.lineTo(fx + rng.range(-3, 3), fy - 4);
    g.stroke();
    if (rng.chance(0.3)) flower(g, fx, fy, rng.range(0.9, 1.2), petal);
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
      g.fillStyle = rng.chance(0.5) ? '#8E897E' : '#817C71';
      g.fill();
      g.strokeStyle = 'rgba(25, 22, 18, 0.75)';
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
  g.fillStyle = 'rgba(15, 12, 10, 0.35)';
  g.beginPath();
  g.ellipse(4, 14, 92, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.rect(-86, -16, 172, 32);
  const col = g.createLinearGradient(0, -16, 0, 16);
  col.addColorStop(0, '#A8A296');
  col.addColorStop(1, '#6E695F');
  g.fillStyle = col;
  g.fill();
  g.strokeStyle = '#221E1A';
  g.lineWidth = 2.5;
  g.stroke();
  g.strokeStyle = 'rgba(25, 22, 18, 0.45)';
  for (let k = -60; k <= 60; k += 30) {
    g.beginPath();
    g.moveTo(k, -16);
    g.lineTo(k, 16);
    g.stroke();
  }
  g.fillStyle = 'rgba(70, 82, 52, 0.6)';
  g.beginPath();
  g.ellipse(-50, 10, 26, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Many small, low-contrast details: they give texture without hurting readability. */
function scatter(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number, marsh: boolean): void {
  // Keep the same density whatever the island size.
  const k = (w * h) / 2.4e6;
  const n = (base: number): number => Math.round(base * k);
  g.lineCap = 'round';
  for (let i = 0; i < n(320); i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const s = rng.range(0.7, 1.3);
    if (marsh) g.strokeStyle = rng.chance(0.7) ? MARSH.tuft : MARSH.tuftLight;
    else g.strokeStyle = rng.chance(0.7) ? palette.tuftDark : palette.tuftLight;
    g.lineWidth = 2.6 * s;
    for (let b = -1; b <= 1; b++) {
      g.beginPath();
      g.moveTo(x + b * 3.5 * s, y);
      g.quadraticCurveTo(x + b * 5 * s, y - 7 * s, x + b * 8 * s, y - (b === 0 ? 13 : 9) * s);
      g.stroke();
    }
  }
  // Cracks in the dry ground
  for (let i = 0; i < n(70); i++) {
    let x = rng.range(0, w);
    let y = rng.range(0, h);
    g.strokeStyle = 'rgba(28, 24, 18, 0.55)';
    g.lineWidth = rng.range(1.4, 2.4);
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += rng.range(-14, 14);
      y += rng.range(-6, 6);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // A few faded flowers still hanging on
  for (let i = 0; i < n(40); i++) {
    flower(g, rng.range(0, w), rng.range(0, h), rng.range(0.7, 1), pick(rng, DIM_FLOWERS));
  }
  if (marsh) {
    // Small puddles and reed clumps instead of dead leaves
    for (let i = 0; i < n(26); i++) puddle(g, rng.range(0, w), rng.range(0, h), rng.range(10, 26));
    for (let i = 0; i < n(30); i++) reeds(g, rng.range(0, w), rng.range(0, h), rng.range(0.7, 1.1), rng);
  }
  // Dead leaves
  for (let i = 0; i < n(110); i++) {
    g.save();
    g.translate(rng.range(0, w), rng.range(0, h));
    g.rotate(rng.range(0, Math.PI));
    g.fillStyle = pick(rng, ['rgba(120, 92, 52, 0.7)', 'rgba(96, 74, 46, 0.7)', 'rgba(140, 118, 70, 0.6)']);
    g.beginPath();
    g.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // Pebbles with crisp dark outlines
  for (let i = 0; i < n(90); i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(3, 8);
    g.fillStyle = pick(rng, ['#8A857A', '#7A766C', '#95907F']);
    g.beginPath();
    g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2A2621';
    g.lineWidth = 1.6;
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.18)';
    g.beginPath();
    g.ellipse(x - r * 0.3, y - r * 0.25, r * 0.35, r * 0.2, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Faint star dust glints: the "stardust" in the courtyard's name.
  for (let i = 0; i < n(30); i++) {
    sparklePath(g, rng.range(0, w), rng.range(0, h), rng.range(2, 4.5), 0);
    g.fillStyle = `rgba(190, 210, 255, ${rng.range(0.25, 0.5)})`;
    g.fill();
  }
}

function drawRimBushes(g: CanvasRenderingContext2D, rng: Rng, pad: number, marsh: boolean): void {
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
    if (marsh) reeds(g, x, y + 10, rng.range(1.2, 1.7), rng);
    else bush(g, x, y, rng.range(0.8, 1.25), rng);
  }
}

/** A still, dark pool of marsh water with a pale reflection, ringed by reeds. */
function drawPool(g: CanvasRenderingContext2D, x: number, y: number, rng: Rng): void {
  const r = rng.range(75, 100);
  g.fillStyle = 'rgba(10, 18, 16, 0.35)';
  g.beginPath();
  g.ellipse(x, y + 6, r + 6, (r + 6) * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  const water = g.createLinearGradient(x, y - r, x, y + r);
  water.addColorStop(0, '#2E4A48');
  water.addColorStop(1, '#1C302F');
  g.fillStyle = water;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#141C18';
  g.lineWidth = 3;
  g.stroke();
  g.strokeStyle = 'rgba(170, 220, 210, 0.25)';
  g.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.ellipse(x + rng.range(-r * 0.4, r * 0.4), y + rng.range(-r * 0.2, r * 0.2), rng.range(14, 30), rng.range(3, 6), 0, 0, Math.PI * 2);
    g.stroke();
  }
  // A couple of lily pads
  for (let i = 0; i < 3; i++) {
    const lx = x + rng.range(-r * 0.6, r * 0.6);
    const ly = y + rng.range(-r * 0.3, r * 0.3);
    g.fillStyle = '#3E5A36';
    g.beginPath();
    g.ellipse(lx, ly, 9, 5, 0, 0.3, Math.PI * 2);
    g.lineTo(lx, ly);
    g.closePath();
    g.fill();
    g.strokeStyle = '#15130F';
    g.lineWidth = 1.5;
    g.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = rng.range(0, Math.PI * 2);
    reeds(g, x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4) * 0.6, rng.range(0.8, 1.2), rng);
  }
}

/** A small muddy puddle. */
function puddle(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = 'rgba(28, 46, 44, 0.75)';
  g.beginPath();
  g.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(160, 210, 200, 0.22)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(x - r * 0.2, y - r * 0.1, r * 0.4, r * 0.12, 0, 0, Math.PI * 2);
  g.stroke();
}

/** A clump of tall reeds, some with dark seed heads. */
function reeds(g: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const bx = x + rng.range(-8, 8) * s;
    const lean = rng.range(-8, 8) * s;
    const len = rng.range(18, 34) * s;
    g.strokeStyle = '#15130F';
    g.lineWidth = 4 * s;
    g.beginPath();
    g.moveTo(bx, y);
    g.quadraticCurveTo(bx + lean * 0.3, y - len * 0.6, bx + lean, y - len);
    g.stroke();
    g.strokeStyle = rng.chance(0.5) ? '#6E7A4A' : '#58663E';
    g.lineWidth = 2 * s;
    g.stroke();
    if (rng.chance(0.35)) {
      g.fillStyle = '#4A3424';
      g.beginPath();
      g.ellipse(bx + lean, y - len, 2.6 * s, 6 * s, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** A dark, thorny shrub along the island's edge. */
function bush(g: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  const base = pick(rng, ['#3F4A36', '#465140', '#3A4332']);
  const line = '#15130F';
  g.fillStyle = 'rgba(10, 8, 6, 0.3)';
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
    grad.addColorStop(0, lighten(base, 0.18));
    grad.addColorStop(1, base);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = line;
    g.lineWidth = 3;
    g.stroke();
  }
  // Thorns poking out
  g.strokeStyle = '#1C1A14';
  g.lineWidth = 2.2;
  for (let i = 0; i < 7; i++) {
    const a = rng.range(Math.PI * 1.05, Math.PI * 1.95);
    const r0 = 18 * s;
    const bx = x + Math.cos(a) * r0;
    const by = y - 6 * s + Math.sin(a) * r0;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a) * 12 * s, by + Math.sin(a) * 12 * s);
    g.stroke();
  }
  if (rng.chance(0.4)) {
    // A few dark red berries
    for (let i = 0; i < 3; i++) {
      g.fillStyle = '#7A2A34';
      g.beginPath();
      g.arc(x + rng.range(-20, 20) * s, y + rng.range(-20, 4) * s, 3 * s, 0, Math.PI * 2);
      g.fill();
    }
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

/** A drifting bank of dark mist for the void around the island. */
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
    g.fillStyle = 'rgba(40, 32, 56, 0.45)';
    g.beginPath();
    g.arc(x, y + 8, r, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, r] of puffs) {
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r);
    grad.addColorStop(0, 'rgba(96, 84, 120, 0.55)');
    grad.addColorStop(1, 'rgba(60, 50, 80, 0.4)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
