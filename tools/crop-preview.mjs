// Crops regions of an image to separate files for a closer look.
// Usage: node tools/crop-preview.mjs <image> <outDir> name:x,y,w,h[@scale] ...
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [src, outDir, ...regions] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const meta = await sharp(src).metadata();
console.log(`${meta.width}x${meta.height}`);
for (const r of regions) {
  const [name, spec] = r.split(':');
  const [box, scale] = spec.split('@');
  const [left, top, width, height] = box.split(',').map(Number);
  const out = path.join(outDir, `${name}.png`);
  let img = sharp(src).extract({ left, top, width, height });
  if (scale) img = img.resize(Math.round(width * Number(scale)));
  await img.png().toFile(out);
  console.log(out);
}
