/**
 * Chapter 1 palette: soft anime chibi style, "starlight courtyard".
 * Pastel lavender scene, thin colored lineart (never pure black), gold accents.
 * Rule from the design doc still holds: hue means element, brightness means charge.
 */
export const palette = {
  /** Default lineart: deep indigo instead of black. */
  outline: '#4B3F72',
  ink: '#3D3366',

  bgTop: '#F4F1FF',
  bgBottom: '#D9D1F7',

  // Floating garden island
  // Dusk tones: darker and a bit more saturated, so monsters and effects pop.
  skyTop: '#9C8AD6',
  skyMid: '#A99CDC',
  skyBottom: '#D7A6C8',
  grassTop: '#96C795',
  grassBottom: '#79B283',
  grassEdge: '#B9DDAE',
  grassLine: '#4E8160',
  tuftDark: '#5E9A6C',
  tuftLight: '#B8DDAE',
  soilTop: '#C9A385',
  soilBottom: '#97705A',
  soilLine: '#6E5040',
  floor: '#DAD4F6',
  floorAlt: '#E3DEFA',
  gold: '#E2B65C',
  goldLight: '#FFE7A8',
  frameLine: '#B9A8F0',
  marble: '#F7F4FF',

  /** Light balls and the light core. */
  ball: '#FFFFFF',
  ballGlow: '#FFCF66',
  ballPink: '#FFB3D6',
  /** Defense line. */
  barrier: '#B48CFF',
  danger: '#FF5C8A',

  // Monsters stay pink / lilac / blue so they stand out on the green island.
  slimeLilac: '#C5B0FF',
  slimePink: '#FFB5D0',
  slimeSky: '#A8D8FF',
  bunny: '#FFF3F7',
  twinA: '#C5B0FF',
  twinB: '#FFB5D0',
  cat: '#B7B0D6',
  bud: '#FF9EC4',
  leaf: '#7CCB8E',
  imp: '#FFB59C',
  impHorn: '#9C82E6',
  knight: '#AEB9FF',
  shieldGold: '#F2C65E',

  heroCloak: '#9AA6FF',
  heroTrim: '#FFFFFF',
  heroSkin: '#FFE3D3',
  staff: '#C9A35A',

  mushroom: '#FF9FB0',
  mushroomStem: '#FFF1E0',
  // Bosses are darker and more saturated than regular monsters: they should look dangerous.
  king: '#D9578E',
  darkKnight: '#3B3560',
  queen: '#7A56D0',
  /** Glowing eyes of elites and bosses. */
  menaceEye: '#FF3B6B',
  aura: '#3A1F5C',
  crown: '#F7D46B',
  enemyBullet: '#FF7BAC',
  shard: '#9FD8FF',

  cream: '#FFFFFF',
  text: '#FFFFFF',
  textDark: '#3D3366',
  textDim: 'rgba(61, 51, 102, 0.6)',
};

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Blend toward deep indigo; used for lineart in each shape's own hue. */
export function darken(hex: string, amount: number): string {
  return mix(hex, '#2E2257', amount);
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, '#FFFFFF', amount);
}

function mix(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  const out = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
