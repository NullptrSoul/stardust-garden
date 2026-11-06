import type { Rect } from '../engine/ui';

/** Screen layouts shared by input (buttons) and drawing, in design units. */

export const selectCard = (i: number): Rect => ({ x: 24 + (i % 2) * 344, y: 172 + Math.floor(i / 2) * 300, w: 328, h: 284 });
export const SELECT_START: Rect = { x: 160, y: 1112, w: 400, h: 100 };

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
export const PAUSE_RESUME: Rect = { x: 150, y: 1018, w: 420, h: 100 };
export const PAUSE_QUIT: Rect = { x: 200, y: 1140, w: 320, h: 80 };

export const END_PRIMARY: Rect = { x: 160, y: 790, w: 400, h: 100 };
export const END_SECONDARY: Rect = { x: 160, y: 910, w: 400, h: 96 };
