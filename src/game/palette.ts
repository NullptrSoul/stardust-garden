/**
 * Menus and heroines: soft anime pastels with thin colored lineart and gold accents.
 * Battlefield and monsters (since 2026-11-06): a ruined garden at dusk and
 * corrupted creatures with thick dark outlines and glowing eyes, so the fight
 * reads as dangerous and the bright heroines stand out against it.
 */
export const palette = {
  /** Default lineart: deep indigo instead of black. */
  outline: '#4B3F72',
  ink: '#3D3366',

  bgTop: '#F4F1FF',
  bgBottom: '#D9D1F7',

  // Battlefield: a ruined garden at dusk, floating over a dark void.
  // Muted mid-tone earth so dark-outlined monsters and the bright heroines both read.
  skyTop: '#120F19',
  skyMid: '#1A1524',
  skyBottom: '#251E30',
  grassTop: '#6F6A55',
  grassBottom: '#5E5947',
  grassEdge: '#48433A',
  grassLine: '#1E1A16',
  tuftDark: '#454B35',
  tuftLight: '#88845F',
  soilTop: '#4A4038',
  soilBottom: '#24201C',
  soilLine: '#16120F',
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

  // Corrupted monsters: murky bodies, thick dark outlines, glowing eyes.
  slimeLilac: '#3E6E60',
  slimePink: '#626E3C',
  slimeSky: '#5C4A76',
  bunny: '#6E625C',
  twinA: '#5C4A76',
  twinB: '#626E3C',
  cat: '#2E2A38',
  bud: '#F2C66B',
  leaf: '#7CCB8E',
  imp: '#4C3B5E',
  impHorn: '#9C82E6',
  knight: '#5E6470',
  shieldGold: '#F2C65E',

  heroCloak: '#9AA6FF',
  heroTrim: '#FFFFFF',
  heroSkin: '#FFE3D3',
  staff: '#C9A35A',

  mushroom: '#702E3E',
  mushroomStem: '#B7B297',
  // Bosses are darker and more saturated than regular monsters: they should look dangerous.
  king: '#6E1E34',
  darkKnight: '#3B3560',
  queen: '#4A2C6E',
  // Chapter 2 marsh monsters
  leech: '#4E2C38',
  frog: '#3F5A3A',
  wisp: '#5FE0C8',
  golem: '#6C6A62',
  toad: '#3B5232',
  /** Glowing eyes of elites and bosses. */
  menaceEye: '#FF3B6B',
  aura: '#3A1F5C',
  crown: '#F7D46B',
  enemyBullet: '#B6F25A',
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

/** Blend toward near-black; for the grim monsters, where indigo would look too soft. */
export function shade(hex: string, amount: number): string {
  return mix(hex, '#0E0A12', amount);
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
