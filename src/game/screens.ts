import type { Rect } from '../engine/ui';

/** Screen layouts shared by input (buttons) and drawing, in design units. */

export const selectCard = (i: number): Rect => ({ x: 24 + (i % 2) * 344, y: 150 + Math.floor(i / 2) * 300, w: 328, h: 284 });
export const SELECT_START: Rect = { x: 160, y: 1112, w: 400, h: 100 };
export const SELECT_BACK: Rect = { x: 18, y: 66, w: 120, h: 60 };

export const TITLE_STORY: Rect = { x: 160, y: 852, w: 400, h: 100 };
export const TITLE_ENDLESS: Rect = { x: 160, y: 1000, w: 400, h: 96 };
/** The trophy next to the endless button opens the leaderboard. */
export const TITLE_RANK: Rect = { x: 580, y: 1000, w: 96, h: 96 };
export const TITLE_TALENTS: Rect = { x: 18, y: 30, w: 130, h: 60 };
export const TITLE_SETTINGS: Rect = { x: 572, y: 30, w: 130, h: 60 };

/** Settings: one toggle row per option, then the progress reset. */
export const settingsRow = (i: number): Rect => ({ x: 90, y: 250 + i * 112, w: 540, h: 92 });
export const SETTINGS_RESET: Rect = { x: 140, y: 960, w: 440, h: 84 };
export const PAUSE_SETTINGS: Rect = { x: 540, y: 166, w: 130, h: 56 };

/** Centers of the stage nodes on the chapter map, winding up from the bottom. */
export const STAGE_NODE_CENTERS: Array<[number, number]> = [
  [190, 1030],
  [520, 870],
  [210, 710],
  [510, 550],
  [330, 380],
];
export const stageNode = (i: number): Rect => {
  const [x, y] = STAGE_NODE_CENTERS[i];
  return { x: x - 100, y: y - 66, w: 200, h: 210 };
};

export const CHAPTER_PREV: Rect = { x: 18, y: 1180, w: 160, h: 56 };
export const CHAPTER_NEXT: Rect = { x: 542, y: 1180, w: 160, h: 56 };

export const talentCard = (i: number): Rect => ({ x: 30 + (i % 2) * 340, y: 240 + Math.floor(i / 2) * 250, w: 320, h: 230 });

export const PAUSE_BUTTON: Rect = { x: 640, y: 22, w: 66, h: 66 };
/** Bottom-right, under the right thumb. */
export const SKILL_BUTTON: Rect = { x: 572, y: 1092, w: 136, h: 136 };

export const upgradeCard = (i: number): Rect => ({ x: 70, y: 330 + i * 178, w: 580, h: 158 });

export const offerCard = (i: number): Rect => ({ x: 24 + (i % 2) * 344, y: 236 + Math.floor(i / 2) * 354, w: 328, h: 340 });
export const offerLock = (i: number): Rect => {
  const c = offerCard(i);
  return { x: c.x + c.w - 64, y: c.y + 8, w: 56, h: 56 };
};
export const SHOP_STATS: Rect = { x: 584, y: 160, w: 116, h: 60 };
export const shopSlot = (i: number): Rect => ({ x: 30 + i * 112, y: 1000, w: 100, h: 100 });
export const SHOP_SELL: Rect = { x: 430, y: 944, w: 266, h: 48 };
export const SHOP_REROLL: Rect = { x: 24, y: 1132, w: 212, h: 96 };
export const SHOP_AD: Rect = { x: 248, y: 1132, w: 190, h: 96 };
export const SHOP_NEXT: Rect = { x: 450, y: 1132, w: 246, h: 96 };

export const CHEST_KEEP: Rect = { x: 100, y: 880, w: 250, h: 100 };
export const CHEST_SELL: Rect = { x: 370, y: 880, w: 250, h: 100 };

export const PAUSE_PANEL: Rect = { x: 30, y: 130, w: 660, h: 1120 };
export const PAUSE_RESUME: Rect = { x: 150, y: 1052, w: 420, h: 90 };
export const PAUSE_QUIT: Rect = { x: 200, y: 1158, w: 320, h: 72 };

export const END_PRIMARY: Rect = { x: 160, y: 790, w: 400, h: 100 };
export const END_SECONDARY: Rect = { x: 160, y: 910, w: 400, h: 96 };
/** The leaderboard line on the end screen; tappable to pick a name or retry. */
export const END_RANK: Rect = { x: 120, y: 714, w: 480, h: 42 };
/** A guest's run needs an account to go on the board: register or log in right there. */
export const END_RANK_REGISTER: Rect = { x: 360, y: 714, w: 112, h: 42 };
export const END_RANK_LOGIN: Rect = { x: 482, y: 714, w: 112, h: 42 };

/** Leaderboard screen. */
export const BOARD_TAB_ALL: Rect = { x: 150, y: 150, w: 200, h: 64 };
export const BOARD_TAB_WEEK: Rect = { x: 370, y: 150, w: 200, h: 64 };
export const boardRow = (i: number): Rect => ({ x: 40, y: 254 + i * 58, w: 640, h: 52 });
export const BOARD_NAME: Rect = { x: 160, y: 1160, w: 400, h: 76 };
/** Account buttons under the board: guest name / register / log in, or log out in the middle. */
/** Register and log in, side by side, for guests. */
export const BOARD_PAIR: Rect[] = [
  { x: 110, y: 1164, w: 240, h: 72 },
  { x: 370, y: 1164, w: 240, h: 72 },
];
export const BOARD_ACCOUNT: Rect[] = [
  { x: 40, y: 1164, w: 200, h: 72 },
  { x: 260, y: 1164, w: 200, h: 72 },
  { x: 480, y: 1164, w: 200, h: 72 },
];
