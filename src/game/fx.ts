/** Purely visual effects. Uses Math.random: none of this affects gameplay. */

/**
 * dot: small round spark. shard: spinning triangle. puff: smoke ball that grows
 * and fades. star: four-point impact sparkle. ring: expanding outline circle.
 */
export type ParticleKind = 'dot' | 'shard' | 'puff' | 'star' | 'ring';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  /** Size change per second. */
  grow: number;
  color: string;
  rot: number;
  vr: number;
  /** Velocity damping per second. */
  drag: number;
  gravity: number;
  /** Drawn additively (light) instead of as paint. */
  glow: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

const MAX_PARTICLES = 900;
const MAX_TEXTS = 60;

type SpawnOptions = Partial<Omit<Particle, 'kind' | 'x' | 'y' | 'maxLife'>> & { life: number; size: number };

export class Fx {
  readonly particles: Particle[] = [];
  readonly texts: FloatText[] = [];
  private readonly pool: Particle[] = [];
  private shake = 0;
  private kickX = 0;
  private kickY = 0;
  offsetX = 0;
  offsetY = 0;
  /** Defense line flash after a hit, 1 fading to 0. */
  lineFlash = 0;

  /** Light sparks thrown out of a surface, in a cone around its normal. */
  spark(x: number, y: number, nx: number, ny: number, color: string, count: number, speed: number, life: number): void {
    const base = Math.atan2(ny, nx);
    for (let i = 0; i < count; i++) {
      const a = base + (Math.random() - 0.5) * 2.2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn('dot', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: 3 + Math.random() * 3,
        life: life * (0.6 + Math.random() * 0.6),
        color,
        drag: 6,
        glow: true,
      });
    }
  }

  burst(x: number, y: number, color: string, count: number, speed: number, size: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawn('dot', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: size * (0.6 + Math.random() * 0.6),
        life: life * (0.6 + Math.random() * 0.5),
        color,
        drag: 4,
        glow: true,
      });
    }
  }

  /** Cartoon hit: a white sparkle that pops and shrinks, plus a thin ring. */
  impact(x: number, y: number, size: number): void {
    this.spawn('star', x, y, { size, grow: -size * 3, life: 0.16, color: '#FFFFFF', rot: Math.random() * 0.6 });
    this.spawn('ring', x, y, { size: size * 0.4, grow: size * 7, life: 0.2, color: '#FFFFFF' });
  }

  /** A charge level-up at a wall: a ring in the glow color. */
  ring(x: number, y: number, color: string, size: number): void {
    this.spawn('ring', x, y, { size: size * 0.3, grow: size * 5, life: 0.25, color, glow: true });
  }

  /** Monster death: smoke puffs, goo droplets in its color and a few stars. */
  poof(x: number, y: number, color: string): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const s = 60 + Math.random() * 90;
      this.spawn('puff', x + Math.cos(a) * 10, y + Math.sin(a) * 10, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 30,
        size: 16 + Math.random() * 10,
        grow: 40,
        life: 0.38 + Math.random() * 0.15,
        color: '#F4F1EA',
        drag: 5,
      });
    }
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const s = 260 + Math.random() * 300;
      this.spawn('dot', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: 6 + Math.random() * 6,
        life: 0.5 + Math.random() * 0.3,
        color,
        drag: 1.5,
        gravity: 1400,
      });
    }
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn('star', x + Math.cos(a) * 26, y + Math.sin(a) * 26, {
        size: 14 + Math.random() * 8,
        grow: -30,
        life: 0.35,
        color: '#FFF4C2',
        vr: (Math.random() - 0.5) * 6,
      });
    }
  }

  text(x: number, y: number, text: string, color: string, size: number): void {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -170, life: 0.7, maxLife: 0.7, text, color, size });
  }

  addShake(amount: number): void {
    this.shake = Math.min(26, this.shake + amount);
  }

  /** Nudges the camera in one direction (recoil, a heavy swing); springs back fast. */
  kick(dx: number, dy: number): void {
    this.kickX = Math.max(-14, Math.min(14, this.kickX + dx));
    this.kickY = Math.max(-14, Math.min(14, this.kickY + dy));
  }

  /** Jelly droplets thrown along the hit direction, falling with gravity. */
  splat(x: number, y: number, dx: number, dy: number, color: string, count: number): void {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      const a = base + (Math.random() - 0.5) * 1.4;
      const s = 200 + Math.random() * 260;
      this.spawn('dot', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 120,
        size: 4 + Math.random() * 5,
        life: 0.35 + Math.random() * 0.25,
        color,
        drag: 2,
        gravity: 1300,
      });
    }
  }

  update(dt: number): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      p.size += p.grow * dt;
      if (p.life <= 0 || p.size <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        this.pool.push(p);
        continue;
      }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }

    const ts = this.texts;
    for (let i = ts.length - 1; i >= 0; i--) {
      const t = ts[i];
      t.life -= dt;
      if (t.life <= 0) {
        ts.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-5 * dt);
      t.vx *= damp;
      t.vy *= damp;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
    }

    this.lineFlash = Math.max(0, this.lineFlash - dt * 2.5);
    this.shake *= Math.exp(-dt * 10);
    if (this.shake < 0.3) this.shake = 0;
    const spring = Math.exp(-dt * 14);
    this.kickX *= spring;
    this.kickY *= spring;
    this.offsetX = (Math.random() * 2 - 1) * this.shake + this.kickX;
    this.offsetY = (Math.random() * 2 - 1) * this.shake + this.kickY;
  }

  private spawn(kind: ParticleKind, x: number, y: number, o: SpawnOptions): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    const p = this.pool.pop() ?? ({} as Particle);
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.life = o.life;
    p.maxLife = o.life;
    p.size = o.size;
    p.grow = o.grow ?? 0;
    p.color = o.color ?? '#FFFFFF';
    p.rot = o.rot ?? Math.random() * Math.PI * 2;
    p.vr = o.vr ?? (kind === 'shard' ? (Math.random() - 0.5) * 14 : 0);
    p.drag = o.drag ?? 0;
    p.gravity = o.gravity ?? 0;
    p.glow = o.glow ?? false;
    this.particles.push(p);
  }
}
