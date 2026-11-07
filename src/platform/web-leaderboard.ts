import type { BoardKind, PlatformLeaderboard, PlatformStorage, ScoreEntry } from './types';

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
  if (url && config.anonKey) return restBoard(url, config.anonKey);
  return localBoard(storage);
}

const VIEWS: Record<BoardKind, string> = { all: 'leaderboard_all', week: 'leaderboard_week' };
const TIMEOUT_MS = 8000;

interface Row {
  player_id: string;
  name: string;
  character: string;
  wave: number;
  kills: number;
  play_time: number;
}

function restBoard(url: string, key: string): PlatformLeaderboard {
  // Old-style anon keys are JWTs and also go in Authorization; the newer
  // publishable keys only go in apikey (the database then runs as anon).
  const headers: Record<string, string> = key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string>) },
        signal: abort.signal,
      });
      if (!res.ok) throw new Error(`Leaderboard ${res.status}: ${await res.text()}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    online: true,
    async submit(e) {
      await call('scores', {
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
      });
    },
    async top(board, limit) {
      const res = await call(
        `${VIEWS[board]}?select=player_id,name,character,wave,kills,play_time&order=wave.desc,kills.desc&limit=${limit}`,
      );
      const rows = (await res.json()) as Row[];
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
      const w = Math.floor(wave);
      const k = Math.floor(kills);
      const res = await call(
        `${VIEWS[board]}?select=player_id&or=(wave.gt.${w},and(wave.eq.${w},kills.gt.${k}))&player_id=neq.${encodeURIComponent(playerId)}`,
        { headers: { Prefer: 'count=exact', Range: '0-0' } },
      );
      // "0-0/42" or "*/0": the number after the slash is how many are ahead.
      const total = Number(res.headers.get('content-range')?.split('/')[1] ?? 0);
      return (Number.isFinite(total) ? total : 0) + 1;
    },
  };
}

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
