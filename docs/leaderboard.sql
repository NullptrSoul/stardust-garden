-- 星屑庭院 · 无尽排行榜
-- 在数据库控制台的 SQL Editor 里整段粘贴，运行一次。重复运行也没关系。
-- 适用于 supabase.com，以及腾讯云「云开发 CloudBase for Supabase 版」。

-- 1. 成绩表：每局无尽一行。
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  player_id text not null,
  name text not null,
  character text not null,
  wave int not null,
  kills int not null,
  play_time int not null,
  version text not null default '',
  created_at timestamptz not null default now()
);

-- 2. 打到某一波最少要多少秒：前面每个普通波都有固定时长（Boss 波算 0）。
--    和游戏里 src/game/waves.ts 的波次时长一致；改了波次时长要一起改这里。
create or replace function public.min_play_time(reached int) returns int
language sql immutable as $$
  select coalesce(sum(case
      when k <= 10 then (array[20, 25, 25, 30, 0, 35, 40, 0, 45, 0])[k]
      when k % 5 = 0 then 0
      when k <= 30 then 30
      else 25
    end), 0)::int
  from generate_series(1, reached - 1) as k
$$;

-- 3. 不合理的成绩直接拒收（防最简单的作弊）。
alter table public.scores drop constraint if exists scores_valid;
alter table public.scores add constraint scores_valid check (
  player_id ~ '^[0-9a-f]{32}$'
  and char_length(btrim(name)) between 1 and 10
  and character in ('bailan', 'ziling', 'jinti', 'juyan', 'qinglan', 'shenxi')
  and wave between 2 and 200
  and kills between 0 and wave * 400
  and play_time between 0 and 7200
  and play_time >= min_play_time(wave) * 0.9
  and char_length(version) <= 20
);

create index if not exists scores_best on public.scores (player_id, wave desc, kills desc);

-- 4. 权限：游客只能加成绩，不能看原始表、不能改、不能删。
alter table public.scores enable row level security;
drop policy if exists "anyone can add a score" on public.scores;
create policy "anyone can add a score" on public.scores for insert to anon, authenticated with check (true);
revoke all on public.scores from anon, authenticated;
grant insert on public.scores to anon, authenticated;

-- 5. 两个榜：每人只取最好的一局。视图用表主人的权限读表，游客只能读视图。
create or replace view public.leaderboard_all as
  select distinct on (player_id) player_id, name, character, wave, kills, play_time, created_at
  from public.scores
  order by player_id, wave desc, kills desc, created_at asc;

-- 本周：北京时间周一 0 点起。
create or replace view public.leaderboard_week as
  select distinct on (player_id) player_id, name, character, wave, kills, play_time, created_at
  from public.scores
  where created_at >= (date_trunc('week', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')
  order by player_id, wave desc, kills desc, created_at asc;

grant select on public.leaderboard_all, public.leaderboard_week to anon, authenticated;
