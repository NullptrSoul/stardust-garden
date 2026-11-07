import type { EnemyLook } from '../data/enemies';
import { lighten, palette, rgba, shade } from '../palette';
import { circle, ellipse, paint, sparklePath } from './draw';

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
  /** Aura color for an elite's affix; defaults to the dark red menace aura. */
  aura?: string;
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
    case 'leech':
      drawLeech(ctx, m, face);
      break;
    case 'frog':
      drawFrog(ctx, m, face);
      break;
    case 'wisp':
      drawWisp(ctx, m, face);
      break;
    case 'golem':
      drawGolem(ctx, m, face);
      break;
    case 'toad':
      drawToad(ctx, m, face);
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
  g.addColorStop(0.6, m.aura ? rgba(m.aura, 0.3) : 'rgba(120, 30, 90, 0.25)');
  g.addColorStop(1, 'rgba(58, 31, 92, 0)');
  ctx.fillStyle = g;
  ellipse(ctx, m.x, feetY, r * pulse, r * 0.45 * pulse);
  ctx.fill();
  const ring = 0.35 + 0.25 * Math.sin(m.time * 6 + m.seed);
  ctx.strokeStyle = m.aura ? rgba(m.aura, ring + 0.2) : `rgba(255, 59, 107, ${ring})`;
  ctx.lineWidth = 2.5;
  ellipse(ctx, m.x, feetY, r * 0.8, r * 0.3);
  ctx.stroke();
  // Wisps drifting up
  for (let i = 0; i < (m.menace >= 2 ? 6 : 3); i++) {
    const k = (m.time * 0.6 + i / 3 + m.seed * 0.13) % 1;
    const wx = m.x + Math.sin(i * 2.3 + m.time * 1.5) * m.r * 0.9;
    const wy = feetY - k * m.r * 2.6 - m.lift;
    circle(ctx, wx, wy, (1 - k) * m.r * 0.18 + 2);
    ctx.fillStyle = m.aura ? rgba(m.aura, (1 - k) * 0.55) : `rgba(70, 30, 100, ${(1 - k) * 0.45})`;
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
  paint(ctx, '#5A1428', 3.5, GRIM_LINE);
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
  paint(ctx, blade, 3, GRIM_LINE);
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
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 4.5;
  ctx.stroke();
  // Pauldrons
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 24, -h * 0.62, 12, 9, side * 0.4, 0, Math.PI * 2);
    paint(ctx, '#4A4370', 3, GRIM_LINE);
  }
  // Helmet horns
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 10, -h + 4);
    ctx.quadraticCurveTo(side * 28, -h - 6, side * 24, -h - 26);
    ctx.quadraticCurveTo(side * 20, -h - 10, side * 4, -h + 8);
    ctx.closePath();
    paint(ctx, '#2A2440', 3, GRIM_LINE);
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

/** Feral hare: matted fur, torn ears, a bone horn and buck fangs; dashes when it winds up. */
function drawBunny(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 50;
  const h = 44;
  const flop = Math.sin(m.time * 6 + m.seed) * 0.12;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 9, -h + 8);
    ctx.rotate(side * 0.28 + flop * side);
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-9, -22, -2, -34);
    if (side > 0) {
      // A torn notch in one ear
      ctx.lineTo(1, -27);
      ctx.lineTo(4, -32);
    }
    ctx.quadraticCurveTo(8, -22, 6, 2);
    ctx.closePath();
    paint(ctx, m.color, 3.5, GRIM_LINE);
    ctx.beginPath();
    ctx.moveTo(-1, -2);
    ctx.quadraticCurveTo(-3, -16, -1, -24);
    ctx.strokeStyle = '#7E3E4A';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -6);
    ctx.bezierCurveTo(-w / 2 - 2, -h * 0.75, -w * 0.25, -h, 0, -h);
    ctx.bezierCurveTo(w * 0.3, -h, w / 2 + 2, -h * 0.7, w / 2, -6);
    // Ragged fur along the bottom
    ctx.lineTo(w * 0.36, 0);
    ctx.lineTo(w * 0.24, -4);
    ctx.lineTo(w * 0.12, 1);
    ctx.lineTo(0, -3);
    ctx.lineTo(-w * 0.12, 1);
    ctx.lineTo(-w * 0.24, -4);
    ctx.lineTo(-w * 0.36, 0);
    ctx.closePath();
  };
  grimBody(ctx, body, w, h, m.color, m.flash, '#E8DCCF');
  // Bristling fur on the back
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const x = -w * 0.44 + i * 7;
    const y = -h * 0.5 - i * 8;
    ctx.moveTo(x + 2, y + 2);
    ctx.lineTo(x - 9, y - 4);
    ctx.lineTo(x + 4, y - 3);
  }
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 3;
  ctx.stroke();
  // Bone horn
  ctx.beginPath();
  ctx.moveTo(-3, -h + 2);
  ctx.quadraticCurveTo(4, -h - 10, 13, -h - 16);
  ctx.quadraticCurveTo(7, -h - 4, 6, -h + 3);
  ctx.closePath();
  paint(ctx, '#DCD0B4', 2.5, GRIM_LINE);
  glowEyes(ctx, [[-9, -h * 0.55, 4.5], [10, -h * 0.55, 4.5]], face.menace ? palette.menaceEye : '#FF4B4B', face);
  // Buck fangs
  ctx.beginPath();
  ctx.moveTo(-5, -h * 0.33);
  ctx.lineTo(5, -h * 0.33);
  ctx.lineTo(5, -h * 0.17);
  ctx.lineTo(0, -h * 0.22);
  ctx.lineTo(-5, -h * 0.17);
  ctx.closePath();
  paint(ctx, '#EDE4CC', 2, GRIM_LINE);
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.33);
  ctx.lineTo(0, -h * 0.22);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Fused twins: two oozes grown into one stitched body; they tear apart when it dies. */
function drawTwin(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 66;
  const h = 54;
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -4);
    ctx.bezierCurveTo(-w / 2 - 2, -h * 0.75, -w * 0.36, -h - 2, -w * 0.2, -h);
    ctx.quadraticCurveTo(-w * 0.05, -h + 2, 0, -h * 0.82);
    ctx.quadraticCurveTo(w * 0.05, -h - 4, w * 0.22, -h - 2);
    ctx.bezierCurveTo(w * 0.4, -h, w / 2 + 2, -h * 0.7, w / 2, -4);
    ctx.quadraticCurveTo(w * 0.4, 2, w * 0.25, 0);
    ctx.quadraticCurveTo(w * 0.18, 9, w * 0.1, 0);
    ctx.lineTo(-w * 0.3, 0);
    ctx.quadraticCurveTo(-w * 0.46, 2, -w / 2, -4);
    ctx.closePath();
  };
  grimBody(ctx, path, w, h, palette.twinA, m.flash, '#D6F0A0');
  // The other twin's half, in its own color
  ctx.save();
  path();
  ctx.clip();
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, lighten(palette.twinB, 0.16));
  g.addColorStop(0.55, palette.twinB);
  g.addColorStop(1, shade(palette.twinB, 0.4));
  ctx.fillStyle = g;
  ctx.fillRect(0, -h - 8, w, h + 12);
  if (m.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${m.flash * 0.85})`;
    ctx.fillRect(0, -h - 8, w, h + 12);
  }
  ctx.restore();
  path();
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 4.5;
  ctx.stroke();
  // Stitched seam
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.82);
  ctx.quadraticCurveTo(-3, -h * 0.4, 0, 0);
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  for (let i = 1; i <= 4; i++) {
    const y = -h * 0.82 + h * 0.82 * (i / 5);
    ctx.beginPath();
    ctx.moveTo(-6, y - 2);
    ctx.lineTo(6, y + 2);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const eye = face.menace ? palette.menaceEye : '#E6FF5C';
  glowEyes(ctx, [[-16, -h * 0.62, 6], [16, -h * 0.66, 5]], eye, face);
  maw(ctx, -15, -h * 0.3, 18, 5, 4, face.hurt);
  maw(ctx, 15, -h * 0.33, 16, 5, 3, face.hurt);
}

/** Shadow thief: a scrawny black cat in a red scarf, hauling a glowing sack of stolen stardust. */
function drawCat(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 50;
  const h = 46;
  // The sack, glowing with stolen stardust
  ctx.save();
  ctx.translate(-20, -h * 0.55);
  ctx.rotate(-0.3);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
  glow.addColorStop(0, 'rgba(140, 200, 255, 0.5)');
  glow.addColorStop(1, 'rgba(140, 200, 255, 0)');
  ctx.fillStyle = glow;
  circle(ctx, 0, 0, 28);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 17, 0, 0, Math.PI * 2);
  paint(ctx, '#6B5A44', 3.5, GRIM_LINE);
  ctx.beginPath();
  ctx.moveTo(-5, -15);
  ctx.lineTo(0, -22);
  ctx.lineTo(5, -15);
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 3;
  ctx.stroke();
  sparklePath(ctx, 1, 2, 7, 0);
  paint(ctx, palette.shard, 1.6, '#2F5C9A');
  ctx.restore();
  // Thin, kinked tail
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.quadraticCurveTo(-36, -12 + Math.sin(m.time * 8) * 6, -30, -34);
  ctx.lineTo(-36, -40);
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = m.color;
  ctx.lineWidth = 4.5;
  ctx.stroke();
  // Sharp ears; one is notched
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 5, -h + 8);
    ctx.lineTo(side * 17, -h - 14);
    if (side > 0) {
      ctx.lineTo(side * 19, -h - 5);
      ctx.lineTo(side * 22, -h - 7);
    }
    ctx.lineTo(side * 23, -h + 10);
    ctx.closePath();
    paint(ctx, m.color, 3.5, GRIM_LINE);
    ctx.beginPath();
    ctx.moveTo(side * 10, -h + 6);
    ctx.lineTo(side * 16, -h - 6);
    ctx.lineTo(side * 19, -h + 6);
    ctx.closePath();
    ctx.fillStyle = '#5A2A3A';
    ctx.fill();
  }
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 2, -4);
    ctx.bezierCurveTo(-w / 2 - 2, -h * 0.7, -w * 0.3, -h, 0, -h);
    ctx.bezierCurveTo(w * 0.3, -h, w / 2 + 2, -h * 0.7, w / 2 - 2, -4);
    ctx.quadraticCurveTo(0, 3, -w / 2 + 2, -4);
    ctx.closePath();
  };
  grimBody(ctx, body, w, h, m.color, m.flash, '#9C8CC0');
  // Red bandit scarf over the lower face, its tail flapping behind
  ctx.beginPath();
  ctx.moveTo(-18, -h * 0.34);
  ctx.quadraticCurveTo(-32, -h * 0.3 + Math.sin(m.time * 10) * 3, -38, -h * 0.18);
  ctx.lineTo(-30, -h * 0.14);
  ctx.closePath();
  paint(ctx, '#8A2433', 2.5, GRIM_LINE);
  ctx.beginPath();
  ctx.moveTo(-23, -h * 0.42);
  ctx.quadraticCurveTo(0, -h * 0.5, 23, -h * 0.42);
  ctx.lineTo(20, -h * 0.18);
  ctx.quadraticCurveTo(0, -h * 0.08, -20, -h * 0.18);
  ctx.closePath();
  paint(ctx, '#8A2433', 3, GRIM_LINE);
  glowEyes(ctx, [[-9, -h * 0.62, 5], [9, -h * 0.62, 5]], face.menace ? palette.menaceEye : '#FFD23B', face);
  // An old scar across one eye
  ctx.beginPath();
  ctx.moveTo(-15, -h * 0.8);
  ctx.lineTo(-4, -h * 0.47);
  ctx.strokeStyle = '#C9B9C8';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Starlight bud: the one pale, living thing left in the ruins. Not a monster,
 * so no face; breaking it drops a healing candy.
 */
function drawBud(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const sway = Math.sin(m.time * 2 + m.seed) * 0.08;
  const pulse = 0.75 + 0.25 * Math.sin(m.time * 2.5 + m.seed);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(side * 22, -16, side * 32, -4);
    ctx.lineTo(side * 24, -6);
    ctx.lineTo(side * 26, 0);
    ctx.quadraticCurveTo(side * 14, 2, 0, -4);
    ctx.closePath();
    paint(ctx, '#3F5A3A', 3, GRIM_LINE);
  }
  ctx.save();
  ctx.rotate(sway);
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, -20);
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = '#4E6E46';
  ctx.lineWidth = 3;
  ctx.stroke();
  const glow = ctx.createRadialGradient(0, -38, 2, 0, -38, 44);
  glow.addColorStop(0, `rgba(255, 224, 150, ${0.65 * pulse})`);
  glow.addColorStop(1, 'rgba(255, 224, 150, 0)');
  ctx.fillStyle = glow;
  circle(ctx, 0, -38, 44);
  ctx.fill();
  // Three closed crystal petals
  for (const [dx, rot] of [
    [-7, -0.35],
    [7, 0.35],
    [0, 0],
  ]) {
    ctx.save();
    ctx.translate(dx, -18);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-14, -6, -12, -30, 0, -40);
    ctx.bezierCurveTo(12, -30, 14, -6, 0, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -40, 0, 0);
    g.addColorStop(0, '#FFF7DC');
    g.addColorStop(1, m.color);
    paint(ctx, g, 3, GRIM_LINE);
    ctx.restore();
  }
  sparklePath(ctx, 0, -38, 6 + 2 * pulse, 0);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  if (face.hurt || m.flash > 0.3) {
    // Cracking under the hit
    ctx.beginPath();
    ctx.moveTo(-6, -46);
    ctx.lineTo(-1, -36);
    ctx.lineTo(-5, -28);
    ctx.strokeStyle = GRIM_LINE;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Monster types ----


/** Corrosive ooze: a murky, dripping blob with bubbles inside and a toothy grin. */
function drawSlime(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 64;
  const h = 50;
  const body = oozePath(ctx, w, h, Math.sin(m.time * 3 + m.seed) * 2);
  grimBody(ctx, body, w, h, m.color, m.flash, '#D6F0A0');
  // Bubbles and murk floating inside
  ctx.save();
  body();
  ctx.clip();
  for (const [bx, by, br] of [
    [-18, -14, 5],
    [16, -10, 3.5],
    [6, -38, 3],
    [-6, -8, 2.5],
  ]) {
    const k = (m.time * 0.4 + bx * 0.05 + m.seed * 0.1) % 1;
    circle(ctx, bx, by - k * 8, br);
    ctx.fillStyle = rgba(shade(m.color, 0.5), 0.5);
    ctx.fill();
    circle(ctx, bx - br * 0.3, by - k * 8 - br * 0.3, br * 0.35);
    ctx.fillStyle = 'rgba(220, 255, 200, 0.35)';
    ctx.fill();
  }
  ctx.restore();
  const eye = face.menace ? palette.menaceEye : '#E6FF5C';
  glowEyes(ctx, [[-11, -h * 0.6, 5.5], [11, -h * 0.64, 6.5]], eye, face);
  maw(ctx, 1, -h * 0.34, 32, 7, 5, face.hurt);
}

/** Shadow imp: a soot-colored gremlin with ragged bat wings, bone horns and a wide grin. */
function drawImp(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 50;
  const h = 46;
  const flap = Math.sin(m.time * 18 + m.seed) * 0.35;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 16, -h * 0.62);
    ctx.rotate(side * (0.25 + flap));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(side * 12, -26);
    ctx.lineTo(side * 40, -20);
    ctx.lineTo(side * 31, -11);
    ctx.lineTo(side * 35, -2);
    ctx.lineTo(side * 23, -5);
    ctx.lineTo(side * 21, 6);
    ctx.lineTo(side * 9, 2);
    ctx.closePath();
    paint(ctx, '#2A1F35', 3.5, GRIM_LINE);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(side * 12, -26);
    ctx.lineTo(side * 40, -20);
    ctx.moveTo(side * 12, -26);
    ctx.lineTo(side * 22, -4);
    ctx.strokeStyle = '#6E5A86';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  // Barbed tail
  ctx.beginPath();
  ctx.moveTo(-16, -8);
  ctx.quadraticCurveTo(-40, -2, -38, -24);
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = m.color;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-38, -34);
  ctx.lineTo(-45, -20);
  ctx.lineTo(-31, -22);
  ctx.closePath();
  paint(ctx, '#C9312F', 2.5, GRIM_LINE);

  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -4);
    ctx.bezierCurveTo(-w / 2 - 2, -h * 0.6, -w * 0.42, -h * 0.9, -w * 0.32, -h - 8);
    ctx.lineTo(-w * 0.14, -h + 2);
    ctx.quadraticCurveTo(0, -h - 2, w * 0.14, -h + 2);
    ctx.lineTo(w * 0.32, -h - 8);
    ctx.bezierCurveTo(w * 0.42, -h * 0.9, w / 2 + 2, -h * 0.6, w / 2, -4);
    ctx.quadraticCurveTo(w / 2, 1, w * 0.3, 1);
    ctx.lineTo(-w * 0.3, 1);
    ctx.quadraticCurveTo(-w / 2, 1, -w / 2, -4);
    ctx.closePath();
  };
  grimBody(ctx, body, w, h, m.color, m.flash, '#E3B8FF');
  // Curved bone horns
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 6, -h + 1);
    ctx.quadraticCurveTo(side * 8, -h - 16, side * 20, -h - 20);
    ctx.quadraticCurveTo(side * 13, -h - 8, side * 14, -h + 3);
    ctx.closePath();
    paint(ctx, '#D8CDB4', 2.6, GRIM_LINE);
  }
  const eye = face.menace ? palette.menaceEye : '#FFB13B';
  glowEyes(ctx, [[-10, -h * 0.55, 5.5], [10, -h * 0.55, 5.5]], eye, face);
  maw(ctx, 0, -h * 0.3, 30, 6, 6, face.hurt);
}

/** Toxic shroom: dark blood-red cap with glowing poison spots, a gaping mouth on the stem. */
function drawMushroom(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const stem = (): void => {
    ctx.beginPath();
    ctx.moveTo(-19, -34);
    ctx.quadraticCurveTo(-25, -10, -20, 0);
    ctx.quadraticCurveTo(0, 4, 20, 0);
    ctx.quadraticCurveTo(25, -10, 19, -34);
    ctx.closePath();
  };
  grimBody(ctx, stem, 44, 34, palette.mushroomStem, m.flash, '#F2EFD8');
  // Drooping, uneven cap
  const cap = (): void => {
    ctx.beginPath();
    ctx.moveTo(-36, -26);
    ctx.bezierCurveTo(-40, -70, 38, -72, 37, -27);
    ctx.quadraticCurveTo(30, -22, 24, -28);
    ctx.quadraticCurveTo(14, -21, 4, -27);
    ctx.quadraticCurveTo(-8, -20, -18, -27);
    ctx.quadraticCurveTo(-28, -20, -36, -26);
    ctx.closePath();
  };
  grimBody(ctx, cap, 72, 44, m.color, m.flash, '#FF9AA8');
  // Glowing poison spots
  const pulse = 0.7 + 0.3 * Math.sin(m.time * 3 + m.seed);
  for (const [dx, dy, r] of [
    [-18, -46, 5],
    [5, -56, 6],
    [21, -42, 4.5],
    [-3, -38, 3.5],
  ]) {
    const glow = ctx.createRadialGradient(dx, dy, 0, dx, dy, r * 2.4);
    glow.addColorStop(0, `rgba(180, 255, 110, ${0.55 * pulse})`);
    glow.addColorStop(1, 'rgba(180, 255, 110, 0)');
    ctx.fillStyle = glow;
    circle(ctx, dx, dy, r * 2.4);
    ctx.fill();
    circle(ctx, dx, dy, r);
    paint(ctx, '#C8FF7A', 2, GRIM_LINE);
  }
  const eye = face.menace ? palette.menaceEye : '#B8FF6A';
  glowEyes(ctx, [[-8, -24, 4], [8, -25, 4]], eye, face);
  // Gaping round maw
  ellipse(ctx, 0, -11, 8, face.hurt ? 5 : 7);
  paint(ctx, '#2A0F16', 2.5, GRIM_LINE);
  ctx.fillStyle = '#EDE4CC';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 6, -16);
    ctx.lineTo(side * 2, -16);
    ctx.lineTo(side * 4, -11);
    ctx.closePath();
    ctx.fill();
  }
}

const GRIM_LINE = '#17111C';

/** A murky body with a heavy dark outline, a cold rim light on top and shadowed underside. */
function grimBody(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  w: number,
  h: number,
  color: string,
  flash: number,
  rim: string,
): void {
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, lighten(color, 0.16));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, 0.4));
  path();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = rgba(rim, 0.22);
  ctx.beginPath();
  ctx.ellipse(-w * 0.18, -h * 0.8, w * 0.22, h * 0.09, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(8, 4, 12, 0.28)';
  ellipse(ctx, w * 0.1, 0, w * 0.55, h * 0.28);
  ctx.fill();
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.85})`;
    ctx.fillRect(-w, -h * 1.5, w * 2, h * 2);
  }
  ctx.restore();
  path();
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 4.5;
  ctx.stroke();
}

/** Small glowing eyes in dark sockets, with slit pupils and angry brows; X X when hurt. */
function glowEyes(ctx: CanvasRenderingContext2D, eyes: Array<[number, number, number]>, color: string, face: Face): void {
  for (const [x, y, r] of eyes) {
    if (face.hurt) {
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.strokeStyle = GRIM_LINE;
      ctx.lineWidth = 3;
      ctx.stroke();
      continue;
    }
    const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.8);
    glow.addColorStop(0, rgba(color, 0.55));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    circle(ctx, x, y, r * 2.8);
    ctx.fill();
    ellipse(ctx, x, y, r * 1.25, r * 1.05);
    ctx.fillStyle = '#0E0A12';
    ctx.fill();
    const ix = x + face.lookX * r * 0.22;
    const iy = y + face.lookY * r * 0.16;
    ellipse(ctx, ix, iy, r * 0.78, r * 0.68);
    ctx.fillStyle = color;
    ctx.fill();
    ellipse(ctx, ix, iy, r * 0.17, r * 0.55);
    ctx.fillStyle = '#0E0A12';
    ctx.fill();
    circle(ctx, ix - r * 0.28, iy - r * 0.26, r * 0.17);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    // Brow slanting down toward the middle
    const side = x < 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x + side * r * 1.3, y - r * 1.5);
    ctx.lineTo(x - side * r * 0.9, y - r * 0.9);
    ctx.strokeStyle = GRIM_LINE;
    ctx.lineWidth = 3.4;
    ctx.stroke();
  }
}

/** A dark crescent mouth lined with sharp teeth. */
function maw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, teeth: number, open: boolean): void {
  const depth = open ? h * 2.6 : h * 2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x, y + depth, x + w / 2, y);
  ctx.quadraticCurveTo(x, y + h * 0.5, x - w / 2, y);
  ctx.closePath();
  paint(ctx, '#2A0F16', 2.6, GRIM_LINE);
  ctx.fillStyle = '#EDE4CC';
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < teeth; i++) {
    const t = (i + 0.5) / teeth;
    const tx = x - w / 2 + w * t;
    const curve = 1 - Math.pow(2 * t - 1, 2);
    const top = y + h * 0.25 * curve;
    const bottom = y + depth * 0.5 * curve;
    const tw = (w / teeth) * 0.42;
    ctx.beginPath();
    ctx.moveTo(tx - tw, top);
    ctx.lineTo(tx + tw, top);
    ctx.lineTo(tx, top + Math.max(3, (bottom - top) * 0.55));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** Hollow knight: rusted, dented armor with only two cold lights inside, behind a cracked shield. */
function drawKnight(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 64;
  const h = 56;
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 2, -2);
    ctx.lineTo(-w / 2 + 4, -h * 0.55);
    ctx.quadraticCurveTo(-w / 2 + 2, -h * 0.8, -w * 0.3, -h * 0.84);
    ctx.lineTo(w * 0.3, -h * 0.84);
    ctx.quadraticCurveTo(w / 2 - 2, -h * 0.8, w / 2 - 4, -h * 0.55);
    ctx.lineTo(w / 2 - 2, -2);
    ctx.quadraticCurveTo(0, 3, -w / 2 + 2, -2);
    ctx.closePath();
  };
  grimBody(ctx, body, w, h, m.color, m.flash, '#D6DCE8');
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = 'rgba(150, 72, 40, 0.5)';
  for (const [rx, ry, rr] of [
    [-16, -14, 7],
    [12, -30, 5],
    [20, -8, 6],
  ]) {
    ellipse(ctx, rx, ry, rr, rr * 0.7);
    ctx.fill();
  }
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.36);
  ctx.quadraticCurveTo(0, -h * 0.3, w / 2, -h * 0.36);
  ctx.stroke();
  ctx.fillStyle = '#2A2830';
  for (const rx of [-20, -7, 7, 20]) {
    circle(ctx, rx, -h * 0.33, 2);
    ctx.fill();
  }
  ctx.restore();
  // Spiked pauldrons
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 14, -h * 0.84);
    ctx.quadraticCurveTo(side * 34, -h * 0.9, side * 34, -h * 0.62);
    ctx.lineTo(side * 40, -h * 0.98);
    ctx.lineTo(side * 26, -h * 0.9);
    ctx.closePath();
    paint(ctx, shade(m.color, 0.15), 3, GRIM_LINE);
  }
  // Bucket helm with a T-visor and a dent
  const helm = (): void => {
    ctx.beginPath();
    ctx.moveTo(-19, -h * 0.74);
    ctx.lineTo(-21, -h - 6);
    ctx.quadraticCurveTo(-4, -h - 18, 4, -h - 14);
    ctx.lineTo(8, -h - 10);
    ctx.quadraticCurveTo(16, -h - 14, 21, -h - 6);
    ctx.lineTo(19, -h * 0.74);
    ctx.closePath();
  };
  helm();
  const steel = ctx.createLinearGradient(0, -h - 16, 0, -h * 0.74);
  steel.addColorStop(0, '#8A909C');
  steel.addColorStop(1, '#4C515C');
  ctx.fillStyle = steel;
  ctx.fill();
  if (m.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${m.flash * 0.85})`;
    ctx.fill();
  }
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#0E0A12';
  ctx.fillRect(-14, -h * 0.98, 28, 6);
  ctx.fillRect(-3, -h * 0.98, 6, 15);
  const eye = face.menace ? palette.menaceEye : '#7CF0D0';
  for (const side of [-1, 1]) {
    const ex = side * 8;
    const ey = -h * 0.98 + 3;
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 11);
    g.addColorStop(0, rgba(eye, face.hurt ? 0.3 : 0.85));
    g.addColorStop(1, rgba(eye, 0));
    ctx.fillStyle = g;
    circle(ctx, ex, ey, 11);
    ctx.fill();
    ctx.fillStyle = face.hurt ? '#556' : '#F2FFFC';
    ctx.fillRect(ex - 3, ey - 1.5, 6, 3);
  }
  // Rusted kite shield with a crack through it
  ctx.save();
  ctx.translate(27, -22);
  ctx.beginPath();
  ctx.moveTo(-14, -16);
  ctx.lineTo(14, -16);
  ctx.quadraticCurveTo(15, 6, 0, 20);
  ctx.quadraticCurveTo(-15, 6, -14, -16);
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, -16, 0, 20);
  sg.addColorStop(0, '#7A6452');
  sg.addColorStop(1, '#4A3B30');
  paint(ctx, sg, 4, GRIM_LINE);
  ctx.beginPath();
  ctx.moveTo(-9, -11);
  ctx.lineTo(9, -11);
  ctx.quadraticCurveTo(9, 4, 0, 13);
  ctx.quadraticCurveTo(-9, 4, -9, -11);
  ctx.strokeStyle = '#9C8462';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(4, -16);
  ctx.lineTo(0, -6);
  ctx.lineTo(5, 0);
  ctx.lineTo(1, 9);
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();
}

/** Boss: the Rot King, a huge crimson ooze with three eyes, a crooked rusted crown and a sword stuck in it. */
function drawKing(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 66;
  const h = 56;
  const body = oozePath(ctx, w, h, Math.sin(m.time * 2.5 + m.seed) * 2.5);
  // A rusted sword stuck in its side
  ctx.save();
  ctx.translate(-26, -30);
  ctx.rotate(-0.9);
  ctx.beginPath();
  ctx.rect(-3, -34, 6, 30);
  paint(ctx, '#8E8A86', 2.5, GRIM_LINE);
  ctx.beginPath();
  ctx.rect(-9, -6, 18, 4);
  paint(ctx, '#5E4A36', 2.2, GRIM_LINE);
  ctx.restore();
  grimBody(ctx, body, w, h, m.color, m.flash, '#FFB0C0');
  // Bones floating inside
  ctx.save();
  body();
  ctx.clip();
  ctx.strokeStyle = 'rgba(230, 210, 190, 0.35)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(10, -14);
  ctx.lineTo(24, -20);
  ctx.moveTo(-14, -10);
  ctx.lineTo(-4, -6);
  ctx.stroke();
  ctx.restore();
  // Heavy crown, slipped to one side
  ctx.save();
  ctx.translate(5, -h + 3);
  ctx.rotate(0.16);
  ctx.beginPath();
  ctx.moveTo(-18, 2);
  ctx.lineTo(-20, -14);
  ctx.lineTo(-10, -6);
  ctx.lineTo(-4, -20);
  ctx.lineTo(3, -7);
  ctx.lineTo(11, -18);
  ctx.lineTo(14, -5);
  ctx.lineTo(21, -13);
  ctx.lineTo(19, 2);
  ctx.closePath();
  paint(ctx, '#A8842C', 3.5, GRIM_LINE);
  ctx.fillStyle = '#5A1020';
  for (const gx of [-10, 3, 13]) {
    circle(ctx, gx, -2, 2.6);
    ctx.fill();
  }
  ctx.restore();
  glowEyes(ctx, [[-14, -h * 0.56, 6.5], [13, -h * 0.58, 7], [-1, -h * 0.8, 4]], palette.menaceEye, face);
  maw(ctx, 0, -h * 0.34, 42, 8, 8, face.hurt);
  // Drool
  ctx.beginPath();
  ctx.moveTo(12, -h * 0.22);
  ctx.quadraticCurveTo(14, -h * 0.1, 12, -h * 0.04);
  ctx.quadraticCurveTo(10, -h * 0.1, 10, -h * 0.2);
  ctx.closePath();
  paint(ctx, '#B6F25A', 2, GRIM_LINE);
}

/** Boss: the Bat Queen, a violet ooze with great torn wings, an iron thorn crown and a fanged smirk. */
function drawQueen(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 62;
  const h = 54;
  const flap = Math.sin(m.time * 3) * 0.12;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 20, -h * 0.62);
    ctx.rotate(side * (0.25 + flap));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 22, -36, side * 48, -28);
    ctx.lineTo(side * 40, -14);
    ctx.lineTo(side * 50, -2);
    ctx.lineTo(side * 36, 4);
    ctx.lineTo(side * 40, 18);
    ctx.lineTo(side * 26, 10);
    ctx.quadraticCurveTo(side * 12, 8, 0, 10);
    ctx.closePath();
    paint(ctx, '#22142E', 4, GRIM_LINE);
    ctx.beginPath();
    ctx.moveTo(side * 4, 2);
    ctx.quadraticCurveTo(side * 20, -22, side * 46, -26);
    ctx.moveTo(side * 12, 0);
    ctx.lineTo(side * 38, 2);
    ctx.moveTo(side * 10, 4);
    ctx.lineTo(side * 34, 14);
    ctx.strokeStyle = 'rgba(255, 80, 150, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  const body = oozePath(ctx, w, h, Math.sin(m.time * 2 + m.seed) * 2);
  grimBody(ctx, body, w, h, m.color, m.flash, '#F0B0FF');
  // Iron thorn crown with a glowing heart gem
  ctx.beginPath();
  ctx.moveTo(-17, -h + 6);
  for (let i = 0; i <= 6; i++) {
    const x = -17 + (i * 34) / 6;
    ctx.lineTo(x, -h - (i % 2 === 0 ? 16 : 3));
  }
  ctx.lineTo(17, -h + 6);
  ctx.closePath();
  paint(ctx, '#3A2A44', 3.5, GRIM_LINE);
  const gem = ctx.createRadialGradient(0, -h - 4, 0, 0, -h - 4, 14);
  gem.addColorStop(0, 'rgba(255, 60, 120, 0.7)');
  gem.addColorStop(1, 'rgba(255, 60, 120, 0)');
  ctx.fillStyle = gem;
  circle(ctx, 0, -h - 4, 14);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -h - 5);
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-7, -2, -4, -8, 0, -4);
  ctx.bezierCurveTo(4, -8, 7, -2, 0, 4);
  paint(ctx, '#FF3B6B', 2, GRIM_LINE);
  ctx.restore();
  glowEyes(ctx, [[-13, -h * 0.52, 7], [13, -h * 0.52, 7]], palette.menaceEye, face);
  // Fanged smirk
  ctx.beginPath();
  ctx.moveTo(-12, -h * 0.26);
  ctx.quadraticCurveTo(2, -h * 0.16, 14, -h * 0.3);
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 3;
  ctx.stroke();
  for (const fx of [-6, 6]) {
    ctx.beginPath();
    ctx.moveTo(fx - 3, -h * 0.23);
    ctx.lineTo(fx + 3, -h * 0.23);
    ctx.lineTo(fx, -h * 0.12);
    ctx.closePath();
    paint(ctx, '#EDE4CC', 1.6, GRIM_LINE);
  }
  // Dark motes circling her
  for (let i = 0; i < 3; i++) {
    const a = m.time * 1.5 + (i * Math.PI * 2) / 3;
    sparklePath(ctx, Math.cos(a) * 44, -h * 0.5 + Math.sin(a) * 16, 4 + 2 * Math.sin(m.time * 4 + i), 0);
    paint(ctx, '#FF5AA0', 1.5, GRIM_LINE);
  }
}

// ---- Chapter 2: the misty marsh ----

/** Blood leech: a ringed, glistening slug with a round sucker full of teeth. */
function drawLeech(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 56;
  const h = 34;
  const wave = Math.sin(m.time * 10 + m.seed) * 3;
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -6);
    ctx.bezierCurveTo(-w / 2, -h * 0.9 + wave, -w * 0.1, -h - 2, w * 0.18, -h + 2);
    ctx.bezierCurveTo(w * 0.42, -h + 4, w / 2 + 4, -h * 0.5, w / 2, -6);
    ctx.quadraticCurveTo(w / 2, 1, w * 0.3, 1);
    ctx.lineTo(-w * 0.36, 1);
    ctx.quadraticCurveTo(-w / 2 - 2, 1, -w / 2, -6);
    ctx.closePath();
  };
  grimBody(ctx, body, w, h, m.color, m.flash, '#F0A0B0');
  // Body rings
  ctx.save();
  body();
  ctx.clip();
  ctx.strokeStyle = 'rgba(14, 6, 10, 0.45)';
  ctx.lineWidth = 2.5;
  for (const x of [-14, -4, 6]) {
    ctx.beginPath();
    ctx.moveTo(x + wave * 0.3, -h - 4);
    ctx.quadraticCurveTo(x - 4, -h * 0.5, x, 2);
    ctx.stroke();
  }
  ctx.restore();
  // Round sucker mouth at the front
  circle(ctx, w * 0.32, -h * 0.5, 9);
  paint(ctx, '#2A0F16', 3, GRIM_LINE);
  ctx.fillStyle = '#EDE4CC';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.32 + Math.cos(a) * 8, -h * 0.5 + Math.sin(a) * 8);
    ctx.lineTo(w * 0.32 + Math.cos(a + 0.25) * 3, -h * 0.5 + Math.sin(a + 0.25) * 3);
    ctx.lineTo(w * 0.32 + Math.cos(a + 0.5) * 8, -h * 0.5 + Math.sin(a + 0.5) * 8);
    ctx.closePath();
    ctx.fill();
  }
  glowEyes(ctx, [[w * 0.08, -h * 0.78, 3.5], [w * 0.22, -h * 0.84, 3.5]], face.menace ? palette.menaceEye : '#FF6B6B', face);
}

/** Plague frog: squat and warty, with bulging glowing eyes and a pulsing poison throat. */
function drawFrog(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 56;
  const h = 40;
  const throat = 1 + 0.15 * Math.sin(m.time * 5 + m.seed);
  // Back legs
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 22, -8, 12, 9, side * 0.4, 0, Math.PI * 2);
    paint(ctx, shade(m.color, 0.15), 3.5, GRIM_LINE);
  }
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -4);
    ctx.bezierCurveTo(-w / 2 - 2, -h * 0.8, -w * 0.25, -h, 0, -h);
    ctx.bezierCurveTo(w * 0.25, -h, w / 2 + 2, -h * 0.8, w / 2, -4);
    ctx.quadraticCurveTo(0, 3, -w / 2, -4);
    ctx.closePath();
  };
  grimBody(ctx, body, w, h, m.color, m.flash, '#C8F0A0');
  // Glowing warts
  for (const [dx, dy, r] of [
    [-14, -24, 3],
    [10, -30, 2.5],
    [18, -16, 2.5],
    [-4, -14, 2],
  ]) {
    circle(ctx, dx, dy, r);
    paint(ctx, '#B8FF6A', 1.5, GRIM_LINE);
  }
  // Swollen poison throat
  ellipse(ctx, 0, -8, 12 * throat, 7 * throat);
  paint(ctx, '#C8E86A', 2.5, GRIM_LINE);
  // Bulging eyes on top
  for (const side of [-1, 1]) {
    circle(ctx, side * 13, -h + 2, 9);
    paint(ctx, m.color, 3, GRIM_LINE);
  }
  glowEyes(ctx, [[-13, -h + 1, 5], [13, -h + 1, 5]], face.menace ? palette.menaceEye : '#FFD23B', face);
  ctx.beginPath();
  ctx.moveTo(-18, -h * 0.42);
  ctx.quadraticCurveTo(0, -h * 0.28, 18, -h * 0.42);
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** Will-o'-wisp: a flickering ghost flame with a hollow skull face; swells before it bursts. */
function drawWisp(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const swell = m.alert ? 1.25 + 0.1 * Math.sin(m.time * 40) : 1;
  const flick = Math.sin(m.time * 14 + m.seed) * 3;
  ctx.save();
  ctx.translate(0, -26);
  ctx.scale(swell, swell);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
  glow.addColorStop(0, rgba(m.color, m.alert ? 0.75 : 0.5));
  glow.addColorStop(1, rgba(m.color, 0));
  ctx.fillStyle = glow;
  circle(ctx, 0, 0, 40);
  ctx.fill();
  const flame = (): void => {
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.bezierCurveTo(-22, 16, -20, -6, -8, -14);
    ctx.quadraticCurveTo(-6, -26 + flick, 2, -34 + flick);
    ctx.quadraticCurveTo(4, -20, 10, -18 - flick);
    ctx.bezierCurveTo(22, -6, 20, 16, 0, 18);
    ctx.closePath();
  };
  flame();
  const g = ctx.createLinearGradient(0, -34, 0, 18);
  g.addColorStop(0, '#E8FFF8');
  g.addColorStop(1, m.color);
  ctx.fillStyle = g;
  ctx.fill();
  if (m.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${m.flash * 0.85})`;
    ctx.fill();
  }
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  // Hollow skull face
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 5.5, 0, 4, face.hurt ? 2 : 5);
    ctx.fillStyle = '#0E2A26';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-5, 9);
  ctx.lineTo(-2, 7);
  ctx.lineTo(0, 9);
  ctx.lineTo(2, 7);
  ctx.lineTo(5, 9);
  ctx.strokeStyle = '#0E2A26';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** Moss golem: a hulking block of old temple stone, cracked and overgrown, with rune eyes. */
function drawGolem(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 66;
  const h = 60;
  // Boulder fists
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 34, -14, 13, 12, 0, 0, Math.PI * 2);
    paint(ctx, shade(m.color, 0.1), 4, GRIM_LINE);
  }
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 4, -2);
    ctx.lineTo(-w / 2, -h * 0.6);
    ctx.lineTo(-w * 0.34, -h);
    ctx.lineTo(w * 0.3, -h - 2);
    ctx.lineTo(w / 2, -h * 0.62);
    ctx.lineTo(w / 2 - 4, -2);
    ctx.closePath();
  };
  grimBody(ctx, body, w, h, m.color, m.flash, '#E8E4D8');
  ctx.save();
  body();
  ctx.clip();
  // Moss on top, cracks across the front
  ctx.fillStyle = '#4F6B3A';
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.7);
  ctx.quadraticCurveTo(-10, -h * 0.82, 4, -h * 0.74);
  ctx.quadraticCurveTo(20, -h * 0.86, w / 2, -h * 0.7);
  ctx.lineTo(w / 2, -h - 4);
  ctx.lineTo(-w / 2, -h - 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = GRIM_LINE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.lineTo(-10, -22);
  ctx.lineTo(-14, -32);
  ctx.moveTo(16, -4);
  ctx.lineTo(10, -16);
  ctx.stroke();
  ctx.restore();
  // Glowing rune eyes and a rune on the chest
  const eye = face.menace ? palette.menaceEye : '#8CFF9E';
  for (const side of [-1, 1]) {
    const ex = side * 12;
    const ey = -h * 0.56;
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 12);
    g.addColorStop(0, rgba(eye, face.hurt ? 0.3 : 0.85));
    g.addColorStop(1, rgba(eye, 0));
    ctx.fillStyle = g;
    circle(ctx, ex, ey, 12);
    ctx.fill();
    ctx.fillStyle = '#F2FFF4';
    ctx.fillRect(ex - 5, ey - 2, 10, 4);
  }
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.36);
  ctx.lineTo(-6, -h * 0.24);
  ctx.lineTo(0, -h * 0.12);
  ctx.lineTo(6, -h * 0.24);
  ctx.closePath();
  ctx.strokeStyle = rgba(eye, 0.8);
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/** Boss: the Plague Toad, a bloated marsh king with a glowing poison sac and a crown of bones. */
function drawToad(ctx: CanvasRenderingContext2D, m: MonsterPose, face: Face): void {
  const w = 74;
  const h = 54;
  const sac = 1 + 0.12 * Math.sin(m.time * 3 + m.seed) + (m.alert ? 0.15 : 0);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 30, -10, 16, 12, side * 0.45, 0, Math.PI * 2);
    paint(ctx, shade(m.color, 0.15), 4, GRIM_LINE);
  }
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -4);
    ctx.bezierCurveTo(-w / 2 - 4, -h * 0.85, -w * 0.25, -h - 2, 0, -h);
    ctx.bezierCurveTo(w * 0.25, -h - 2, w / 2 + 4, -h * 0.85, w / 2, -4);
    ctx.quadraticCurveTo(0, 4, -w / 2, -4);
    ctx.closePath();
  };
  grimBody(ctx, body, w, h, m.color, m.flash, '#C8F0A0');
  for (const [dx, dy, r] of [
    [-24, -30, 4],
    [-10, -40, 3],
    [14, -38, 3.5],
    [26, -24, 3],
    [-28, -14, 2.5],
  ]) {
    const glow = ctx.createRadialGradient(dx, dy, 0, dx, dy, r * 3);
    glow.addColorStop(0, 'rgba(180, 255, 110, 0.5)');
    glow.addColorStop(1, 'rgba(180, 255, 110, 0)');
    ctx.fillStyle = glow;
    circle(ctx, dx, dy, r * 3);
    ctx.fill();
    circle(ctx, dx, dy, r);
    paint(ctx, '#B8FF6A', 1.6, GRIM_LINE);
  }
  // Crown of bones
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.translate(i * 9, -h + 2);
    ctx.rotate(i * 0.18);
    ctx.beginPath();
    ctx.moveTo(-3, 2);
    ctx.lineTo(-2, -14 + Math.abs(i) * 3);
    ctx.lineTo(2, -14 + Math.abs(i) * 3);
    ctx.lineTo(3, 2);
    ctx.closePath();
    paint(ctx, '#E2D6BA', 2.2, GRIM_LINE);
    ctx.restore();
  }
  for (const side of [-1, 1]) {
    circle(ctx, side * 17, -h + 6, 11);
    paint(ctx, m.color, 3.5, GRIM_LINE);
  }
  glowEyes(ctx, [[-17, -h + 5, 6.5], [17, -h + 5, 6.5]], palette.menaceEye, face);
  maw(ctx, 0, -h * 0.42, 50, 8, 9, face.hurt);
  // Glowing poison sac under the mouth
  ellipse(ctx, 0, -10, 18 * sac, 10 * sac);
  const g = ctx.createRadialGradient(-4, -14, 2, 0, -10, 18 * sac);
  g.addColorStop(0, '#F2FFB0');
  g.addColorStop(1, '#8CCB3A');
  paint(ctx, g, 3, GRIM_LINE);
}

/** A lumpy, dripping ooze outline, shared by slimes and the slime bosses. */
function oozePath(ctx: CanvasRenderingContext2D, w: number, h: number, wob: number): () => void {
  return () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -4);
    ctx.bezierCurveTo(-w / 2 - 2, -h * 0.72, -w * 0.3, -h - 2 + wob, -w * 0.04, -h);
    ctx.quadraticCurveTo(w * 0.08, -h - 7 - wob, w * 0.17, -h + 2);
    ctx.bezierCurveTo(w * 0.4, -h + 2, w / 2 + 2, -h * 0.6, w / 2, -4);
    ctx.quadraticCurveTo(w * 0.44, 1, w * 0.32, 0);
    ctx.quadraticCurveTo(w * 0.26, 9, w * 0.19, 0);
    ctx.lineTo(-w * 0.06, 0);
    ctx.quadraticCurveTo(-w * 0.12, 11, -w * 0.19, 0);
    ctx.quadraticCurveTo(-w * 0.43, 2, -w / 2, -4);
    ctx.closePath();
  };
}

// ---- Shared parts ----








function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
