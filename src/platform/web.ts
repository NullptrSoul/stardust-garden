import type {
  NoiseOptions,
  NoteOptions,
  Platform,
  PlatformAudio,
  PlatformStorage,
  PointerInput,
  PointerType,
  ToneOptions,
  Viewport,
} from './types';

export function createWebPlatform(canvas: HTMLCanvasElement): Platform {
  let vp: Viewport = { width: 1, height: 1, dpr: 1 };
  const resizeCbs: Array<() => void> = [];
  const pointerCbs: Array<(e: PointerInput) => void> = [];

  function resize(): void {
    // Cap at 2x: sharper than that costs fill rate on phones for little gain.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    vp = { width: w, height: h, dpr };
    for (const cb of resizeCbs) cb();
  }
  window.addEventListener('resize', resize);
  resize();

  function emit(type: PointerInput['type'], e: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    const input: PointerInput = {
      type,
      id: e.pointerId,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pointerType: (e.pointerType as PointerType) || 'mouse',
    };
    for (const cb of pointerCbs) cb(input);
  }
  canvas.addEventListener('pointerdown', (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; dragging still works without it.
    }
    e.preventDefault();
    emit('down', e);
  });
  canvas.addEventListener('pointermove', (e) => emit('move', e));
  canvas.addEventListener('pointerup', (e) => emit('up', e));
  canvas.addEventListener('pointercancel', (e) => emit('cancel', e));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    canvas,
    viewport: () => vp,
    onResize: (cb) => {
      resizeCbs.push(cb);
    },
    onPointer: (cb) => {
      pointerCbs.push(cb);
    },
    onKey: (cb) => {
      window.addEventListener('keydown', (e) => {
        if (!e.repeat) cb('down', e.key.toLowerCase());
      });
      window.addEventListener('keyup', (e) => cb('up', e.key.toLowerCase()));
      window.addEventListener('blur', () => cb('up', '*'));
    },
    createCanvas: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    },
    loadImage: (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Missing image: ${src}`));
        img.src = src;
      }),
    requestFrame: (cb) => {
      requestAnimationFrame(() => cb());
    },
    now: () => performance.now(),
    audio: createWebAudio(),
    storage: createWebStorage(),
  };
}

function createWebAudio(): PlatformAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let music: GainNode | null = null;
  let musicVolume = 0.6;
  let noiseBuffer: AudioBuffer | null = null;

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // A compressor keeps dozens of overlapping bounce tones from clipping.
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    comp.connect(ctx.destination);
    // Music gets its own bus so it can be faded or muted apart from sound effects.
    music = ctx.createGain();
    music.gain.value = musicVolume;
    music.connect(comp);
    return ctx;
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') void c.resume();
    },
    tone(o: ToneOptions) {
      if (!ctx || !master || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = o.type ?? 'sine';
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + o.duration);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(o.volume ?? 0.1, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + o.duration + 0.02);
    },
    noise(o: NoiseOptions) {
      if (!ctx || !master || ctx.state !== 'running') return;
      if (!noiseBuffer) {
        // One second of white noise, reused for every burst.
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = o.freq ?? 1200;
      filter.Q.value = o.q ?? 0.9;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(o.volume ?? 0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t, Math.random() * 0.8);
      src.stop(t + o.duration + 0.02);
    },
    time() {
      return ctx && ctx.state === 'running' ? ctx.currentTime : 0;
    },
    note(o: NoteOptions) {
      if (!ctx || !music || ctx.state !== 'running') return;
      const t = Math.max(o.at, ctx.currentTime);
      const end = t + o.duration;
      const attack = Math.min(o.attack ?? 0.01, o.duration * 0.5);
      const release = Math.min(o.release ?? 0.1, o.duration - attack);
      const osc = ctx.createOscillator();
      osc.type = o.type ?? 'triangle';
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, end);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(o.volume ?? 0.05, t + attack);
      gain.gain.setValueAtTime(o.volume ?? 0.05, end - release);
      gain.gain.linearRampToValueAtTime(0.0001, end);
      let out: AudioNode = osc;
      if (o.cutoff) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = o.cutoff;
        osc.connect(lp);
        out = lp;
      }
      out.connect(gain);
      gain.connect(music);
      osc.start(t);
      osc.stop(end + 0.02);
    },
    setMusicVolume(volume: number) {
      musicVolume = volume;
      if (ctx && music) music.gain.setTargetAtTime(volume, ctx.currentTime, 0.25);
    },
  };
}

function createWebStorage(): PlatformStorage {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Private mode or blocked storage: progress just isn't saved.
      }
    },
  };
}
