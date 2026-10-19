-- Beta Lens database. Paste all of this into Supabase → SQL Editor → New query → Run.

-- 1. Profiles: one row per account, created automatically on sign-up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text default '',
  home_gym text default '',
  grade text default 'V3',
  height text default '170–180 cm',
  strengths text[] default '{}',
  weaknesses text[] default '{}',
  goal text default 'technique',
  feet_on_route boolean default true,
  accent text default '#ff5a1f',
  onboarded boolean default false,
  -- the fields below are only changed by the server
  plan text default 'free' check (plan in ('free','pro')),
  scans_month int default 0,
  asks_month int default 0,
  scans_period text default '',
  stripe_customer_id text unique,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- People may edit their own climbing details, but never their plan or usage.
revoke update on public.profiles from authenticated, anon;
grant update (name, home_gym, grade, height, strengths, weaknesses, goal, feet_on_route, accent, onboarded)
  on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Climbs: every problem someone scans, with its beta.
create table if not exists public.climbs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  colour text not null,
  colour_name text not null,
  grade text not null,
  beta jsonb not null,
  sent boolean default false,
  image_path text
);
create index if not exists climbs_user_created on public.climbs (user_id, created_at desc);

alter table public.climbs enable row level security;
drop policy if exists "own climbs" on public.climbs;
create policy "own climbs" on public.climbs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Usage counter, called only by the server with the service key.
create or replace function public.bump_usage(uid uuid, kind text) returns int
language plpgsql security definer set search_path = public as $$
declare p text := to_char(now() at time zone 'utc', 'YYYY-MM'); n int;
begin
  update public.profiles set
    scans_month = (case when scans_period = p then scans_month else 0 end) + (case when kind = 'scan' then 1 else 0 end),
    asks_month  = (case when scans_period = p then asks_month  else 0 end) + (case when kind = 'ask'  then 1 else 0 end),
    scans_period = p
  where id = uid
  returning (case when kind = 'scan' then scans_month else asks_month end) into n;
  return n;
end $$;
revoke execute on function public.bump_usage(uuid, text) from public, anon, authenticated;

-- 4. Private photo storage: each person can only see their own folder.
insert into storage.buckets (id, name, public) values ('climbs', 'climbs', false) on conflict (id) do nothing;

drop policy if exists "own climb photos read" on storage.objects;
create policy "own climb photos read" on storage.objects for select
  using (bucket_id = 'climbs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own climb photos write" on storage.objects;
create policy "own climb photos write" on storage.objects for insert
  with check (bucket_id = 'climbs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own climb photos delete" on storage.objects;
create policy "own climb photos delete" on storage.objects for delete
  using (bucket_id = 'climbs' and (storage.foldername(name))[1] = auth.uid()::text);
