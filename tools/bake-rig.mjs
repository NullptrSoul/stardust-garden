// Bakes a character's layered art into one small atlas plus joint data.
// Usage: node tools/bake-rig.mjs [id ...] [--debug <dir>]
//
// Input:  art-source/rig/<id>/*.png, all layers the same size and aligned
//         (see docs/art-spec.md, "分层小人").
// Output: public/characters/<id>/rig.png   the atlas
//         public/characters/<id>/chibi.png, portrait.png, avatar.png  stills
//         src/game/art/rigs/<id>.ts        part rectangles and joints
//         src/game/art/rigs/index.ts       list of all baked rigs
//
// Each layer is first grown a few pixels into the area that the layers above
// it cover. That hides the growth in the still pose, but closes the hairline
// seams that appear once the layers are shrunk and moved.
// Joints come from simple rules on the layer shapes; tools/rig-config.json
// can override any of them in source pixels.
//
// Config per character (all optional):
//   scale        baked size / source size
//   order        layer stack, back to front
//   joints       { name: [x, y] } in source pixels
//   split        [{ layer, box: [x0, y0, x1, y1] | poly: [[x, y], ...], bone }]:
//                pixels of a layer inside the box or polygon move with another
//                bone. Rules run in order, so a later box takes what is left.
//                Fixes bits that the cutting put in the wrong layer, without
//                changing the still pose (the piece keeps its place in the stack).
//   eyesClosed   "generate": replace eyes_closed.png with skin painted over
//                the open eyes plus a lash line.
//   avatar       [x, y, size]: square around the face for avatar.png;
//                avatarBg sets its background color
//   follow       { layer: bone }: a whole layer follows another bone, e.g.
//                long back hair that is too rough to sway on its own
//   motion       { hair: 0, tail: 0.5, ... }: strength of each motion, default 1
//                (names in src/game/art/rig.ts, RigMotionName).
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'art-source/rig';
const OUT_IMG = 'public/characters';
const OUT_TS = 'src/game/art/rigs';
const CONFIG = JSON.parse(await readFile('tools/rig-config.json', 'utf8'));

/** Back to front. 'eyes' and 'mouth' are slots that hold swappable layers. */
const DEFAULT_ORDER = [
  'tail', 'hair_back', 'leg_back', 'arm_back', 'legs', 'leg_front', 'body', 'skirt', 'head', 'eyes', 'mouth',
  'hair_side_l', 'hair_side_r', 'hair_front', 'ears', 'accessory', 'arm_front',
];
const SLOTS = { eyes: ['eyes_open', 'eyes_closed'], mouth: ['mouth_open'] };
const GROW = 4;
const PAD = 2;

const args = process.argv.slice(2);
const debugAt = args.indexOf('--debug');
const debugDir = debugAt >= 0 ? args[debugAt + 1] : null;
const ids = args.filter((a, i) => !a.startsWith('--') && (debugAt < 0 || i !== debugAt + 1));
const targets = ids.length ? ids : (await readdir(SRC, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

for (const id of targets) await bake(id);
await writeIndex();

async function bake(id) {
  const cfg = CONFIG[id] ?? {};
  const scale = cfg.scale ?? 0.4;
  const order = (cfg.order ?? DEFAULT_ORDER).flatMap((name) => SLOTS[name] ?? [name]);
  const dir = path.join(SRC, id);
  const layers = [];
  let W = 0;
  let H = 0;
  for (const name of order) {
    const file = path.join(dir, `${name}.png`);
    if (!existsSync(file)) continue;
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (W && (info.width !== W || info.height !== H)) {
      throw new Error(`${id}/${name}.png is ${info.width}x${info.height}, the other layers are ${W}x${H}`);
    }
    W = info.width;
    H = info.height;
    layers.push({ name, data });
  }
  for (const need of ['body', 'head']) {
    if (!layers.some((l) => l.name === need)) throw new Error(`${id}: missing ${need}.png`);
  }
  if (cfg.eyesClosed === 'generate') makeClosedEyes(layers, W, H);
  await writeStills(id, cfg, layers, W, H);

  const shapes = Object.fromEntries(layers.map((l) => [l.name, shape(l.data, W, H)]));
  const joints = findJoints(shapes, cfg.joints ?? {});
  for (const rule of cfg.split ?? []) splitLayer(layers, rule, W);
  for (const l of layers) {
    const bone = cfg.follow?.[l.name];
    if (bone) l.name = `${l.name}@${bone}`;
  }

  // Grow each piece under the pieces drawn above it, after splitting, so the
  // cut edges get covered too.
  const above = new Uint8Array(W * H);
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.name !== 'eyes_closed' && l.name !== 'mouth_open') grow(l.data, W, H, above);
    for (let p = 0; p < W * H; p++) if (alphaAt(layers[i].data, p) > 0) above[p] = 1;
  }
  for (const l of layers) shapes[l.name] = shape(l.data, W, H);
  const foot = joints.foot;

  // Shrink each part and pack them into rows.
  const parts = [];
  for (const l of layers) {
    const b = shapes[l.name].box;
    if (!b) continue;
    const x0 = Math.max(0, b[0] - 1);
    const y0 = Math.max(0, b[1] - 1);
    const x1 = Math.min(W - 1, b[2] + 1);
    const y1 = Math.min(H - 1, b[3] + 1);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const w = Math.max(1, Math.round(bw * scale));
    const h = Math.max(1, Math.round(bh * scale));
    const png = await sharp(l.data, { raw: { width: W, height: H, channels: 4 } })
      .extract({ left: x0, top: y0, width: bw, height: bh })
      .resize(w, h, { kernel: 'lanczos3' })
      .png()
      .toBuffer();
    parts.push({ name: l.name, png, w, h, x: (x0 - foot[0]) * scale, y: (y0 - foot[1]) * scale });
  }
  const sheetW = 1024;
  let cx = PAD;
  let cy = PAD;
  let rowH = 0;
  for (const p of [...parts].sort((a, b) => b.h - a.h)) {
    if (cx + p.w + PAD > sheetW) {
      cx = PAD;
      cy += rowH + PAD;
      rowH = 0;
    }
    p.sx = cx;
    p.sy = cy;
    cx += p.w + PAD;
    rowH = Math.max(rowH, p.h);
  }
  const sheetH = cy + rowH + PAD;
  const outDir = path.join(OUT_IMG, id);
  await mkdir(outDir, { recursive: true });
  const atlas = path.join(outDir, 'rig.png');
  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(parts.map((p) => ({ input: p.png, left: p.sx, top: p.sy })))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(atlas);

  // Height from the top of the art down to the feet, in baked pixels.
  let top = H;
  for (const s of Object.values(shapes)) if (s.box) top = Math.min(top, s.box[1]);
  const round = (v) => Math.round(v * 10) / 10;
  const rigJoints = Object.fromEntries(
    Object.entries(joints).map(([k, [x, y]]) => [k, [round((x - foot[0]) * scale), round((y - foot[1]) * scale)]]),
  );
  const lines = [
    `// Generated by tools/bake-rig.mjs from art-source/rig/${id}. Do not edit by hand.`,
    `import type { RigDef } from '../rig';`,
    ``,
    `export const ${id}: RigDef = {`,
    `  atlas: 'characters/${id}/rig.png',`,
    `  height: ${round((foot[1] - top) * scale)},`,
    `  parts: [`,
    ...parts.map((p) => `    { name: '${p.name}', sx: ${p.sx}, sy: ${p.sy}, w: ${p.w}, h: ${p.h}, x: ${round(p.x)}, y: ${round(p.y)} },`),
    `  ],`,
    ...(cfg.motion ? [`  motion: ${JSON.stringify(cfg.motion).replace(/"(\w+)":/g, ' $1: ').replace(/}$/, ' }')},`] : []),
    `  joints: {`,
    ...Object.entries(rigJoints).map(([k, [x, y]]) => `    ${k}: [${x}, ${y}],`),
    `  },`,
    `};`,
    ``,
  ];
  await mkdir(OUT_TS, { recursive: true });
  await writeFile(path.join(OUT_TS, `${id}.ts`), lines.join('\n'));
  const size = (await readFile(atlas)).length;
  console.log(`${id}: ${parts.length} parts, atlas ${sheetW}x${sheetH} (${Math.round(size / 1024)} KB), height ${round((foot[1] - top) * scale)}px`);
  for (const [k, v] of Object.entries(joints)) console.log(`  ${k.padEnd(10)} ${v.map(Math.round).join(', ')}${cfg.joints?.[k] ? '  (config)' : ''}`);

  if (debugDir) await debugSheet(id, W, H, layers, joints, debugDir);
}

/**
 * The still pictures the rest of the game uses come from the same layers,
 * so the character looks the same everywhere: chibi.png and portrait.png
 * (the whole figure, trimmed) and avatar.png (cfg.avatar = [x, y, size], a
 * square around the face on cfg.avatarBg).
 */
async function writeStills(id, cfg, layers, W, H) {
  const visible = layers.filter((l) => l.name !== 'eyes_closed' && l.name !== 'mouth_open');
  const whole = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(visible.map((l) => ({ input: l.data, raw: { width: W, height: H, channels: 4 } })))
    .png()
    .toBuffer();
  const trimmed = await sharp(whole).trim().png().toBuffer();
  const dir = path.join(OUT_IMG, id);
  await mkdir(dir, { recursive: true });
  await sharp(trimmed).resize({ height: 1000, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(path.join(dir, 'portrait.png'));
  await sharp(trimmed).resize({ height: 520, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(path.join(dir, 'chibi.png'));
  if (cfg.avatar) {
    const [left, top, size] = cfg.avatar;
    await sharp(whole)
      .extract({ left, top, width: size, height: size })
      .flatten({ background: cfg.avatarBg ?? '#E6E2F8' })
      .resize(256, 256, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(dir, 'avatar.png'));
  }
  console.log(`  wrote chibi.png, portrait.png${cfg.avatar ? ', avatar.png' : ''}`);
}

/** Moves the pixels of rule.layer inside rule.box into a new part that follows rule.bone. */
function splitLayer(layers, rule, W) {
  const i = layers.findIndex((l) => l.name === rule.layer);
  if (i < 0) throw new Error(`split: no layer ${rule.layer}`);
  const src = layers[i].data;
  const out = Buffer.alloc(src.length);
  const poly = rule.poly;
  const [x0, y0, x1, y1] = poly
    ? [Math.min(...poly.map((q) => q[0])), Math.min(...poly.map((q) => q[1])), Math.max(...poly.map((q) => q[0])), Math.max(...poly.map((q) => q[1]))]
    : rule.box;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = (y * W + x) * 4;
      if (src[p + 3] === 0) continue;
      if (poly && !inside(poly, x + 0.5, y + 0.5)) continue;
      src.copy(out, p, p, p + 4);
      src[p] = src[p + 1] = src[p + 2] = src[p + 3] = 0;
      n++;
    }
  }
  const name = `${rule.layer}@${rule.bone}`;
  const existing = layers.find((l) => l.name === name);
  if (existing) {
    for (let p = 0; p < out.length; p += 4) if (out[p + 3]) out.copy(existing.data, p, p, p + 4);
  } else {
    layers.splice(i + 1, 0, { name, data: out });
  }
  console.log(`  split ${n} px of ${rule.layer} to follow ${rule.bone}`);
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Builds closed eyes from the open ones: skin from around the eyes painted
 * over each eye, then a curved lash line a little below the middle.
 */
function makeClosedEyes(layers, W, H) {
  const open = layers.find((l) => l.name === 'eyes_open');
  const head = layers.find((l) => l.name === 'head');
  if (!open) return;
  const s = shape(open.data, W, H);
  const lum = (d, p) => d[p * 4] * 0.3 + d[p * 4 + 1] * 0.59 + d[p * 4 + 2] * 0.11;

  // Lash color: the darkest few percent of the open eyes.
  const dark = [];
  for (let p = 0; p < W * H; p++) if (s.pixels[p]) dark.push(p);
  dark.sort((a, b) => lum(open.data, a) - lum(open.data, b));
  const lash = [0, 0, 0];
  const nDark = Math.max(1, Math.round(dark.length * 0.03));
  for (let i = 0; i < nDark; i++) for (let c = 0; c < 3; c++) lash[c] += open.data[dark[i] * 4 + c] / nDark;

  // Patch = the open eyes grown by 4 px.
  const mask = Uint8Array.from(s.pixels);
  for (let pass = 0; pass < 4; pass++) {
    const add = [];
    for (let p = W; p < W * (H - 1); p++) {
      if (mask[p]) continue;
      const x = p % W;
      if ((x > 0 && mask[p - 1]) || (x < W - 1 && mask[p + 1]) || mask[p - W] || mask[p + W]) add.push(p);
    }
    for (const p of add) mask[p] = 1;
  }
  // Skin samples: bright head pixels in a ring 6-18 px outside the patch.
  const dist = new Float32Array(W * H).fill(Infinity);
  const queue = [];
  for (let p = 0; p < W * H; p++) if (mask[p]) (dist[p] = 0), queue.push(p);
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (dist[p] >= 18) continue;
    const x = p % W;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
      if (q < 0 || q >= W * H || dist[q] <= dist[p] + 1) continue;
      dist[q] = dist[p] + 1;
      queue.push(q);
    }
  }
  const samples = [];
  for (let p = 0; p < W * H; p++) {
    if (dist[p] < 6 || dist[p] > 18 || head.data[p * 4 + 3] < 250) continue;
    if (lum(head.data, p) < 200) continue;
    samples.push(p % W, (p / W) | 0, head.data[p * 4], head.data[p * 4 + 1], head.data[p * 4 + 2]);
  }
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    if (!mask[p]) continue;
    const x = p % W;
    const y = (p / W) | 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let wsum = 0;
    for (let i = 0; i < samples.length; i += 5) {
      const d2 = (samples[i] - x) ** 2 + (samples[i + 1] - y) ** 2;
      const w = 1 / (d2 * Math.sqrt(d2) + 1);
      r += samples[i + 2] * w;
      g += samples[i + 3] * w;
      b += samples[i + 4] * w;
      wsum += w;
    }
    out[p * 4] = r / wsum;
    out[p * 4 + 1] = g / wsum;
    out[p * 4 + 2] = b / wsum;
    out[p * 4 + 3] = 255;
  }

  // One lash curve per eye, sagging down in the middle.
  const eyes = blobs(s.pixels, W, H).filter((b) => b.n >= dark.length * 0.15);
  for (const e of eyes) {
    const [bx0, by0, bx1, by1] = e.box;
    const bw = bx1 - bx0;
    const bh = by1 - by0;
    for (let x = bx0; x <= bx1; x++) {
      const u = (x - bx0) / bw;
      if (u < 0.05 || u > 0.96) continue;
      const yc = by0 + bh * 0.55 + bh * 0.1 * (1 - (2 * u - 1) ** 2);
      const th = 1.5 + bh * 0.055 * Math.sqrt(Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.05) / 0.91))));
      for (let y = Math.floor(yc - th); y <= Math.ceil(yc + th); y++) {
        const a = Math.min(1, Math.max(0, th / 2 - Math.abs(y - yc) + 0.5));
        if (!a) continue;
        const p = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) out[p + c] = out[p + c] * (1 - a) + lash[c] * a;
        out[p + 3] = Math.max(out[p + 3], a * 255);
      }
    }
  }
  const closed = layers.find((l) => l.name === 'eyes_closed');
  if (closed) closed.data = out;
  else layers.splice(layers.indexOf(open) + 1, 0, { name: 'eyes_closed', data: out });
  console.log(`  closed eyes: ${eyes.length} eyes, ${samples.length / 5} skin samples`);
}

function blobs(on, W, H) {
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const list = [];
  for (let s = 0; s < W * H; s++) {
    if (!on[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    seen[s] = 1;
    const b = { n: 0, box: [W, H, -1, -1] };
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p / W) | 0;
      b.n++;
      if (x < b.box[0]) b.box[0] = x;
      if (y < b.box[1]) b.box[1] = y;
      if (x > b.box[2]) b.box[2] = x;
      if (y > b.box[3]) b.box[3] = y;
      if (x > 0 && on[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), (stack[sp++] = p - 1);
      if (x < W - 1 && on[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), (stack[sp++] = p + 1);
      if (y > 0 && on[p - W] && !seen[p - W]) (seen[p - W] = 1), (stack[sp++] = p - W);
      if (y < H - 1 && on[p + W] && !seen[p + W]) (seen[p + W] = 1), (stack[sp++] = p + W);
    }
    list.push(b);
  }
  return list.sort((a, b) => b.n - a.n);
}

function alphaAt(data, p) {
  return data[p * 4 + 3];
}

/** Grows the layer by GROW pixels, only into pixels that `cover` marks. */
function grow(data, W, H, cover) {
  for (let pass = 0; pass < GROW; pass++) {
    const add = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (!cover[p] || data[p * 4 + 3] > 0) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
          if (q < 0 || data[q * 4 + 3] === 0) continue;
          r += data[q * 4];
          g += data[q * 4 + 1];
          b += data[q * 4 + 2];
          a = Math.max(a, data[q * 4 + 3]);
          n++;
        }
        if (n) add.push(p, r / n, g / n, b / n, a);
      }
    }
    for (let i = 0; i < add.length; i += 5) {
      const p = add[i] * 4;
      data[p] = add[i + 1];
      data[p + 1] = add[i + 2];
      data[p + 2] = add[i + 3];
      data[p + 3] = add[i + 4];
    }
  }
}

/** Bounding box of the whole layer and of its pieces big enough to matter. */
function shape(data, W, H) {
  const on = new Uint8Array(W * H);
  let total = 0;
  for (let p = 0; p < W * H; p++) if (data[p * 4 + 3] > 16) (on[p] = 1), total++;
  if (!total) return { box: null, main: null, big: null, pixels: on };
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const blobs = [];
  for (let s = 0; s < W * H; s++) {
    if (!on[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    seen[s] = 1;
    const b = { n: 0, box: [W, H, -1, -1] };
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p / W) | 0;
      b.n++;
      if (x < b.box[0]) b.box[0] = x;
      if (y < b.box[1]) b.box[1] = y;
      if (x > b.box[2]) b.box[2] = x;
      if (y > b.box[3]) b.box[3] = y;
      if (x > 0 && on[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), (stack[sp++] = p - 1);
      if (x < W - 1 && on[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), (stack[sp++] = p + 1);
      if (y > 0 && on[p - W] && !seen[p - W]) (seen[p - W] = 1), (stack[sp++] = p - W);
      if (y < H - 1 && on[p + W] && !seen[p + W]) (seen[p + W] = 1), (stack[sp++] = p + W);
    }
    blobs.push(b);
  }
  blobs.sort((a, b) => b.n - a.n);
  const union = (list) =>
    list.reduce((u, b) => [Math.min(u[0], b.box[0]), Math.min(u[1], b.box[1]), Math.max(u[2], b.box[2]), Math.max(u[3], b.box[3])], [W, H, -1, -1]);
  return {
    box: union(blobs),
    main: blobs[0].box,
    // Pieces with at least 10% of the layer: both legs, not stray specks.
    big: union(blobs.filter((b) => b.n >= total * 0.1)),
    pixels: on,
    W,
  };
}

/** Center of the top rows of a box's pixels: where an arm or lock hangs from. */
function topCenter(s, box) {
  const [x0, y0, x1, y1] = box;
  const rows = Math.max(3, Math.round((y1 - y0) * 0.04));
  let sx = 0;
  let n = 0;
  for (let y = y0; y < y0 + rows; y++) {
    for (let x = x0; x <= x1; x++) if (s.pixels[y * s.W + x]) (sx += x), n++;
  }
  return [n ? sx / n : (x0 + x1) / 2, y0];
}

function findJoints(shapes, overrides) {
  const box = (name, key = 'main') => shapes[name]?.[key] ?? null;
  const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const head = box('head');
  const body = box('body');
  // Two separate legs count as one box.
  const pair = [box('leg_back', 'big'), box('leg_front', 'big')].filter(Boolean);
  const legs = box('legs', 'big') ?? (pair.length ? pair.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])]) : body);
  const j = {};
  j.foot = [(legs[0] + legs[2]) / 2, legs[3]];
  j.hip = [(body[0] + body[2]) / 2, body[3]];
  j.neck = [(head[0] + head[2]) / 2, head[3]];
  j.crown = [(head[0] + head[2]) / 2, head[1]];
  j.legs = shapes.legs?.box ? topCenter(shapes.legs, box('legs', 'big')) : pair.length ? [(legs[0] + legs[2]) / 2, legs[1]] : j.hip;
  j.skirt = shapes.skirt?.box ? topCenter(shapes.skirt, box('skirt')) : j.hip;
  j.armFront = shapes.arm_front?.box ? topCenter(shapes.arm_front, box('arm_front')) : center(body);
  j.armBack = shapes.arm_back?.box ? topCenter(shapes.arm_back, box('arm_back')) : center(body);
  j.sideL = shapes.hair_side_l?.box ? topCenter(shapes.hair_side_l, box('hair_side_l')) : j.crown;
  j.sideR = shapes.hair_side_r?.box ? topCenter(shapes.hair_side_r, box('hair_side_r')) : j.crown;
  j.tail = j.hip;
  if (shapes.tail?.box) {
    // The tail point closest to the hip.
    const s = shapes.tail;
    let best = Infinity;
    const [x0, y0, x1, y1] = s.main;
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        if (!s.pixels[y * s.W + x]) continue;
        const d = (x - j.hip[0]) ** 2 + (y - j.hip[1]) ** 2;
        if (d < best) (best = d), (j.tail = [x, y]);
      }
    }
  }
  for (const [k, v] of Object.entries(overrides)) j[k] = v;
  return j;
}

/** Writes the rebuilt still pose with the joints marked, for checking by eye. */
async function debugSheet(id, W, H, layers, joints, dir) {
  await mkdir(dir, { recursive: true });
  const dots = Object.entries(joints)
    .map(
      ([k, [x, y]]) =>
        `<circle cx="${x}" cy="${y}" r="9" fill="#ff2060" stroke="#fff" stroke-width="3"/>` +
        `<text x="${x + 12}" y="${y - 10}" font-size="26" font-family="sans-serif" fill="#ff2060" stroke="#fff" stroke-width="5" paint-order="stroke">${k}</text>`,
    )
    .join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${dots}</svg>`);
  const visible = layers.filter((l) => l.name !== 'eyes_closed' && l.name !== 'mouth_open');
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 236, g: 232, b: 244, alpha: 1 } } })
    .composite([...visible.map((l) => ({ input: l.data, raw: { width: W, height: H, channels: 4 } })), { input: svg }])
    .png()
    .toFile(path.join(dir, `${id}-joints.png`));
}

async function writeIndex() {
  const files = existsSync(OUT_TS) ? (await readdir(OUT_TS)).filter((f) => f.endsWith('.ts') && f !== 'index.ts') : [];
  const names = files.map((f) => f.replace(/\.ts$/, '')).sort();
  const lines = [
    `// Generated by tools/bake-rig.mjs. Do not edit by hand.`,
    `import type { RigDef } from '../rig';`,
    ...names.map((n) => `import { ${n} } from './${n}';`),
    ``,
    `/** Layered rigs by character id. Characters without one use chibi.png. */`,
    `export const RIGS: Partial<Record<string, RigDef>> = { ${names.join(', ')} };`,
    ``,
  ];
  await writeFile(path.join(OUT_TS, 'index.ts'), lines.join('\n'));
}
