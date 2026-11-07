import { accountEmail, boardIdent, sha256Hex, validName } from './names';
import type { AccountError, BoardKind, PlatformLeaderboard, PlatformStorage, ScoreEntry } from './types';

/**
 * The web leaderboard, picked by leaderboard.config.ts:
 * - kind 'supabase' with a URL and key: a Supabase-style REST API
 *   (docs/leaderboard.sql creates the table and the two views it reads);
 * - kind 'simple' with a URL: our own small server (docs/leaderboard-server.md);
 * - no URL: runs kept on this device only.
 */
export function createWebLeaderboard(
  config: { kind?: 'supabase' | 'simple'; url: string; anonKey: string },
  storage: PlatformStorage,
  fetcher: typeof fetch = (...args) => fetch(...args),
): PlatformLeaderboard {
  const url = config.url.replace(/\/+$/, '');
  if (url && config.kind === 'simple') return simpleBoard(url, fetcher);
  if (url && config.anonKey) return restBoard(url, config.anonKey, storage, fetcher);
  return localBoard(storage);
}

const VIEWS: Record<BoardKind, string> = { all: 'leaderboard_all', week: 'leaderboard_week' };
const TIMEOUT_MS = 8000;

interface Row {
  player_id: string;
  tag?: string;
  is_guest?: boolean;
  name: string;
  character: string;
  wave: number;
  kills: number;
  play_time: number;
}

function fromRow(r: Row): ScoreEntry {
  return {
    playerId: r.player_id,
    tag: r.tag ?? r.player_id,
    guest: r.is_guest ?? true,
    name: r.name,
    character: r.character,
    wave: r.wave,
    kills: r.kills,
    playTime: r.play_time,
  };
}

/** A logged-in session, kept in storage so the login survives reloads. */
interface Session {
  access: string;
  refresh: string;
  /** Milliseconds since 1970 when the access token runs out. */
  expires: number;
  userId: string;
  name: string;
}

const SESSION_KEY = 'stardust-garden.session.v1';

/** Thrown as Error(code); the game shows a message for each code. */
function fail(code: AccountError): never {
  throw new Error(code);
}

function restBoard(url: string, key: string, storage: PlatformStorage, fetcher: typeof fetch): PlatformLeaderboard {
  // Old-style anon keys are JWTs and also go in Authorization; the newer
  // publishable keys only go in apikey (the database then runs as anon).
  const anonAuth: Record<string, string> = key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {};

  let session: Session | null = null;
  try {
    const saved = JSON.parse(storage.get(SESSION_KEY) ?? 'null') as Session | null;
    if (saved && typeof saved.access === 'string' && typeof saved.userId === 'string') session = saved;
  } catch {
    session = null;
  }
  const keep = (s: Session | null): void => {
    session = s;
    storage.set(SESSION_KEY, JSON.stringify(s));
  };

  async function request(path: string, init: RequestInit = {}, auth?: string): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      return await fetcher(`${url}${path}`, {
        ...init,
        headers: {
          apikey: key,
          ...(auth ? { Authorization: `Bearer ${auth}` } : anonAuth),
          ...(init.headers as Record<string, string>),
        },
        signal: abort.signal,
      });
    } catch {
      return fail('network');
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(path: string, init: RequestInit = {}, auth?: string): Promise<Response> {
    const res = await request(`/rest/v1/${path}`, init, auth);
    if (!res.ok) {
      const text = await res.text();
      // Messages raised by the database's own checks (see the accounts SQL).
      if (text.includes('name_taken')) fail('name_taken');
      if (text.includes('bad_name')) fail('bad_name');
      throw new Error(`Leaderboard ${res.status}: ${text}`);
    }
    return res;
  }

  /** Signs in with a token response from the auth API. */
  async function authCall(path: string, body: unknown): Promise<Session> {
    const res = await request(`/auth/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: { id: string; user_metadata?: { name?: string } };
      code?: string | number;
      error_code?: string;
      msg?: string;
      message?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token || !data.user) {
      const text = `${data.error_code ?? ''} ${data.code ?? ''} ${data.error ?? ''} ${data.msg ?? ''} ${data.message ?? ''} ${data.error_description ?? ''}`;
      if (/already|exists/i.test(text)) fail('name_taken');
      if (/weak_password|password should|at least/i.test(text)) fail('bad_password');
      if (/invalid_credentials|Invalid login/i.test(text)) fail('wrong_login');
      if (/refresh_token|invalid_grant/i.test(text)) fail('session');
      fail('network');
    }
    const s: Session = {
      access: data.access_token,
      refresh: data.refresh_token ?? '',
      expires: Date.now() + (data.expires_in ?? 3600) * 1000,
      userId: data.user.id,
      name: data.user.user_metadata?.name ?? session?.name ?? '',
    };
    keep(s);
    return s;
  }

  /** A fresh access token, refreshed when it is about to run out; none for guests. */
  async function token(): Promise<string | undefined> {
    if (!session) return undefined;
    if (session.expires - 60_000 > Date.now()) return session.access;
    const name = session.name;
    try {
      const s = await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh });
      if (!s.name) {
        s.name = name;
        keep(s);
      }
      return s.access;
    } catch (e) {
      if (e instanceof Error && e.message === 'network') throw e;
      keep(null);
      return fail('session');
    }
  }

  const board: PlatformLeaderboard = {
    online: true,
    accounts: true,
    async submit(e) {
      await call(
        'scores',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            player_id: e.playerId,
            name: e.name,
            character: e.character,
            wave: e.wave,
            kills: e.kills,
            play_time: Math.round(e.playTime),
            version: e.version,
          }),
        },
        await token(),
      );
    },
    async top(kind, limit) {
      const res = await call(
        `${VIEWS[kind]}?select=player_id,tag,is_guest,name,character,wave,kills,play_time&order=wave.desc,kills.desc&limit=${limit}`,
      );
      return ((await res.json()) as Row[]).map(fromRow);
    },
    async rank(kind, wave, kills, playerId) {
      const w = Math.floor(wave);
      const k = Math.floor(kills);
      const me = await board.myTag(playerId);
      const res = await call(`${VIEWS[kind]}?select=tag&or=(wave.gt.${w},and(wave.eq.${w},kills.gt.${k}))&tag=neq.${me}`, {
        headers: { Prefer: 'count=exact', Range: '0-0' },
      });
      // "0-0/42" or "*/0": the number after the slash is how many are ahead.
      const total = Number(res.headers.get('content-range')?.split('/')[1] ?? 0);
      return (Number.isFinite(total) ? total : 0) + 1;
    },
    myTag(playerId) {
      return sha256Hex(boardIdent(playerId, session?.userId ?? null));
    },
    account() {
      return session ? { userId: session.userId, name: session.name } : null;
    },
    async nameAvailable(name) {
      if (!validName(name)) return false;
      const res = await call('rpc/name_available', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: name }),
      });
      return (await res.json()) === true;
    },
    async register(name, password) {
      if (!validName(name)) fail('bad_name');
      if (password.length < 6) fail('bad_password');
      const s = await authCall('signup', { email: accountEmail(name), password, data: { name } });
      s.name = name;
      keep(s);
      return { userId: s.userId, name };
    },
    async login(name, password) {
      const s = await authCall('token?grant_type=password', { email: accountEmail(name), password });
      return { userId: s.userId, name: s.name || name };
    },
    logout() {
      const access = session?.access;
      keep(null);
      // Tell the server too; the local logout already happened either way.
      if (access) void request('/auth/v1/logout', { method: 'POST' }, access).catch(() => undefined);
    },
    async claim(playerId) {
      const res = await call(
        'rpc/claim_guest_scores',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_player_id: playerId }) },
        await token(),
      );
      return Number(await res.json()) || 0;
    },
  };
  return board;
}

/** Backends without accounts: everyone plays as a guest of their device. */
const NO_ACCOUNTS = {
  accounts: false,
  myTag: async (playerId: string) => playerId,
  account: () => null,
  nameAvailable: async () => true,
  register: async (): Promise<never> => fail('network'),
  login: async (): Promise<never> => fail('network'),
  logout: () => undefined,
  claim: async () => 0,
};

/** Our own server: four small JSON endpoints, see docs/leaderboard-server.md. */
function simpleBoard(url: string, fetcher: typeof fetch): PlatformLeaderboard {
  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await fetcher(`${url}/api/${path}`, { ...init, signal: abort.signal });
      if (!res.ok) throw new Error(`Leaderboard ${res.status}: ${await res.text()}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    ...NO_ACCOUNTS,
    online: true,
    async submit(e) {
      await call('scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: e.playerId,
          name: e.name,
          character: e.character,
          wave: e.wave,
          kills: e.kills,
          play_time: Math.round(e.playTime),
          version: e.version,
        }),
      });
    },
    async top(board, limit) {
      const rows = (await call(`top?board=${board}&limit=${limit}`)) as Row[];
      return rows.map((r) => ({
        playerId: r.player_id,
        name: r.name,
        character: r.character,
        wave: r.wave,
        kills: r.kills,
        playTime: r.play_time,
      }));
    },
    async rank(board, wave, kills, playerId) {
      const q = `board=${board}&wave=${Math.floor(wave)}&kills=${Math.floor(kills)}&player_id=${encodeURIComponent(playerId)}`;
      const r = (await call(`rank?${q}`)) as { rank: number };
      return r.rank;
    },
  };
}

const LOCAL_KEY = 'stardust-garden.board.v1';
const LOCAL_MAX = 200;

interface LocalRun extends ScoreEntry {
  /** Milliseconds since 1970. */
  at: number;
}

/** Monday 00:00 this week, local time. */
export function weekStart(now: Date): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Best run per player, best first. */
export function bestPerPlayer<T extends ScoreEntry>(runs: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of runs) {
    const b = best.get(r.playerId);
    if (!b || r.wave > b.wave || (r.wave === b.wave && r.kills > b.kills)) best.set(r.playerId, r);
  }
  return [...best.values()].sort((a, b) => b.wave - a.wave || b.kills - a.kills);
}

function localBoard(storage: PlatformStorage): PlatformLeaderboard {
  const load = (): LocalRun[] => {
    try {
      const data = JSON.parse(storage.get(LOCAL_KEY) ?? '[]') as LocalRun[];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };
  const board = (kind: BoardKind): LocalRun[] => {
    const since = kind === 'week' ? weekStart(new Date()) : 0;
    return bestPerPlayer(load().filter((r) => r.at >= since));
  };
  return {
    ...NO_ACCOUNTS,
    online: false,
    async submit(e) {
      const runs = load();
      runs.push({ playerId: e.playerId, name: e.name, character: e.character, wave: e.wave, kills: e.kills, playTime: e.playTime, at: Date.now() });
      // Keep the best ones when the list gets long.
      runs.sort((a, b) => b.wave - a.wave || b.kills - a.kills);
      storage.set(LOCAL_KEY, JSON.stringify(runs.slice(0, LOCAL_MAX)));
    },
    async top(kind, limit) {
      return board(kind).slice(0, limit);
    },
    async rank(kind, wave, kills, playerId) {
      const ahead = board(kind).filter((r) => r.playerId !== playerId && (r.wave > wave || (r.wave === wave && r.kills > kills)));
      return ahead.length + 1;
    },
  };
}
