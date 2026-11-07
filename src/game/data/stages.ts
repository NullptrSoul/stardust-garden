/** Time of day for a stage: tints the whole battlefield. */
export type StageTint = 'day' | 'dusk' | 'night' | 'starry';

/**
 * One short level. Every stage is its own run: weapons, items and levels start
 * over. Later stages hit harder but hand out more starting shards.
 */
export interface StageDef {
  id: string;
  name: string;
  waves: number;
  /** Seconds per regular wave, by wave number; boss waves ignore this. */
  waveTime: number[];
  /** Boss ids by wave number (1-based). Boss waves last until every boss is down. */
  bosses: Record<number, string[]>;
  /** A timed wave packed with elites. */
  eliteRush?: number;
  /** Monsters that can spawn here; undefined means everything unlocked by difficulty. */
  enemies?: string[];
  /** Monsters fight as if this many waves later than the wave number (eased in over waves 1–4). */
  level: number;
  /**
   * Boss HP multiplier by wave (default 1). Lets the first boss go easy and a
   * chapter's last boss stand up to a finished build.
   */
  bossHp?: Record<number, number>;
  startShards: number;
  tint: StageTint;
}

/** Which battlefield a chapter is fought on. */
export type ChapterTheme = 'garden' | 'marsh';

export interface ChapterDef {
  id: number;
  name: string;
  theme: ChapterTheme;
  stages: StageDef[];
}

export const CHAPTERS: ChapterDef[] = [
  {
    id: 1,
    name: '星屑庭院',
    theme: 'garden',
    stages: [
      {
        id: '1-1',
        name: '花园入口',
        waves: 6,
        waveTime: [20, 22, 25, 25, 28],
        bosses: { 6: ['king'] },
        enemies: ['slime', 'imp', 'mushroom'],
        level: 0,
        bossHp: { 6: 0.45 },
        startShards: 0,
        tint: 'day',
      },
      {
        id: '1-2',
        name: '蘑菇小径',
        waves: 7,
        waveTime: [22, 25, 25, 28, 30, 30, 35],
        bosses: {},
        eliteRush: 7,
        enemies: ['slime', 'imp', 'mushroom', 'bunny', 'thief'],
        level: 1,
        startShards: 20,
        tint: 'day',
      },
      {
        id: '1-3',
        name: '黄昏回廊',
        waves: 8,
        waveTime: [25, 25, 28, 28, 30, 32, 35],
        bosses: { 8: ['darkKnight'] },
        level: 2,
        bossHp: { 8: 1.3 },
        startShards: 35,
        tint: 'dusk',
      },
      {
        id: '1-4',
        name: '月下花海',
        waves: 9,
        waveTime: [25, 28, 28, 30, 32, 35, 35, 38],
        bosses: { 9: ['darkKnight', 'king'] },
        level: 3,
        bossHp: { 9: 1.5 },
        startShards: 50,
        tint: 'night',
      },
      {
        id: '1-5',
        name: '星之庭院',
        waves: 10,
        waveTime: [25, 28, 30, 32, 0, 35, 38, 40, 42],
        bosses: { 5: ['king'], 10: ['queen'] },
        level: 3,
        bossHp: { 10: 1.5 },
        startShards: 60,
        tint: 'starry',
      },
    ],
  },
  {
    id: 2,
    name: '雾沼废城',
    theme: 'marsh',
    stages: [
      {
        id: '2-1',
        name: '雾沼入口',
        waves: 6,
        waveTime: [25, 28, 28, 30, 32, 35],
        bosses: {},
        eliteRush: 6,
        enemies: ['leech', 'frog', 'slime', 'imp'],
        level: 4,
        startShards: 70,
        tint: 'day',
      },
      {
        id: '2-2',
        name: '腐木栈道',
        waves: 7,
        waveTime: [25, 28, 30, 30, 32, 35],
        bosses: { 7: ['toad'] },
        enemies: ['leech', 'frog', 'wisp', 'imp', 'mushroom', 'thief'],
        level: 5,
        bossHp: { 7: 1.4 },
        startShards: 85,
        tint: 'dusk',
      },
      {
        id: '2-3',
        name: '沉没神殿',
        waves: 8,
        waveTime: [28, 30, 30, 32, 32, 35, 38],
        bosses: { 8: ['king', 'toad'] },
        enemies: ['leech', 'frog', 'wisp', 'golem', 'bunny', 'thief'],
        level: 6,
        bossHp: { 8: 1.2 },
        startShards: 100,
        tint: 'night',
      },
      {
        id: '2-4',
        name: '瘴气王城',
        waves: 9,
        waveTime: [28, 30, 32, 32, 35, 35, 38, 40],
        bosses: { 9: ['queen'] },
        enemies: ['leech', 'frog', 'wisp', 'golem', 'knight', 'twin', 'thief'],
        level: 7,
        bossHp: { 9: 0.7 },
        startShards: 140,
        tint: 'night',
      },
      {
        id: '2-5',
        name: '毒王之座',
        waves: 10,
        waveTime: [30, 32, 32, 35, 0, 35, 38, 40, 42],
        bosses: { 5: ['darkKnight'], 10: ['toad'] },
        level: 7,
        bossHp: { 5: 0.8, 10: 2.2 },
        startShards: 120,
        tint: 'starry',
      },
    ],
  },
];

export const ALL_STAGES: StageDef[] = CHAPTERS.flatMap((c) => c.stages);

export function stageById(id: string): StageDef {
  const s = ALL_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown stage: ${id}`);
  return s;
}

export function chapterOfStage(stage: StageDef): number {
  return Number(stage.id.split('-')[0]) || 1;
}

export function chapterById(id: number): ChapterDef {
  return CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
}

export function nextStage(id: string): StageDef | null {
  const i = ALL_STAGES.findIndex((x) => x.id === id);
  return i >= 0 ? (ALL_STAGES[i + 1] ?? null) : null;
}

/** Star bits: cleared, cleared with at least half HP, cleared without a revive. */
export const STAR_CLEAR = 1;
export const STAR_HEALTHY = 2;
export const STAR_NO_REVIVE = 4;
export const STAR_LABELS = ['通关', '通关时生命过半', '没有复活'];

export function starCount(mask: number): number {
  return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
}
