import type { ImageSource } from '../../platform/types';

/**
 * Layered character ("cutout") animation, a little like Live2D.
 *
 * tools/bake-rig.mjs turns the layer PNGs in art-source/rig/<id>/ into one
 * atlas plus the data in rigs/<id>.ts. Every part turns around a joint, and
 * the motion is all procedural: breathing, blinking, hair, skirt and tail
 * sway, arm swing and a forward lean while running.
 *
 * The art is only cut, not redrawn, so the hidden areas under each layer
 * are guessed. Keep the angles small, or holes start to show.
 */

export type JointName =
  | 'foot'
  | 'hip'
  | 'neck'
  | 'crown'
  | 'legs'
  | 'skirt'
  | 'armFront'
  | 'armBack'
  | 'sideL'
  | 'sideR'
  | 'tail';

export interface RigPart {
  /** Layer file name without .png. */
  name: string;
  /** Rectangle in the atlas. */
  sx: number;
  sy: number;
  w: number;
  h: number;
  /** Top-left corner in rig space: baked pixels, feet at 0,0. */
  x: number;
  y: number;
}

/** Motions whose strength a rig can turn down when its cut layers show gaps. */
export type RigMotionName = 'breathe' | 'lean' | 'head' | 'hair' | 'side' | 'tail' | 'skirt' | 'arms' | 'legs';

export interface RigDef {
  atlas: string;
  /** From the feet up to the top of the art, in baked pixels. */
  height: number;
  /** Back to front. */
  parts: RigPart[];
  joints: Record<JointName, [number, number]>;
  /** Strength of each motion; 1 when missing, 0 turns it off. */
  motion?: Partial<Record<RigMotionName, number>>;
}

export interface LoadedRig {
  def: RigDef;
  atlas: ImageSource;
}

/** Remembers how far into running a character is, so sway eases in and out. */
export interface RigMotion {
  blend: number;
  last: number;
}

export interface RigPose {
  time: number;
  moving: boolean;
  /** 1 right after taking damage. */
  hurt: number;
  motion?: RigMotion;
}

/** Same phase speed as the run bob in chibi.ts. */
const RUN_SPEED = 14;
const BLINK_EVERY = 3.4;
const BLINK_TIME = 0.12;

type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Rotation by `a` radians, then scale, then skew, all around point p. */
function about(p: [number, number], a: number, sx = 1, sy = 1, skew = 0): Mat {
  const c = Math.cos(a);
  const s = Math.sin(a);
  // R * S * K, where K skews x by y.
  const m: Mat = [c * sx, s * sx, (c * skew * sx) - s * sy, (s * skew * sx) + c * sy, 0, 0];
  m[4] = p[0] - (m[0] * p[0] + m[2] * p[1]);
  m[5] = p[1] - (m[1] * p[0] + m[3] * p[1]);
  return m;
}

function translate(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y];
}

/** True while the eyes should be shut. Every third blink is a double blink. */
export function isBlinking(time: number): boolean {
  const k = time % BLINK_EVERY;
  if (k < BLINK_TIME) return true;
  return Math.floor(time / BLINK_EVERY) % 3 === 0 && k > 0.22 && k < 0.22 + BLINK_TIME;
}

/**
 * The bone each layer follows. Unknown layers move with the body. A baked
 * piece named "layer@bone" follows that bone instead (see split in
 * tools/rig-config.json).
 */
const BONE: Record<string, string> = {
  legs: 'legs',
  leg_back: 'legBack',
  leg_front: 'legFront',
  tail: 'tail',
  body: 'upper',
  skirt: 'skirt',
  arm_front: 'armFront',
  arm_back: 'armBack',
  hair_back: 'hair',
  hair_side_l: 'sideL',
  hair_side_r: 'sideR',
  head: 'head',
  ears: 'head',
  eyes_open: 'head',
  eyes_closed: 'head',
  mouth_open: 'head',
  hair_front: 'head',
  accessory: 'head',
};

/**
 * Draws the rig in rig space: feet at 0,0, facing right, baked pixel units.
 * The caller sets up position, scale and facing.
 */
export function drawRig(ctx: CanvasRenderingContext2D, rig: LoadedRig, p: RigPose): void {
  const { def, atlas } = rig;
  const j = def.joints;
  const t = p.time;

  let k = p.moving ? 1 : 0;
  if (p.motion) {
    const m = p.motion;
    const dt = Math.min(0.1, Math.max(0, t - m.last));
    m.last = t;
    m.blend += (k - m.blend) * (1 - Math.exp(-dt * 8));
    k = m.blend;
  }
  const run = t * RUN_SPEED;
  const step = Math.sin(run);
  const amp = (name: RigMotionName): number => def.motion?.[name] ?? 1;
  const breathe = Math.sin(t * 2.2) * amp('breathe');

  // Angles stay small: the layers are cut from one picture, and their hidden
  // parts are only guessed. Positive angles turn clockwise, so things hanging
  // below a joint swing backwards (left), the way hair and cloth trail while
  // running right.
  // Breathing grows up from the top of the legs, so the hem stays on them.
  const upper = mul(about(j.hip, 0.05 * k * amp('lean')), about(j.legs, 0, 1 + 0.004 * breathe, 1 + 0.012 * breathe));
  const tilt = (Math.sin(t * 1.3) * 0.012 + k * (0.01 + Math.sin(run * 2) * 0.006)) * amp('head');
  const head = mul(upper, mul(translate(0, -1.2 * breathe), about(j.neck, tilt)));
  const hair = (Math.sin(t * 1.7) * 0.02 + k * (0.05 + Math.sin(run * 2) * 0.015)) * amp('hair');
  const side = amp('side');
  const arms = amp('arms');
  const swish = amp('skirt');
  const bones: Record<string, Mat> = {
    upper,
    head,
    legs: about(j.legs, 0, 1, 1, step * 0.07 * k * amp('legs')),
    // Separate legs step in turn.
    legBack: about(j.legs, 0, 1, 1, -step * 0.05 * k * amp('legs')),
    legFront: about(j.legs, 0, 1, 1, step * 0.05 * k * amp('legs')),
    tail: mul(upper, about(j.tail, (Math.sin(t * 2.1) * 0.05 + k * Math.sin(run * 0.5) * 0.05) * amp('tail'))),
    skirt: mul(
      upper,
      about(j.skirt, k * (0.012 + Math.sin(run * 2) * 0.008) * swish, 1 + (k * 0.01 + Math.sin(t * 2.2 + 0.5) * 0.005) * swish, 1),
    ),
    armFront: mul(upper, about(j.armFront, (Math.sin(t * 2.2) * 0.025 + k * step * 0.04) * arms)),
    armBack: mul(upper, about(j.armBack, (-Math.sin(t * 2.2) * 0.02 - k * step * 0.03) * arms)),
    hair: mul(head, about(j.crown, hair)),
    sideL: mul(head, about(j.sideL, (Math.sin(t * 1.9 + 1) * 0.04 + k * (0.08 + Math.sin(run * 2 + 1) * 0.03)) * side)),
    sideR: mul(head, about(j.sideR, (Math.sin(t * 1.9 + 2) * 0.04 + k * (0.08 + Math.sin(run * 2 + 2) * 0.03)) * side)),
  };

  const wince = p.hurt > 0.4;
  const hasClosed = def.parts.some((q) => q.name === 'eyes_closed');
  const shut = hasClosed && (wince || isBlinking(t));
  for (const part of def.parts) {
    if (part.name === 'eyes_open' && shut) continue;
    if (part.name === 'eyes_closed' && !shut) continue;
    if (part.name === 'mouth_open' && !wince) continue;
    const at = part.name.indexOf('@');
    const bone = at >= 0 ? part.name.slice(at + 1) : (BONE[part.name] ?? 'upper');
    const m = bones[bone] ?? IDENTITY;
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(atlas, part.sx, part.sy, part.w, part.h, part.x, part.y, part.w, part.h);
    ctx.restore();
  }
}
