/**
 * Everything the game needs from its host. The browser implements this now;
 * the WeChat mini game will implement the same interface later, so game code
 * must never touch window/document directly.
 */

/** Drawing surface. A WeChat canvas has the same shape at runtime. */
export type Surface = HTMLCanvasElement;
/** Loaded picture. A WeChat image has the same shape at runtime. */
export type ImageSource = HTMLImageElement;

export type PointerType = 'mouse' | 'touch' | 'pen';

export interface PointerInput {
  type: 'down' | 'move' | 'up' | 'cancel';
  id: number;
  /** CSS pixels from the canvas's top-left corner. */
  x: number;
  y: number;
  pointerType: PointerType;
}

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface ToneOptions {
  freq: number;
  /** Seconds. */
  duration: number;
  type?: Waveform;
  volume?: number;
  /** Glide to this frequency over the tone's duration. */
  slideTo?: number;
}

export interface NoiseOptions {
  /** Seconds. */
  duration: number;
  volume?: number;
  /** Center of the band-pass filter in Hz: low = thud, high = hiss. */
  freq?: number;
  /** Band-pass width; lower is wider. */
  q?: number;
}

/** A music note scheduled on the audio clock, played through the music bus. */
export interface NoteOptions {
  freq: number;
  /** Start time on the audio clock (see PlatformAudio.time). */
  at: number;
  /** Seconds from start to the end of the release. */
  duration: number;
  type?: Waveform;
  volume?: number;
  /** Seconds to fade in. */
  attack?: number;
  /** Seconds of fade-out at the end. */
  release?: number;
  /** Low-pass cutoff in Hz; softens bright waveforms. */
  cutoff?: number;
  slideTo?: number;
}

export interface PlatformAudio {
  /** Call from a user gesture; hosts keep audio muted until then. */
  unlock(): void;
  tone(options: ToneOptions): void;
  /** Filtered white-noise burst: the "body" of hits and explosions. */
  noise(options: NoiseOptions): void;
  /** Audio clock in seconds; 0 until audio is unlocked and running. */
  time(): number;
  note(options: NoteOptions): void;
  /** Music bus volume, 0..1, faded smoothly. */
  setMusicVolume(volume: number): void;
}

export interface PlatformStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface Platform {
  readonly canvas: Surface;
  viewport(): Viewport;
  onResize(cb: () => void): void;
  onPointer(cb: (e: PointerInput) => void): void;
  /** Keyboard, for desktop testing only; phones never call it. */
  onKey(cb: (type: 'down' | 'up', key: string) => void): void;
  createCanvas(width: number, height: number): Surface;
  /** Resolves with the image, or rejects if it is missing. */
  loadImage(src: string): Promise<ImageSource>;
  requestFrame(cb: () => void): void;
  /** Milliseconds, monotonic. */
  now(): number;
  readonly audio: PlatformAudio;
  readonly storage: PlatformStorage;
}
