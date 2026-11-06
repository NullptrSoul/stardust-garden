/**
 * Minimal canvas buttons. WeChat mini games have no DOM, so all in-game UI
 * is drawn on the canvas and hit-tested here in design coordinates.
 */

/** card: the renderer draws it custom; the others get a standard button look. */
export type ButtonStyle = 'primary' | 'secondary' | 'ad' | 'card';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Button extends Rect {
  label: string;
  style: ButtonStyle;
  visible: boolean;
  /** Greyed out but still tappable (so it can explain why). */
  disabled: boolean;
  onClick: () => void;
}

/** Extra touch area around each button, in design units. */
const SLOP = 8;

export class ButtonSet {
  readonly list: Button[] = [];

  add(rect: Rect, label: string, style: ButtonStyle, onClick: () => void): Button {
    const b: Button = { ...rect, label, style, visible: true, disabled: false, onClick };
    this.list.push(b);
    return b;
  }

  clear(): void {
    this.list.length = 0;
  }

  hit(x: number, y: number): Button | null {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (!b.visible) continue;
      if (x >= b.x - SLOP && x <= b.x + b.w + SLOP && y >= b.y - SLOP && y <= b.y + b.h + SLOP) {
        return b;
      }
    }
    return null;
  }
}

/** Rounded-rect path built from arcTo, since ctx.roundRect isn't available everywhere. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
