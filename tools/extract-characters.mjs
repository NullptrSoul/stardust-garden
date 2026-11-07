// Cuts character art out of the reference sheets in art-source/.
// Usage: node tools/extract-characters.mjs [previewDir]
//
// Writes public/characters/<id>/chibi.png, portrait.png and avatar.png.
// The sheets' backgrounds are pale bluish lavender or near white, while the
// characters' whites lean warm or neutral. A flood fill from the crop border
// removes only background that touches the edge, so whites inside the outlines
// survive. Small loose bits (hearts, sparkles, notes, the back-view sketches)
// are dropped afterwards by keeping only big connected pieces.
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SHEETS = {
  // First sheet: big lineup on top, chibis along the bottom.
  ref: 'art-source/characters-reference.webp',
  // Second sheet: one panel per character with full body, face, back view, chibi.
  sheet: 'art-source/characters-sheet.webp',
};
const OUT = 'public/characters';
const previewDir = process.argv[2];

/**
 * Boxes are [x, y, w, h] on the 1536x1024 sheets.
 * white: brightness above which grey-white counts as background (stricter for white outfits).
 */
const JOBS = [
  // Bailan's second-sheet chibi has no logo-shaped prop, unlike the first sheet.
  { id: 'bailan', kind: 'chibi', src: 'sheet', box: [12, 556, 182, 212], white: 250, grow: { light: 215, step: 18 } },
  { id: 'ziling', kind: 'chibi', src: 'ref', box: [300, 684, 248, 258] },
  { id: 'jinti', kind: 'chibi', src: 'ref', box: [525, 686, 256, 258] },
  { id: 'juyan', kind: 'chibi', src: 'ref', box: [772, 690, 232, 250] },
  { id: 'qinglan', kind: 'chibi', src: 'ref', box: [998, 686, 255, 254] },
  { id: 'shenxi', kind: 'chibi', src: 'ref', box: [1248, 686, 262, 254] },

  { id: 'ziling', kind: 'portrait', src: 'sheet', box: [286, 92, 172, 470], light: 224 },
  { id: 'jinti', kind: 'portrait', src: 'sheet', box: [520, 38, 170, 522], light: 224, grow: { light: 205, step: 22 } },
  { id: 'juyan', kind: 'portrait', src: 'sheet', box: [782, 116, 192, 444], light: 224, grow: { light: 205, step: 22 } },
  { id: 'qinglan', kind: 'portrait', src: 'sheet', box: [1026, 136, 176, 424], light: 224 },
  { id: 'shenxi', kind: 'portrait', src: 'sheet', box: [1280, 116, 170, 446], light: 224 },

  { id: 'bailan', kind: 'avatar', src: 'sheet', box: [178, 70, 104, 104] },
  { id: 'ziling', kind: 'avatar', src: 'sheet', box: [418, 70, 104, 104] },
  { id: 'jinti', kind: 'avatar', src: 'sheet', box: [678, 70, 104, 104] },
  { id: 'juyan', kind: 'avatar', src: 'sheet', box: [933, 70, 104, 104] },
  { id: 'qinglan', kind: 'avatar', src: 'sheet', box: [1180, 70, 104, 104] },
  { id: 'shenxi', kind: 'avatar', src: 'sheet', box: [1426, 80, 104, 104] },
];

/** Background test: either a pale bluish lavender, or near-pure white. */
function isBackground(r, g, b, light, white) {
  const lum = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (lum > white && sat < 20) return true;
  return lum > light && sat < 48 && b - r >= 3;
}

async function cutout(src, box, opts) {
  const [left, top, width, height] = box;
  const { data, info } = await sharp(src)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const lumAt = (i) => (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  const diff = (a, b) =>
    Math.abs(data[a * 4] - data[b * 4]) + Math.abs(data[a * 4 + 1] - data[b * 4 + 1]) + Math.abs(data[a * 4 + 2] - data[b * 4 + 2]);
  // Fixed rule: matches the sheet's known background colors.
  const test = (i) => isBackground(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], opts.light, opts.white);
  // Grow rule (opts.grow): any light pixel that differs only a little from the
  // background pixel next to it. Follows tinted or gradient panels, stops at lineart.
  const grows = (from, to) => opts.grow && lumAt(to) > opts.grow.light && diff(from, to) < opts.grow.step;
  const seed = (i, from) => {
    if (bg[i]) return;
    if (test(i) || (from >= 0 && grows(from, i)) || (from < 0 && opts.grow && lumAt(i) > opts.grow.light)) {
      bg[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x, -1);
    seed((h - 1) * w + x, -1);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w, -1);
    seed(y * w + w - 1, -1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    if (x > 0) seed(i - 1, i);
    if (x < w - 1) seed(i + 1, i);
    if (i >= w) seed(i - w, i);
    if (i < n - w) seed(i + w, i);
  }

  // Keep only big connected pieces of the character.
  const label = new Int32Array(n).fill(-1);
  const sizes = [];
  for (let s = 0; s < n; s++) {
    if (bg[s] || label[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    head = 0;
    tail = 0;
    queue[tail++] = s;
    label[s] = id;
    while (head < tail) {
      const i = queue[head++];
      size++;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (bg[j] || label[j] >= 0) continue;
          label[j] = id;
          queue[tail++] = j;
        }
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(...sizes);
  const keep = sizes.map((s) => s >= largest * opts.keepRatio);

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < n; i++) {
    const solid = !bg[i] && keep[label[i]];
    if (!solid) {
      data[i * 4 + 3] = 0;
      continue;
    }
    const x = i % w;
    const y = (i - x) / w;
    // Soften the pale anti-aliased rim so no light halo shows on darker floors.
    const touchesBg =
      (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < n - w && bg[i + w]);
    if (touchesBg) {
      const lum = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
      if (lum > opts.light - 25) data[i * 4 + 3] = 110;
    }
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const pad = 4;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad + 1) - cx;
  const ch = Math.min(h, maxY + pad + 1) - cy;
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).extract({ left: cx, top: cy, width: cw, height: ch }).png();
}

const written = { chibi: [], portrait: [], avatar: [] };
for (const job of JOBS) {
  // Characters with layered art get their stills from tools/bake-rig.mjs.
  if (existsSync(path.join('art-source/rig', job.id))) continue;
  const dir = path.join(OUT, job.id);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${job.kind}.png`);
  const src = SHEETS[job.src];
  if (job.kind === 'avatar') {
    const [left, top, width, height] = job.box;
    await sharp(src).extract({ left, top, width, height }).resize(160, 160, { kernel: 'lanczos3' }).png().toFile(file);
  } else {
    const img = await cutout(src, job.box, {
      light: job.light ?? 214,
      white: job.white ?? 238,
      grow: job.grow,
      keepRatio: job.kind === 'portrait' ? 0.08 : 0.06,
    });
    await img.toFile(file);
  }
  const m = await sharp(file).metadata();
  console.log(`${job.id} ${job.kind}: ${m.width}x${m.height}`);
  written[job.kind].push(file);
}

// Review sheets: every cutout on a dark checkerboard so leftover background shows up.
if (previewDir) {
  await mkdir(previewDir, { recursive: true });
  for (const [kind, files] of Object.entries(written)) {
    const cell = kind === 'portrait' ? 560 : kind === 'chibi' ? 300 : 180;
    const width = cell * files.length;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${cell}">
      <defs><pattern id="c" width="24" height="24" patternUnits="userSpaceOnUse">
      <rect width="24" height="24" fill="#3a3550"/><rect width="12" height="12" fill="#55507a"/><rect x="12" y="12" width="12" height="12" fill="#55507a"/>
      </pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`;
    const layers = files.map((input, i) => ({ input, left: i * cell + 10, top: 10 }));
    const out = path.join(previewDir, `${kind}-review.png`);
    await sharp(Buffer.from(svg)).composite(layers).png().toFile(out);
    console.log(`preview: ${out}`);
  }
}
