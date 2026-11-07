/**
 * Every elite rolls one affix: a visible name, an aura color and a twist on
 * how it fights, so elites feel like threats rather than just bigger slimes.
 */
export type EliteAffix = 'frenzy' | 'armored' | 'regen' | 'volatile';

export const AFFIXES: Record<EliteAffix, { name: string; color: string; desc: string }> = {
  frenzy: { name: '狂暴', color: '#FF4B5C', desc: '移动快得多' },
  armored: { name: '坚甲', color: '#F2B640', desc: '受到伤害 -40%，不会被击退' },
  regen: { name: '再生', color: '#3FD47F', desc: '一直回血，要集中火力' },
  volatile: { name: '爆裂', color: '#FF8A3D', desc: '死后原地爆炸，快躲开' },
};

export const AFFIX_LIST = Object.keys(AFFIXES) as EliteAffix[];

export const FRENZY_SPEED = 1.45;
/** Share of damage an armored elite still takes. */
export const ARMOR_TAKEN = 0.6;
/** Share of max HP a regenerating elite heals per second. */
export const REGEN_PER_SEC = 0.04;
export const BLAST_RADIUS = 115;
/** Seconds between a volatile elite's death and the blast. */
export const BLAST_DELAY = 0.9;
