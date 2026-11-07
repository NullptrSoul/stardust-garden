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
import { LEADERBOARD } from '../leaderboard.config';
import { createWebLeaderboard } from './web-leaderboard';

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
  const storage = createWebStorage();

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

  // Browsers only let sound start from a user gesture, and phones are picky
  // about which one: iOS Safari wants the end of a touch, not its start. Try
  // on every kind of gesture, every time: after switching apps, iOS leaves
  // the audio "interrupted" and only a new gesture brings it back.
  const audio = createWebAudio();
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') audio.unlock();
  });

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
    audio,
    storage,
    leaderboard: createWebLeaderboard(LEADERBOARD, storage),
    promptText,
  };
}

/** A small text box over the game, for the leaderboard nickname. */
function promptText(options: { title: string; value: string; maxLength: number; password?: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    const shade = document.createElement('div');
    shade.style.cssText =
      'position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(30,20,60,0.55);font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;';
    const box = document.createElement('div');
    box.style.cssText =
      'width:min(84vw,360px);padding:20px;border-radius:18px;background:#fff;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.3);border:3px solid #B9A8F0;color:#3D3366;';
    const title = document.createElement('div');
    title.textContent = options.title;
    title.style.cssText = 'font-weight:800;font-size:18px;margin-bottom:12px;text-align:center;';
    const input = document.createElement('input');
    input.value = options.value;
    input.maxLength = options.maxLength;
    if (options.password) {
      input.type = 'password';
      input.autocomplete = 'current-password';
    }
    input.style.cssText =
      'box-sizing:border-box;width:100%;padding:10px 12px;font-size:18px;border-radius:10px;' +
      'border:2px solid #B9A8F0;outline:none;color:#3D3366;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;margin-top:14px;';
    const button = (label: string, primary: boolean): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        'flex:1;padding:10px;font-size:17px;font-weight:800;border-radius:12px;border:none;cursor:pointer;' +
        (primary ? 'background:#FF8FB0;color:#fff;' : 'background:#E8E2FA;color:#3D3366;');
      return b;
    };
    const cancel = button('取消', false);
    const ok = button('确定', true);
    row.append(cancel, ok);
    box.append(title, input, row);
    shade.append(box);
    document.body.append(shade);
    const done = (value: string | null): void => {
      shade.remove();
      resolve(value === null ? null : value.trim().slice(0, options.maxLength) || null);
    };
    ok.addEventListener('click', () => done(input.value));
    cancel.addEventListener('click', () => done(null));
    // Typing must not reach the game's keyboard controls.
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(input.value);
      if (e.key === 'Escape') done(null);
    });
    setTimeout(() => input.focus(), 0);
  });
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
    // Safari 16.4+: play as game audio, so the iPhone silent switch doesn't mute it.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        // Not supported here; sound still works with the ringer on.
      }
    }
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
      // 'suspended' before the first gesture; 'interrupted' on iOS after a call
      // or an app switch. Either way, try again.
      if (c && c.state !== 'running') c.resume().catch(() => undefined);
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
