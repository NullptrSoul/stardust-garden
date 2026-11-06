// Prints the size of an image and the colors at a few points.
// Usage: node tools/probe-image.mjs <image> x,y [x,y ...]
import sharp from 'sharp';

const [src, ...points] = process.argv.slice(2);
const img = sharp(src);
const meta = await img.metadata();
const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
console.log(`${meta.width}x${meta.height} ${meta.format}`);
for (const p of points) {
  const [x, y] = p.split(',').map(Number);
  const i = (y * info.width + x) * 4;
  console.log(`${x},${y}: rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`);
}
