/**
 * Fixed design resolution (portrait). The renderer scales it to fit the screen,
 * so all UI code works in these units.
 */
export const DESIGN_W = 720;
export const DESIGN_H = 1280;

/**
 * The walkable part of the floating garden island, in world units.
 * It is bigger than the screen; the camera follows the player.
 */
export const ARENA = { x: 0, y: 0, w: 1500, h: 2200 };
export const ARENA_RIGHT = ARENA.x + ARENA.w;
export const ARENA_BOTTOM = ARENA.y + ARENA.h;
export const ARENA_CX = ARENA.x + ARENA.w / 2;
export const ARENA_CY = ARENA.y + ARENA.h / 2;

/** How far the camera may show past the arena edge (sky and cliffs). */
export const VIEW_MARGIN_X = 150;
export const VIEW_MARGIN_TOP = 230;
export const VIEW_MARGIN_BOTTOM = 170;

/** The HUD covers this much of the top of the screen. */
export const HUD_HEIGHT = 170;
