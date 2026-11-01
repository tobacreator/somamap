-- SomaMap data spine - blueprint Chapter 4.1, Table 8.
--
-- Four tables carry the whole product, and their poverty is the point: cards holds
-- exactly the five iron-rule-1 content columns plus bookkeeping, and no column in
-- this file can hold a meaning, a cause, or a suggestion the user did not give.
--
-- Environment: this file is Supabase-specific. It references auth.users, auth.uid(),
-- auth.jwt(), storage.buckets, storage.objects and storage.foldername(), all of which
-- exist in a Supabase project and none of which exist in a bare PostgreSQL install.
--
-- Rerun safety: every statement below is safe to paste twice - create ... if not
-- exists, create or replace, drop policy/trigger if exists before creating, and
-- on conflict do nothing. Supabase also records applied migrations, so the normal
-- push path never re-runs this file.

begin;

-- ---------------------------------------------------------------------------
-- 1. profiles - minimal identity. Supabase Auth owns the identity itself; no
--    password, hash, or token column exists here or anywhere else in this file.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. sessions - one check-in. region_label comes from the fixed geometric map in
--    src/lib/regions.ts, never from a model.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  photo_path   text,
  region_label text not null,
  view         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint sessions_view_domain check (view in ('front', 'back'))
);

-- ---------------------------------------------------------------------------
-- 3. cards - the schema-locked card: exactly the five content columns of iron
--    rule 1, plus bookkeeping. quality_words is capped at five, matching the
--    strict Zod schema in src/lib/schema.ts.
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.sessions (id) on delete cascade,
  location_label     text not null,
  quality_words      text[] not null,
  intensity_metaphor text not null,
  duration           text not null,
  user_own_sentence  text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint cards_quality_words_max_five check (cardinality(quality_words) <= 5),
  constraint cards_quality_words_no_nulls check (array_position(quality_words, null) is null)
);

-- ---------------------------------------------------------------------------
-- 4. journal_entries - weekly roundup drafts. The user edits a draft before
--    anything is saved as final (iron rule 3).
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  draft_text text not null default '',
  status     text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_status_domain check (status in ('draft', 'saved'))
);

-- ---------------------------------------------------------------------------
-- Indexes. PostgreSQL does not index foreign keys automatically, and these are the
-- columns the row-level security checks and the cascade deletes run on.
-- ---------------------------------------------------------------------------
create index if not exists sessions_user_id_idx        on public.sessions (user_id);
create index if not exists cards_session_id_idx        on public.cards (session_id);
create index if not exists journal_entries_user_id_idx on public.journal_entries (user_id);

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping: one trigger function, one trigger per table. The function
-- writes only updated_at, so it can never influence an ownership check.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

drop trigger if exists journal_entries_set_updated_at on public.journal_entries;
create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security. Enabled on every application table: without it, the anon and
-- authenticated roles could read the whole table through the API. Every policy is
-- scoped to the authenticated role, so a request carrying no token matches no policy
-- and gets the default deny.
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.sessions        enable row level security;
alter table public.cards           enable row level security;
alter table public.journal_entries enable row level security;

-- profiles: the row belongs to the user it describes. WITH CHECK is written out on
-- every UPDATE policy so the expression guarding new rows cannot drift when the
-- USING expression is edited later.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- sessions: same shape, keyed on sessions.user_id.
drop policy if exists sessions_select_own on public.sessions;
create policy sessions_select_own on public.sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own on public.sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own on public.sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own on public.sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- journal_entries: same shape, keyed on journal_entries.user_id.
drop policy if exists journal_entries_select_own on public.journal_entries;
create policy journal_entries_select_own on public.journal_entries
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists journal_entries_insert_own on public.journal_entries;
create policy journal_entries_insert_own on public.journal_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists journal_entries_update_own on public.journal_entries;
create policy journal_entries_update_own on public.journal_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists journal_entries_delete_own on public.journal_entries;
create policy journal_entries_delete_own on public.journal_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- cards: this table has no user_id (Table 8 gives it only session_id), so ownership
-- is parent-derived - a card is yours when its session is yours. The predicate is
-- written out in full in both USING and WITH CHECK, so the rule does not depend on
-- the sessions policies staying as they are, and a user can neither attach a card to
-- someone else's session nor move a card into or out of someone else's session.
drop policy if exists cards_select_own on public.cards;
create policy cards_select_own on public.cards
  for select to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = cards.session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists cards_insert_own on public.cards;
create policy cards_insert_own on public.cards
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = cards.session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists cards_update_own on public.cards;
create policy cards_update_own on public.cards
  for update to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = cards.session_id and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = cards.session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists cards_delete_own on public.cards;
create policy cards_delete_own on public.cards
  for delete to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = cards.session_id and s.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: one private bucket for session photos, plus owner-scoped object policies.
-- Object key convention: <auth.uid()>/<session_id>/<filename>. The first path segment
-- is the owner, which is what the policies below test and what lets the later
-- delete-everything action clear one user's objects in a single pass. The check is
-- path-based on purpose: it does not depend on the object owner column name, which
-- has changed across Storage versions.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('session-photos', 'session-photos', false)
on conflict (id) do nothing;

drop policy if exists session_photos_select_own on storage.objects;
create policy session_photos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

drop policy if exists session_photos_insert_own on storage.objects;
create policy session_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

drop policy if exists session_photos_update_own on storage.objects;
create policy session_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
  with check (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

drop policy if exists session_photos_delete_own on storage.objects;
create policy session_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

commit;
