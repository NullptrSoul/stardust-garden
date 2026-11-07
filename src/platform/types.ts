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

/** One endless run on a leaderboard. */
export interface ScoreEntry {
  /** Random id kept on the device; ties a player's runs together. */
  playerId: string;
  name: string;
  /** Character id. */
  character: string;
  /** Wave the run ended on. */
  wave: number;
  kills: number;
  /** Seconds of battle. */
  playTime: number;
  /**
   * On rows read back from a board: who it belongs to, as a scrambled tag
   * (the real ids stay private), and whether that is a guest or an account.
   */
  tag?: string;
  guest?: boolean;
}

export type BoardKind = 'all' | 'week';

/** A logged-in leaderboard account. */
export interface Account {
  userId: string;
  name: string;
}

/**
 * Why an account action failed; thrown as Error(message = code).
 * bad_name: breaks the name rules. name_taken: someone has it.
 * bad_password: too short. wrong_login: name or password wrong.
 * session: the login expired, log in again. network: anything else.
 */
export type AccountError = 'bad_name' | 'name_taken' | 'bad_password' | 'wrong_login' | 'session' | 'network';

export interface PlatformLeaderboard {
  /** True for the shared online board; false for the stand-in kept on this device. */
  readonly online: boolean;
  /** True when players can register and log in (name + password). */
  readonly accounts: boolean;
  /** Logged in scores go to the account; otherwise to this device as a guest. */
  submit(entry: ScoreEntry & { version: string }): Promise<void>;
  /** Best run per player, best first. */
  top(board: BoardKind, limit: number): Promise<ScoreEntry[]>;
  /**
   * 1-based place a run with this wave and kills takes on the board, counting
   * only other players (your own older runs never push you down).
   */
  rank(board: BoardKind, wave: number, kills: number, playerId: string): Promise<number>;
  /** The tag the boards show for this player: the account if logged in, else this device. */
  myTag(playerId: string): Promise<string>;
  /** The account this device is logged in to, if any. */
  account(): Account | null;
  nameAvailable(name: string): Promise<boolean>;
  register(name: string, password: string): Promise<Account>;
  login(name: string, password: string): Promise<Account>;
  logout(): void;
  /** Moves this device's guest scores to the logged-in account; returns how many. */
  claim(playerId: string): Promise<number>;
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
  readonly leaderboard: PlatformLeaderboard;
  /**
   * Asks for a short line of text (a nickname) over the game. Resolves with
   * the trimmed text, or null if the player cancels.
   */
  promptText(options: { title: string; value: string; maxLength: number; password?: boolean }): Promise<string | null>;
}
