/**
 * Online leaderboard (a Supabase-style database: supabase.com, or Tencent
 * Cloud's "CloudBase for Supabase"). Fill in the project URL and its public
 * "anon" key from the project's API settings; docs/leaderboard.md explains
 * the setup. Both are safe to publish: the database itself only lets
 * visitors add plausible scores and read the boards.
 *
 * Or kind 'simple': our own small server, following
 * docs/leaderboard-server.md; only the URL is needed.
 *
 * Left empty, the game keeps a leaderboard on this device only.
 */
export const LEADERBOARD: { kind: 'supabase' | 'simple'; url: string; anonKey: string } = {
  kind: 'supabase',
  url: 'https://vkojipbntlfvmuqaagiw.supabase.co',
  anonKey: 'sb_publishable_GStRcNczQrpcgzOfpAwsLA_18kRdrAo',
};

/** Sent with every score, so old builds' scores can be told apart. */
export const GAME_VERSION = 'web-0.2';
