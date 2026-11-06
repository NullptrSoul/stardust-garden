import type { EnemyLook } from '../data/enemies';
import { darken, lighten, palette } from '../palette';
import { circle, ellipse, LINE, paint, sparklePath } from './draw';

export interface MonsterPose {
  look: EnemyLook;
  color: string;
  /** Ground position (collision center). */
  x: number;
  y: number;
  r: number;
  facing: number;
  flash: number;
  pulse: number;
  /** 0 → 1 while popping out of the ground. */
  appear: number;
  time: number;
  seed: number;
  /** Where the eyes look (the player). */
  lookX: number;
  lookY: number;
  /** Winding up an attack: shakes and shows a "!" bubble. */
  alert: boolean;
  /** 0 normal, 1 elite, 2 boss: adds a dark aura, angry brows and glowing red eyes. */
  menace: number;
  /** Height above the ground (boss jumps). */
  lift: number;
}

interface Face {
  lookX: number;
  lookY: number;
  blink: boolean;
  hurt: boolean;
  menace: number;
}

/** All monsters are drawn at this collision radius, then scaled. */
const BASE_R = 26;

export function drawMonster(ctx: CanvasRenderingContext2D, m: MonsterPose): void {
  const pop = easeOutBack(m.appear);
  const s = (m.r / BASE_R) * Math.max(0.05, pop);
  const bob = Math.sin(m.time * 4 + m.seed * 1.7);
  const sx = 1 + bob * 0.035 + m.pulse * 0.16;
  const sy = 1 - bob * 0.035 - m.pulse * 0.12;
  const feetY = m.y + m.r * 0.5;

  const liftK = Math.max(0.4, 1 - m.lift / 400);
  ctx.fillStyle = `rgba(40, 30, 80, ${m.lift > 0 ? 0.35 : 0.22})`;
  ellipse(ctx, m.x, feetY + 2, m.r * 1.05 * Math.max(0.3, pop) * liftK, m.r * 0.3 * liftK);
  ctx.fill();
  if (m.menace > 0) drawAura(ctx, m, feetY, pop);

  let lx = (m.lookX - m.x) * m.facing;
  let ly = m.lookY - (m.y - m.r);
  const len = Math.hypot(lx, ly) || 1;
  lx /= len;
  ly /= len;
  const face: Face = {
    lookX: lx,
    lookY: ly,
    blink: m.menace === 0 && (m.time * 0.3 + m.seed * 0.618) % 1 < 0.035,
    hurt: m.flash > 0.35,
    menace: m.menace,
  };

  ctx.save();
  const shake = m.alert ? Math.sin(m.time * 70) * 2.5 : 0;
  ctx.translate(m.x + shake, feetY - m.lift);
  ctx.scale(m.facing * s * sx, s * sy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (m.look) {
    case 'slime':
      drawSlime(ctx, m, face);
      break;
    case 'bunny':
      drawBunny(ctx, m, face);
      break;
    case 'twin':
      drawTwin(ctx, m, face);
      break;
    case 'cat':
      drawCat(ctx, m, face);
      break;
    case 'bud':
      drawBud(ctx, m, face);
      break;
    case 'imp':
      drawImp(ctx, m, face);
      break;
    case 'mushroom':
      drawMushroom(ctx, m, face);
      break;
    case 'knight':
      drawKnight(ctx, m, face);
      break;
    case 'king':
      drawKing(ctx, m, face);
      break;
    case 'darkKnight':
      drawDarkKnight(ctx, m, face);
      break;
    case 'queen':
      drawQueen(ctx, m, face);
      break;
  }
  ctx.restore();
  if (m.alert) {
    const bx = m.x + m.r * 0.9;
    const by = feetY - m.r * 2.4 - m.lift;
    circle(ctx, bx, by, 13);
    paint(ctx, '#FFFFFF', 2.5, palette.danger);
    ctx.fillStyle = palette.danger;
    ctx.font = '900 19px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', bx, by + 1);
  }
}

/** Dark swirling aura and rising wisps under elites and bosses. */
function drawAura(ctx: CanvasRenderingContext2D, m: MonsterPose, feetY: number, pop: number): void {
  const r = m.r * (m.menace >= 2 ? 1.9 : 1.6) * pop;
  const pulse = 0.85 + 0.15 * Math.sin(m.time * 4 + m.seed);
  const g = ctx.createRadialGradient(m.x, feetY, r * 0.2, m.x, feetY, r * pulse);
  g.addColorStop(0, 'rgba(58, 31, 92, 0.55)');
  g.addColorStop(0.6, 'rgba(120, 30, 90, 0.25)');
  g.addColorStop(1, 'rgba(58, 31, 92, 0)');
  ctx.fillStyle = g;
  ellipse(ctx, m.x, feetY, r * pulse, r * 0.45 * pulse);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 59, 107, ${0.35 + 0.25 * Math.sin(m.time * 6 + m.seed)})`;
  ctx.lineWidth = 2.5;
  ellipse(ctx, m.x, feetY, r * 0.8, r * 0.3);
  ctx.stroke();
  // Wisps drifting up
  for (let i = 0; i < (m.menace >= 2 ? 6 : 3); i++) {
    const k = (m.time * 0.6 + i / 3 + m.seed * 0.13) % 1;
    const wx = m.x + Math.sin(i * 2.3 + m.time * 1.5) * m.r * 0.9;
    const wy = feetY - k * m.r * 2.6 - m.lift;
    circle(ctx, wx, wy, (1 - k) * m.r * 0.18 + 2);
    ctx.fillStyle = `rgba(70, 30, 100, ${(1 - k) * 0.45})`;
    ctx.fill();
  }
}

/** Boss: a dark knight in black armor with a glowing visor, a cape and a greatsword. */
function drawDarkKnight(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const line = '#160F2A';
  const sway = Math.sin(m.time * 2.5) * 3;
  // Cape
  ctx.beginPath();
  ctx.moveTo(-22, -48);
  ctx.quadraticCurveTo(-40, -20, -36 + sway, 4);
  ctx.lineTo(-24 + sway, 0);
  ctx.lineTo(-14 + sway, 6);
  ctx.lineTo(-4 + sway, 0);
  ctx.lineTo(24, -48);
  ctx.closePath();
  paint(ctx, '#7A1F3D', LINE, '#3A0A1C');
  // Greatsword on the side it faces
  ctx.save();
  ctx.translate(30, -24);
  ctx.rotate(-0.35 + (face.hurt ? 0.2 : 0));
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(-5, -62);
  ctx.lineTo(0, -72);
  ctx.lineTo(5, -62);
  ctx.lineTo(4, 0);
  ctx.closePath();
  const blade = ctx.createLinearGradient(-5, 0, 5, 0);
  blade.addColorStop(0, '#E9E4FF');
  blade.addColorStop(1, '#9C8CD6');
  paint(ctx, blade, 2.2, line);
  ctx.strokeStyle = 'rgba(180, 140, 255, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, -64);
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(-12, -2, 24, 5);
  paint(ctx, '#6E5FA8', 2, line);
  ctx.beginPath();
  ctx.rect(-2.5, 3, 5, 12);
  paint(ctx, '#3B3560', 2, line);
  ctx.restore();
  // Armored body
  const w = 58;
  const h = 56;
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -4);
    ctx.bezierCurveTo(-w / 2, -h * 0.75, -w * 0.3, -h, 0, -h);
    ctx.bezierCurveTo(w * 0.3, -h, w / 2, -h * 0.75, w / 2, -4);
    ctx.quadraticCurveTo(w / 2, 1, w * 0.36, 1);
    ctx.lineTo(-w * 0.36, 1);
    ctx.quadraticCurveTo(-w / 2, 1, -w / 2, -4);
    ctx.closePath();
  };
  body();
  const metal = ctx.createLinearGradient(0, -h, 0, 0);
  metal.addColorStop(0, '#5A5290');
  metal.addColorStop(1, m.color);
  ctx.fillStyle = metal;
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.18, -h * 0.7, w * 0.12, h * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Belt and runes
  ctx.fillStyle = '#2A2440';
  ctx.fillRect(-w / 2, -h * 0.3, w, 6);
  ctx.fillStyle = '#B48CFF';
  ctx.fillRect(-3, -h * 0.3, 6, 6);
  if (m.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${m.flash * 0.8})`;
    ctx.fillRect(-w, -h * 1.5, w * 2, h * 2);
  }
  ctx.restore();
  body();
  ctx.strokeStyle = line;
  ctx.lineWidth = LINE;
  ctx.stroke();
  // Pauldrons
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 24, -h * 0.62, 12, 9, side * 0.4, 0, Math.PI * 2);
    paint(ctx, '#4A4370', 2.4, line);
  }
  // Helmet horns
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 10, -h + 4);
    ctx.quadraticCurveTo(side * 28, -h - 6, side * 24, -h - 26);
    ctx.quadraticCurveTo(side * 20, -h - 10, side * 4, -h + 8);
    ctx.closePath();
    paint(ctx, '#2A2440', 2.2, line);
  }
  // Visor slit with glowing eyes
  ctx.beginPath();
  ctx.moveTo(-20, -h * 0.58);
  ctx.quadraticCurveTo(0, -h * 0.66, 20, -h * 0.58);
  ctx.lineTo(18, -h * 0.5);
  ctx.quadraticCurveTo(0, -h * 0.56, -18, -h * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#0E0A1C';
  ctx.fill();
  const glow = face.hurt ? 0.5 : 0.8 + 0.2 * Math.sin(m.time * 8);
  for (const side of [-1, 1]) {
    const g = ctx.createRadialGradient(side * 9, -h * 0.55, 0, side * 9, -h * 0.55, 12);
    g.addColorStop(0, `rgba(255, 80, 110, ${glow})`);
    g.addColorStop(1, 'rgba(255, 59, 107, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(side * 9 - 12, -h * 0.55 - 12, 24, 24);
    ctx.beginPath();
    ctx.moveTo(side * 4, -h * 0.56);
    ctx.lineTo(side * 14, -h * 0.58);
    ctx.strokeStyle = '#FFD0DE';
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }
}

// ---- New monster types ----

/** Charger: a round bunny with a little horn; dashes when it winds up. */
function drawBunny(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 50;
  const h = 44;
  const line = '#C98FA8';
  const flop = Math.sin(m.time * 6 + m.seed) * 0.12;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 9, -h + 6);
    ctx.rotate(side * 0.18 + flop * side);
    ctx.beginPath();
    ctx.ellipse(0, -16, 7.5, 18, 0, 0, Math.PI * 2);
    paint(ctx, m.color, LINE, line);
    ctx.beginPath();
    ctx.ellipse(0, -15, 3.5, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFC2D6';
    ctx.fill();
    ctx.restore();
  }
  const body = (): void => {
    ctx.beginPath();
    ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  };
  jelly(ctx, body, w, h, m.color, line, m.flash);
  // Little golden horn
  ctx.beginPath();
  ctx.moveTo(-4, -h + 4);
  ctx.lineTo(0, -h - 10);
  ctx.lineTo(4, -h + 4);
  ctx.closePath();
  paint(ctx, palette.goldLight, 2, palette.gold);
  animeEyes(ctx, -h * 0.52, 10, 6, 7.5, '#E0466E', line, face);
  blush(ctx, -h * 0.3, 15);
  mouth(ctx, -h * 0.24, face.hurt ? 'open' : 'cat', line);
  // Fluffy tail
  circle(ctx, -w / 2 + 2, -h * 0.3, 7);
  paint(ctx, '#FFFFFF', 2, line);
}

/** Splitter: a big two-tone slime; splits into two minis when it dies. */
function drawTwin(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 64;
  const h = 54;
  const line = darken(palette.twinA, 0.5);
  const path = slimePath(ctx, w, h);
  jelly(ctx, path, w, h, palette.twinA, line, m.flash);
  ctx.save();
  path();
  ctx.clip();
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, lighten(palette.twinB, 0.45));
  g.addColorStop(1, palette.twinB);
  ctx.fillStyle = g;
  ctx.fillRect(0, -h - 2, w, h + 4);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.ellipse(w * 0.2, -h * 0.72, w * 0.1, h * 0.06, -0.6, 0, Math.PI * 2);
  ctx.fill();
  if (m.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${m.flash * 0.8})`;
    ctx.fillRect(0, -h - 2, w, h + 4);
  }
  ctx.restore();
  // The seam where it will split
  ctx.beginPath();
  ctx.moveTo(0, -h + 2);
  ctx.quadraticCurveTo(-4, -h * 0.5, 0, 0);
  ctx.strokeStyle = 'rgba(75, 63, 114, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  path();
  ctx.strokeStyle = line;
  ctx.lineWidth = LINE;
  ctx.stroke();
  leaf(ctx, -12, -h + 6, line);
  bow(ctx, 14, -h + 8, palette.danger);
  animeEyes(ctx, -h * 0.5, 13, 7.5, 9, '#7A4FD6', line, face);
  blush(ctx, -h * 0.28, 20);
  mouth(ctx, -h * 0.2, face.hurt ? 'open' : 'cat', line);
}

/** Looter: a masked cat carrying a sack of stardust; runs away. */
function drawCat(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 50;
  const h = 46;
  const line = darken(m.color, 0.55);
  // Sack on its back
  ctx.save();
  ctx.translate(-20, -h * 0.55);
  ctx.rotate(-0.3);
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 17, 0, 0, Math.PI * 2);
  paint(ctx, '#F1DDB8', LINE, '#A88458');
  sparklePath(ctx, 0, 2, 7, 0);
  paint(ctx, palette.shard, 1.6, '#4F86C9');
  ctx.restore();
  // Tail
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.quadraticCurveTo(-34, -14 + Math.sin(m.time * 8) * 6, -30, -32);
  ctx.strokeStyle = line;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = m.color;
  ctx.lineWidth = 5;
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 6, -h + 6);
    ctx.lineTo(side * 18, -h - 12);
    ctx.lineTo(side * 22, -h + 10);
    ctx.closePath();
    paint(ctx, m.color, LINE, line);
  }
  const body = (): void => {
    ctx.beginPath();
    ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  };
  jelly(ctx, body, w, h, m.color, line, m.flash);
  // Bandit mask
  ctx.beginPath();
  ctx.moveTo(-22, -h * 0.58);
  ctx.quadraticCurveTo(0, -h * 0.72, 22, -h * 0.58);
  ctx.lineTo(22, -h * 0.4);
  ctx.quadraticCurveTo(0, -h * 0.5, -22, -h * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#4B3F72';
  ctx.fill();
  animeEyes(ctx, -h * 0.5, 10, 5.5, 6.5, '#F2C65E', line, face);
  blush(ctx, -h * 0.26, 15);
  mouth(ctx, -h * 0.2, face.hurt ? 'open' : 'fang', line);
}

/** Neutral bud: a glowing flower bud; breaking it drops a healing candy. */
function drawBud(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const sway = Math.sin(m.time * 2 + m.seed) * 0.08;
  // Leaves
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(side * 26, -12, side * 30, -2);
    ctx.quadraticCurveTo(side * 16, 2, 0, -4);
    ctx.closePath();
    paint(ctx, palette.leaf, 2.2, '#3F8F5A');
  }
  ctx.save();
  ctx.rotate(sway);
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, -18);
  ctx.strokeStyle = '#3F8F5A';
  ctx.lineWidth = 4;
  ctx.stroke();
  // Glow behind the bud
  const glow = ctx.createRadialGradient(0, -36, 2, 0, -36, 30);
  glow.addColorStop(0, 'rgba(255, 240, 200, 0.7)');
  glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-30, -66, 60, 60);
  const bud = (): void => {
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.bezierCurveTo(-20, -20, -18, -48, 0, -58);
    ctx.bezierCurveTo(18, -48, 20, -20, 0, -16);
    ctx.closePath();
  };
  jelly(ctx, bud, 36, 42, m.color, darken(m.color, 0.45), m.flash);
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.quadraticCurveTo(-6, -36, 0, -54);
  ctx.strokeStyle = 'rgba(176, 48, 92, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Sleepy face
  if (face.hurt) {
    animeEyes(ctx, -34, 6, 3.5, 4, '#B0305C', darken(m.color, 0.45), face);
  } else {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 6 - 3.5, -34);
      ctx.quadraticCurveTo(side * 6, -31, side * 6 + 3.5, -34);
      ctx.strokeStyle = darken(m.color, 0.5);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---- Monster types ----

function slimePath(ctx: CanvasRenderingContext2D, w: number, h: number): () => void {
  return () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -5);
    ctx.bezierCurveTo(-w / 2, -h * 0.8, -w * 0.28, -h, 0, -h);
    ctx.bezierCurveTo(w * 0.28, -h, w / 2, -h * 0.8, w / 2, -5);
    ctx.quadraticCurveTo(w / 2, 1, w * 0.36, 1);
    ctx.lineTo(-w * 0.36, 1);
    ctx.quadraticCurveTo(-w / 2, 1, -w / 2, -5);
    ctx.closePath();
  };
}

function drawSlime(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 62;
  const h = 52;
  const line = darken(m.color, 0.5);
  const variant = m.seed % 3;
  jelly(ctx, slimePath(ctx, w, h), w, h, m.color, line, m.flash);
  if (variant === 0) leaf(ctx, 2, -h + 1, line);
  else if (variant === 1) bow(ctx, 14, -h + 6, palette.danger);
  else droplet(ctx, -2, -h + 1, m.color, line);
  animeEyes(ctx, -h * 0.5, 12, 7.5, 9, darken(m.color, 0.35), line, face);
  blush(ctx, -h * 0.28, 19);
  mouth(ctx, -h * 0.22, face.hurt ? 'open' : 'cat', line);
}

function drawImp(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 54;
  const h = 48;
  const line = darken(m.color, 0.5);
  const flap = Math.sin(m.time * 18 + m.seed) * 0.35;
  // Wings behind
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 20, -h * 0.6);
    ctx.rotate(side * (0.3 + flap));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 26, -22, side * 30, -4);
    ctx.quadraticCurveTo(side * 22, -6, side * 20, 4);
    ctx.quadraticCurveTo(side * 12, 0, 0, 6);
    ctx.closePath();
    paint(ctx, lighten(palette.impHorn, 0.35), LINE, darken(palette.impHorn, 0.4));
    ctx.restore();
  }
  // Tail
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.quadraticCurveTo(-38, -4, -36, -22);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-36, -30);
  ctx.lineTo(-41, -20);
  ctx.lineTo(-31, -21);
  ctx.closePath();
  paint(ctx, palette.impHorn, 2, line);

  jelly(ctx, slimePath(ctx, w, h), w, h, m.color, line, m.flash);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 9, -h + 4);
    ctx.quadraticCurveTo(side * 16, -h - 14, side * 22, -h - 12);
    ctx.quadraticCurveTo(side * 20, -h - 2, side * 18, -h + 8);
    ctx.closePath();
    paint(ctx, palette.impHorn, 2.2, darken(palette.impHorn, 0.4));
  }
  animeEyes(ctx, -h * 0.5, 11, 6.5, 8, '#E0466E', line, face);
  if (!face.hurt && !face.blink) {
    // Smug half-lids
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 11 - 7, -h * 0.5 - 3);
      ctx.lineTo(side * 11 + 7, -h * 0.5 - 3 + side * 2);
      ctx.strokeStyle = line;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  blush(ctx, -h * 0.28, 17);
  mouth(ctx, -h * 0.2, face.hurt ? 'open' : 'fang', line);
}

function drawMushroom(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const stemLine = '#C9A08A';
  const capLine = darken(m.color, 0.5);
  // Stem (the face lives here)
  const stem = (): void => {
    ctx.beginPath();
    ctx.moveTo(-20, -34);
    ctx.quadraticCurveTo(-24, -8, -18, 0);
    ctx.lineTo(18, 0);
    ctx.quadraticCurveTo(24, -8, 20, -34);
    ctx.closePath();
  };
  jelly(ctx, stem, 44, 34, palette.mushroomStem, stemLine, m.flash);
  // Cap
  const cap = (): void => {
    ctx.beginPath();
    ctx.moveTo(-34, -30);
    ctx.bezierCurveTo(-36, -66, 36, -66, 34, -30);
    ctx.quadraticCurveTo(0, -22, -34, -30);
    ctx.closePath();
  };
  jelly(ctx, cap, 68, 40, m.color, capLine, m.flash);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  for (const [dx, dy, r] of [
    [-18, -44, 5],
    [4, -52, 6],
    [20, -40, 4.5],
    [-4, -38, 3.5],
  ]) {
    circle(ctx, dx, dy, r);
    ctx.fill();
  }
  animeEyes(ctx, -19, 9, 5.5, 7, '#8C5A3C', stemLine, face);
  blush(ctx, -10, 14);
  mouth(ctx, -7, 'open', stemLine);
}

function drawKnight(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 64;
  const h = 56;
  const line = darken(m.color, 0.5);
  jelly(ctx, slimePath(ctx, w, h), w, h, m.color, line, m.flash);
  // Helmet with a plume
  ctx.beginPath();
  ctx.moveTo(-26, -h * 0.62);
  ctx.bezierCurveTo(-28, -h - 10, 28, -h - 10, 26, -h * 0.62);
  ctx.quadraticCurveTo(0, -h * 0.7, -26, -h * 0.62);
  ctx.closePath();
  const steel = ctx.createLinearGradient(0, -h - 8, 0, -h * 0.6);
  steel.addColorStop(0, '#FFFFFF');
  steel.addColorStop(1, '#C7CCE6');
  paint(ctx, steel, LINE, '#7A80A8');
  ctx.beginPath();
  ctx.moveTo(0, -h - 6);
  ctx.quadraticCurveTo(-4, -h - 26, -18, -h - 22);
  ctx.quadraticCurveTo(-8, -h - 14, 0, -h - 6);
  ctx.closePath();
  paint(ctx, palette.slimePink, 2.2, darken(palette.slimePink, 0.45));
  animeEyes(ctx, -h * 0.45, 11, 6.5, 7.5, '#3A5BC8', line, face);
  blush(ctx, -h * 0.24, 17);
  mouth(ctx, -h * 0.18, face.hurt ? 'open' : 'cat', line);
  // Round shield on the side it faces
  ctx.save();
  ctx.translate(26, -22);
  circle(ctx, 0, 0, 17);
  const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 17);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, '#EDE7FF');
  paint(ctx, g, 3, palette.gold);
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 0);
  ctx.lineTo(0, 8);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  paint(ctx, '#B48CFF', 1.8, '#6F55C9');
  ctx.restore();
}

function drawKing(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 62;
  const h = 54;
  const line = darken(m.color, 0.5);
  jelly(ctx, slimePath(ctx, w, h), w, h, m.color, line, m.flash);
  crown(ctx, 0, -h + 2, 16, palette.crown);
  animeEyes(ctx, -h * 0.48, 12, 7.5, 9, darken(m.color, 0.4), line, face);
  // Proud little mustache
  if (!face.hurt) {
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.25);
    ctx.quadraticCurveTo(-8, -h * 0.2, -14, -h * 0.28);
    ctx.moveTo(0, -h * 0.25);
    ctx.quadraticCurveTo(8, -h * 0.2, 14, -h * 0.28);
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  blush(ctx, -h * 0.3, 20);
  mouth(ctx, -h * 0.16, face.hurt ? 'open' : 'cat', line);
}

function drawQueen(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 62;
  const h = 54;
  const line = darken(m.color, 0.5);
  // Dark bat wings
  const flap = Math.sin(m.time * 3) * 0.12;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 20, -h * 0.62);
    ctx.rotate(side * (0.25 + flap));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 22, -34, side * 44, -26);
    ctx.lineTo(side * 38, -12);
    ctx.lineTo(side * 46, -2);
    ctx.lineTo(side * 34, 4);
    ctx.lineTo(side * 36, 16);
    ctx.quadraticCurveTo(side * 16, 6, 0, 10);
    ctx.closePath();
    paint(ctx, '#2E1F4A', 2.4, '#140A26');
    ctx.beginPath();
    ctx.moveTo(side * 4, 2);
    ctx.quadraticCurveTo(side * 20, -20, side * 38, -18);
    ctx.strokeStyle = 'rgba(255, 90, 160, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  jelly(ctx, slimePath(ctx, w, h), w, h, m.color, line, m.flash);
  // Thorned crown with a heart gem
  ctx.beginPath();
  ctx.moveTo(-16, -h + 6);
  for (let i = 0; i <= 6; i++) {
    const x = -16 + (i * 32) / 6;
    ctx.lineTo(x, -h - (i % 2 === 0 ? 14 : 3));
  }
  ctx.lineTo(16, -h + 6);
  ctx.closePath();
  paint(ctx, '#8C6A1E', 2, '#3A2A08');
  ctx.save();
  ctx.translate(0, -h - 5);
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-7, -2, -4, -8, 0, -4);
  ctx.bezierCurveTo(4, -8, 7, -2, 0, 4);
  paint(ctx, palette.danger, 1.6, '#B0305C');
  ctx.restore();
  animeEyes(ctx, -h * 0.48, 12, 7.5, 9.5, '#7A4FD6', line, face);
  if (!face.hurt && !face.blink && face.menace === 0) {
    // Long lashes
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 18, -h * 0.48 - 8);
      ctx.lineTo(side * 23, -h * 0.48 - 13);
      ctx.strokeStyle = line;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
  }
  blush(ctx, -h * 0.28, 20);
  mouth(ctx, -h * 0.18, face.hurt ? 'open' : 'cat', line);
  // Orbiting sparkles
  for (let i = 0; i < 3; i++) {
    const a = m.time * 1.5 + (i * Math.PI * 2) / 3;
    sparklePath(ctx, Math.cos(a) * 42, -h * 0.5 + Math.sin(a) * 16, 4 + 2 * Math.sin(m.time * 4 + i), 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
}

// ---- Shared parts ----

/** Glossy jelly body: soft vertical gradient, inner glow, highlight, hit flash. */
function jelly(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  w: number,
  h: number,
  color: string,
  line: string,
  flash: number,
): void {
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, lighten(color, 0.45));
  g.addColorStop(0.6, color);
  g.addColorStop(1, darken(color, 0.1));
  path();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ellipse(ctx, 0, -h * 0.12, w * 0.32, h * 0.13);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.2, -h * 0.72, w * 0.15, h * 0.08, -0.6, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, -w * 0.05, -h * 0.84, 2.4);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.8})`;
    ctx.fillRect(-w, -h * 1.5, w * 2, h * 2);
  }
  ctx.restore();
  path();
  ctx.strokeStyle = line;
  ctx.lineWidth = LINE;
  ctx.stroke();
}

/** Big glossy anime eyes; ^ ^ when blinking, > < when hurt. */
function animeEyes(
  ctx: CanvasRenderingContext2D,
  y: number,
  gap: number,
  rx: number,
  ry: number,
  iris: string,
  line: string,
  face: Face,
): void {
  for (const side of [-1, 1]) {
    const ex = side * gap;
    ctx.strokeStyle = line;
    if (face.hurt) {
      ctx.beginPath();
      ctx.moveTo(ex - side * rx * 0.7, y - ry * 0.55);
      ctx.lineTo(ex + side * rx * 0.5, y);
      ctx.lineTo(ex - side * rx * 0.7, y + ry * 0.55);
      ctx.lineWidth = 2.6;
      ctx.stroke();
      continue;
    }
    if (face.blink) {
      ctx.beginPath();
      ctx.moveTo(ex - rx, y + ry * 0.2);
      ctx.quadraticCurveTo(ex, y - ry * 0.9, ex + rx, y + ry * 0.2);
      ctx.lineWidth = 2.6;
      ctx.stroke();
      continue;
    }
    const menacing = face.menace > 0;
    const eyeIris = menacing ? palette.menaceEye : iris;
    if (menacing) {
      // Red glow around the eye.
      const glow = ctx.createRadialGradient(ex, y, rx * 0.5, ex, y, rx * 2.2);
      glow.addColorStop(0, 'rgba(255, 59, 107, 0.55)');
      glow.addColorStop(1, 'rgba(255, 59, 107, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(ex - rx * 2.2, y - rx * 2.2, rx * 4.4, rx * 4.4);
    }
    ellipse(ctx, ex, y, rx, ry);
    ctx.fillStyle = menacing ? '#FFE8EE' : '#FFFFFF';
    ctx.fill();
    ctx.save();
    ellipse(ctx, ex, y, rx, ry);
    ctx.clip();
    const ix = ex + face.lookX * rx * 0.25;
    const iy = y + face.lookY * ry * 0.2 + ry * 0.1;
    const g = ctx.createLinearGradient(0, iy - ry, 0, iy + ry);
    g.addColorStop(0, darken(eyeIris, 0.45));
    g.addColorStop(1, lighten(eyeIris, 0.2));
    ellipse(ctx, ix, iy, rx * 0.8, ry * 0.88);
    ctx.fillStyle = g;
    ctx.fill();
    // Menacing eyes get a thin slit pupil instead of a round one.
    ellipse(ctx, ix, iy + ry * 0.05, rx * (menacing ? 0.14 : 0.36), ry * (menacing ? 0.6 : 0.42));
    ctx.fillStyle = darken(eyeIris, 0.7);
    ctx.fill();
    ellipse(ctx, ix - rx * 0.3, iy - ry * 0.38, rx * 0.32, ry * 0.25);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    circle(ctx, ix + rx * 0.32, iy + ry * 0.36, rx * 0.15);
    ctx.fill();
    ctx.restore();
    // Upper lash line
    ctx.beginPath();
    ctx.ellipse(ex, y, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.lineWidth = 3.2;
    ctx.stroke();
    if (menacing) {
      // Angry brow slanting down toward the middle.
      ctx.beginPath();
      ctx.moveTo(ex + side * rx * 1.1, y - ry * 1.35);
      ctx.lineTo(ex - side * rx * 0.7, y - ry * 0.75);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
}

function blush(ctx: CanvasRenderingContext2D, y: number, gap: number): void {
  ctx.fillStyle = 'rgba(255, 120, 150, 0.38)';
  for (const side of [-1, 1]) {
    ellipse(ctx, side * gap, y, 5.5, 3);
    ctx.fill();
  }
}

function mouth(ctx: CanvasRenderingContext2D, y: number, kind: 'cat' | 'open' | 'fang', line: string): void {
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.2;
  if (kind === 'open') {
    ellipse(ctx, 0, y + 2, 4, 5);
    paint(ctx, '#FF7FA3', 2, line);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(-6, y);
  ctx.quadraticCurveTo(-3, y + 4, 0, y);
  ctx.quadraticCurveTo(3, y + 4, 6, y);
  ctx.stroke();
  if (kind === 'fang') {
    ctx.beginPath();
    ctx.moveTo(2, y + 1);
    ctx.lineTo(3.5, y + 5);
    ctx.lineTo(5, y + 1);
    ctx.closePath();
    paint(ctx, '#FFFFFF', 1.4, line);
  }
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, line: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 2, y - 8, x + 2, y - 10);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 10);
  ctx.quadraticCurveTo(x + 14, y - 18, x + 18, y - 8);
  ctx.quadraticCurveTo(x + 8, y - 4, x + 2, y - 10);
  ctx.closePath();
  paint(ctx, '#7FD99A', 2, '#3F8F5A');
}

function bow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  const line = darken(color, 0.45);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * 11, y - 7);
    ctx.lineTo(x + side * 11, y + 6);
    ctx.closePath();
    paint(ctx, color, 2, line);
  }
  circle(ctx, x, y, 3.2);
  paint(ctx, lighten(color, 0.3), 1.8, line);
}

function droplet(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, line: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 4, y - 10, x + 6, y - 14);
  ctx.quadraticCurveTo(x + 2, y - 6, x + 5, y);
  ctx.closePath();
  paint(ctx, lighten(color, 0.3), 2, line);
}

function crown(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x - w, y - 12);
  ctx.lineTo(x - w * 0.5, y - 5);
  ctx.lineTo(x, y - 16);
  ctx.lineTo(x + w * 0.5, y - 5);
  ctx.lineTo(x + w, y - 12);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  paint(ctx, color, 2.2, '#B88A2A');
  circle(ctx, x, y - 5, 2.6);
  ctx.fillStyle = palette.danger;
  ctx.fill();
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
