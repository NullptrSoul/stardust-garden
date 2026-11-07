-- 星屑庭院 · 排行榜账号（用户名 + 密码）
-- 2026-11-07 起排行榜只收登录账号的成绩，游客照样能玩，但要注册或登录才能上榜。
-- 在已经跑过 leaderboard.sql 的数据库上，到 SQL Editor 整段运行一次。重复运行也没关系。
-- 需要先在 Authentication → Sign In / Providers 里关掉 Confirm email。
--
-- 账号密码由 Supabase Auth 管（auth.users），这里不存任何密码。
-- 游戏把用户名转成一个不会收信的内部邮箱（u<十六进制>@stardust-garden.invalid）去注册，
-- 用户名本身放在注册时的 data.name 里，由下面的触发器写进 profiles。

-- 1. 账号资料：用户名唯一（不分大小写）。
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  name_key text not null unique,
  created_at timestamptz not null default now()
);

-- 用户名规则：2～10 个字，中文、字母、数字、下划线；保留名不能注册。
create or replace function public.valid_account_name(n text) returns boolean
language sql immutable as $$
  select n ~ '^[A-Za-z0-9_一-鿿]{2,10}$'
     and lower(n) not in ('管理员', '官方', '客服', '系统', 'admin', 'administrator', 'gm', 'system', 'official', '星屑庭院')
$$;

alter table public.profiles drop constraint if exists profiles_name_valid;
alter table public.profiles add constraint profiles_name_valid check (public.valid_account_name(name) and name_key = lower(name));

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

-- 注册时自动建资料；名字不合法或被占用就让注册整个失败。
create or replace function public.create_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n text := btrim(coalesce(new.raw_user_meta_data ->> 'name', ''));
begin
  if not public.valid_account_name(n) then
    raise exception 'bad_name';
  end if;
  if exists (select 1 from public.profiles where name_key = lower(n)) then
    raise exception 'name_taken';
  end if;
  insert into public.profiles (user_id, name, name_key) values (new.id, n, lower(n));
  return new;
end
$$;

drop trigger if exists create_profile on auth.users;
create trigger create_profile after insert on auth.users for each row execute function public.create_profile();

-- 注册前查名字能不能用（游戏里提前提示）。
create or replace function public.name_available(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.valid_account_name(btrim(n))
     and not exists (select 1 from public.profiles where name_key = lower(btrim(n)))
$$;
grant execute on function public.name_available(text) to anon, authenticated;

-- 2. 成绩归属：登录玩家的成绩记在账号上。
alter table public.scores add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.scores alter column user_id set default auth.uid();
create index if not exists scores_user on public.scores (user_id);

-- 只收账号成绩，名字以账号为准。
create or replace function public.score_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    raise exception 'login_required';
  end if;
  select name into new.name from public.profiles where user_id = new.user_id;
  if new.name is null then
    raise exception 'no_profile';
  end if;
  return new;
end
$$;

drop trigger if exists score_identity on public.scores;
create trigger score_identity before insert on public.scores for each row execute function public.score_identity();

-- 只有登录玩家能交成绩，而且只能交自己账号的。
drop policy if exists "anyone can add a score" on public.scores;
drop policy if exists "add own scores" on public.scores;
create policy "add own scores" on public.scores for insert to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());
revoke insert on public.scores from anon;

-- 3. 认领：登录后，把这台设备以前的游客成绩挂到自己账号上。
create or replace function public.claim_guest_scores(p_player_id text) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_name text;
  n int;
begin
  if me is null then
    raise exception 'not_logged_in';
  end if;
  select name into my_name from public.profiles where user_id = me;
  update public.scores set user_id = me, name = my_name
    where player_id = p_player_id and user_id is null;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.claim_guest_scores(text) from public, anon;
grant execute on function public.claim_guest_scores(text) to authenticated;

-- 4. 榜：每个账号（跨设备）或每台游客设备只取最好的一局。
--    不再公开真实的 player_id，只给一个打乱过的 tag（sha256），自己那行靠它高亮。
--    player_id 列保留给旧版客户端，内容同样是 tag。
drop view if exists public.leaderboard_all;
drop view if exists public.leaderboard_week;

create view public.leaderboard_all as
  select tag as player_id, tag, name, character, wave, kills, play_time, created_at, is_guest
  from (
    select distinct on (ident)
      ident,
      encode(sha256(convert_to(ident, 'UTF8')), 'hex') as tag,
      name, character, wave, kills, play_time, created_at,
      user_id is null as is_guest
    from (select s.*, coalesce('u:' || s.user_id::text, 'g:' || s.player_id) as ident from public.scores s) x
    order by ident, wave desc, kills desc, created_at asc
  ) best;

create view public.leaderboard_week as
  select tag as player_id, tag, name, character, wave, kills, play_time, created_at, is_guest
  from (
    select distinct on (ident)
      ident,
      encode(sha256(convert_to(ident, 'UTF8')), 'hex') as tag,
      name, character, wave, kills, play_time, created_at,
      user_id is null as is_guest
    from (select s.*, coalesce('u:' || s.user_id::text, 'g:' || s.player_id) as ident from public.scores s) x
    where created_at >= (date_trunc('week', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')
    order by ident, wave desc, kills desc, created_at asc
  ) best;

grant select on public.leaderboard_all, public.leaderboard_week to anon, authenticated;
