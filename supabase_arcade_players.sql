-- Lightweight cross-device arcade profiles. The username is intentionally the
-- only credential, so public read/insert/update is the product's chosen model.
create table if not exists public.arcade_players (
  username text primary key,
  character text,
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arcade_players_username_shape check (
    username = upper(username)
    and username ~ '^[A-Z]{5}[0-9]{2}$'
  ),
  constraint arcade_players_progress_shape check (jsonb_typeof(progress) = 'object')
);

alter table public.arcade_players enable row level security;

alter table public.arcade_players
  drop constraint if exists arcade_players_username_shape;
alter table public.arcade_players
  add constraint arcade_players_username_shape check (
    username = upper(username)
    and username ~ '^[A-Z]{5}[0-9]{2}$'
  );

drop policy if exists "Arcade players are readable" on public.arcade_players;
create policy "Arcade players are readable"
  on public.arcade_players for select
  to anon, authenticated
  using (true);

drop policy if exists "Arcade players can be created" on public.arcade_players;
create policy "Arcade players can be created"
  on public.arcade_players for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Arcade players can be updated" on public.arcade_players;
create policy "Arcade players can be updated"
  on public.arcade_players for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.arcade_players to anon;
grant select, insert, update on public.arcade_players to authenticated;

create index if not exists arcade_players_updated_at_idx
  on public.arcade_players (updated_at desc);
