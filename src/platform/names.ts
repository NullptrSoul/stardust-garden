/**
 * Leaderboard name rules, the same as valid_account_name() in
 * docs/leaderboard-accounts.sql: 2-10 characters of Chinese, letters,
 * digits or underscore, and not a reserved name.
 */
export const NAME_RULE = '2～10 个字，只能用中文、字母、数字和下划线';

const NAME_PATTERN = /^[A-Za-z0-9_一-鿿]{2,10}$/;
const RESERVED = ['管理员', '官方', '客服', '系统', 'admin', 'administrator', 'gm', 'system', 'official', '星屑庭院'];

export function validName(name: string): boolean {
  return NAME_PATTERN.test(name) && !RESERVED.includes(name.toLowerCase());
}

/**
 * The login address an account name stands for. Supabase Auth wants an
 * e-mail, so the name (lower-cased, so Mio and mio are the same account) is
 * written as hex under a domain that can never receive mail.
 */
export function accountEmail(name: string): string {
  const bytes = new TextEncoder().encode(name.trim().toLowerCase());
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `u${hex}@stardust-garden.invalid`;
}

/** sha256 as lower-case hex, like the boards' tag column. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The identity a board groups runs by: the account if any, else the device. */
export function boardIdent(playerId: string, userId: string | null): string {
  return userId ? `u:${userId}` : `g:${playerId}`;
}
