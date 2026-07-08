create extension if not exists pgcrypto;

create table if not exists public.signal_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 12),
  score integer not null default 0 check (score >= 0),
  extra text not null default '' check (char_length(extra) <= 60),
  recipe jsonb not null,
  created_at timestamptz not null default now(),
  constraint signal_recipes_recipe_shape check (
    jsonb_typeof(recipe) = 'object'
    and jsonb_typeof(recipe -> 'settings') = 'object'
    and jsonb_typeof(recipe -> 'choices') = 'array'
    and case
      when jsonb_typeof(recipe -> 'choices') = 'array'
      then jsonb_array_length(recipe -> 'choices') between 0 and 128
      else false
    end
  )
);

alter table public.signal_recipes enable row level security;

drop policy if exists "Signal recipes are readable" on public.signal_recipes;
create policy "Signal recipes are readable"
  on public.signal_recipes
  for select
  using (true);

drop policy if exists "Signal recipes can be inserted" on public.signal_recipes;
create policy "Signal recipes can be inserted"
  on public.signal_recipes
  for insert
  with check (
    char_length(name) between 1 and 12
    and score >= 0
    and char_length(extra) <= 60
    and jsonb_typeof(recipe) = 'object'
    and jsonb_typeof(recipe -> 'settings') = 'object'
    and jsonb_typeof(recipe -> 'choices') = 'array'
    and case
      when jsonb_typeof(recipe -> 'choices') = 'array'
      then jsonb_array_length(recipe -> 'choices') between 0 and 128
      else false
    end
  );

grant select, insert on public.signal_recipes to anon;
grant select, insert on public.signal_recipes to authenticated;
grant usage on schema public to anon;
grant usage on schema public to authenticated;

create index if not exists signal_recipes_score_idx
  on public.signal_recipes (score desc, created_at desc);

create index if not exists signal_recipes_created_at_idx
  on public.signal_recipes (created_at desc);
