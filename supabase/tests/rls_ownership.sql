-- ===========================================================================
-- SomaMap - Row-Level Security ownership test  (LOCAL DATABASE ONLY)
-- supabase/tests/rls_ownership.sql
--
-- PURPOSE
--   Prove, acting as the `authenticated` role, that each of the four
--   application tables isolates one user's rows from another user's rows for
--   SELECT, UPDATE and DELETE - the ownership contract created by
--   supabase/migrations/001_init.sql.
--
--   For each table (profiles, sessions, cards, journal_entries) and each of two
--   synthetic users A and B the script asserts:
--     select-own      the acting user sees exactly 1 own row
--     select-other    the acting user sees 0 rows owned by the other user
--     isolation       exactly 1 row is visible in the table in total, so no
--                     unrelated record leaks into the user's view
--     update-cross    a cross-user UPDATE affects 0 rows
--     delete-cross    a cross-user DELETE affects 0 rows
--   then repeats the same statements against the acting user's own row
--   (positive controls), so a zero-row cross-user result cannot be confused
--   with a blanket deny.
--
-- DELIBERATELY OUT OF SCOPE
--   Storage object policies (separate test), INSERT-policy violations, the
--   `anon` default-deny check, cascade behaviour, and any hosted/remote
--   database. Nothing here touches .env.local or any key.
--
-- SAFETY
--   * One transaction, opened with BEGIN and closed with ROLLBACK. This file
--     contains no COMMIT, so nothing it writes can survive the run.
--   * Only synthetic rows with the fixed UUIDs listed below are created.
--     Pre-existing rows are only read; the row counts captured in step 1 are
--     compared again before rollback and after it, to prove that.
--   * Every failed assertion is a RAISE EXCEPTION. With ON_ERROR_STOP the run
--     stops at once and the session ends, which rolls the transaction back.
--   * No credentials, no secrets, no remote connection, no file output.
--
-- RUN (project root, PowerShell; local Supabase Docker container):
--   Get-Content -LiteralPath 'C:\Users\tobac\somamap\supabase\tests\rls_ownership.sql' -Raw |
--     docker exec -i supabase_db_somamap psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -
--
-- COMPLIANCE (.clinerules): this is a database permission test. It adds no
-- column, no model call, no UI copy and no interpretation of user data; the
-- five iron rules are untouched.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset pager off

-- Fixed synthetic identities (hex only; version/variant nibbles set):
--   user A       a11ce000-0000-4000-8000-000000000001
--   user B       b0b00000-0000-4000-8000-000000000002
--   session A    5e551010-0000-4000-8000-0000000000a1
--   session B    5e551010-0000-4000-8000-0000000000b2
--   card A       ca4d0000-0000-4000-8000-0000000000a1
--   card B       ca4d0000-0000-4000-8000-0000000000b2
--   journal A    10a1d000-0000-4000-8000-0000000000a1
--   journal B    10a1d000-0000-4000-8000-0000000000b2

begin;

\echo 'rls_ownership: transaction open - every write below is rolled back'

-- ---------------------------------------------------------------------------
-- 0. Preflight. No write has happened yet. Abort with a clear error if the
--    schema is missing, if the authenticated role is missing, or if any fixed
--    test UUID is already in use - in which case this test refuses to run
--    rather than touch data it did not create.
-- ---------------------------------------------------------------------------
do $rls$
declare
  v_conflicts int;
begin
  if to_regclass('auth.users') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.sessions') is null
     or to_regclass('public.cards') is null
     or to_regclass('public.journal_entries') is null then
    raise exception 'preflight [rls_ownership]: a required table is missing - apply supabase/migrations/001_init.sql to the local database first';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'preflight [rls_ownership]: role authenticated does not exist in this database';
  end if;

  select (select count(*) from auth.users
            where id in ('a11ce000-0000-4000-8000-000000000001',
                         'b0b00000-0000-4000-8000-000000000002'))
       + (select count(*) from public.profiles
            where user_id in ('a11ce000-0000-4000-8000-000000000001',
                              'b0b00000-0000-4000-8000-000000000002'))
       + (select count(*) from public.sessions
            where id in ('5e551010-0000-4000-8000-0000000000a1',
                         '5e551010-0000-4000-8000-0000000000b2')
               or user_id in ('a11ce000-0000-4000-8000-000000000001',
                              'b0b00000-0000-4000-8000-000000000002'))
       + (select count(*) from public.cards
            where id in ('ca4d0000-0000-4000-8000-0000000000a1',
                         'ca4d0000-0000-4000-8000-0000000000b2')
               or session_id in ('5e551010-0000-4000-8000-0000000000a1',
                                 '5e551010-0000-4000-8000-0000000000b2'))
       + (select count(*) from public.journal_entries
            where id in ('10a1d000-0000-4000-8000-0000000000a1',
                         '10a1d000-0000-4000-8000-0000000000b2')
               or user_id in ('a11ce000-0000-4000-8000-000000000001',
                              'b0b00000-0000-4000-8000-000000000002'))
    into v_conflicts;

  if v_conflicts > 0 then
    raise exception 'preflight [rls_ownership]: % pre-existing row(s) already use the fixed test UUIDs - refusing to run so that no existing data is touched', v_conflicts;
  end if;

  raise notice 'preflight [rls_ownership]: tables present, role authenticated present, fixed test UUIDs free';
end
$rls$;

-- ---------------------------------------------------------------------------
-- 1. Baseline (read-only). Row counts before any test row exists, captured as
--    psql variables. Sections 8 and 10 compare against them, so any change to a
--    pre-existing row fails the run.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.profiles)        as pre_profiles,
  (select count(*) from public.sessions)        as pre_sessions,
  (select count(*) from public.cards)           as pre_cards,
  (select count(*) from public.journal_entries) as pre_journal,
  (select count(*) from auth.users)             as pre_auth_users
\gset

-- ---------------------------------------------------------------------------
-- 2. Setup. Runs as the connecting superuser role on purpose: the fixtures must
--    exist before any policy is exercised. Only the fixed synthetic UUIDs are
--    written. In auth.users only `id` has no default, so the rest is supplied
--    for realism.
-- ---------------------------------------------------------------------------
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   is_sso_user, is_anonymous)
values
  ('a11ce000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-test-user-a@somamap.invalid', 'not-a-real-hash', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), false, false),
  ('b0b00000-0000-4000-8000-000000000002',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-test-user-b@somamap.invalid', 'not-a-real-hash', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), false, false);

insert into public.profiles (user_id, display_name) values
  ('a11ce000-0000-4000-8000-000000000001', 'RLS test user A'),
  ('b0b00000-0000-4000-8000-000000000002', 'RLS test user B');

insert into public.sessions (id, user_id, region_label, view) values
  ('5e551010-0000-4000-8000-0000000000a1',
   'a11ce000-0000-4000-8000-000000000001', 'RLS test region A', 'front'),
  ('5e551010-0000-4000-8000-0000000000b2',
   'b0b00000-0000-4000-8000-000000000002', 'RLS test region B', 'back');

insert into public.cards
  (id, session_id, location_label, quality_words, intensity_metaphor,
   duration, user_own_sentence)
values
  ('ca4d0000-0000-4000-8000-0000000000a1',
   '5e551010-0000-4000-8000-0000000000a1', 'RLS test location A',
   array['noticeable','present'], 'like a quiet background hum',
   'a few minutes', 'RLS test sentence A'),
  ('ca4d0000-0000-4000-8000-0000000000b2',
   '5e551010-0000-4000-8000-0000000000b2', 'RLS test location B',
   array['warm','present'], 'like a soft weight',
   'a few hours', 'RLS test sentence B');

insert into public.journal_entries (id, user_id, week_start, draft_text, status)
values
  ('10a1d000-0000-4000-8000-0000000000a1',
   'a11ce000-0000-4000-8000-000000000001', date '2026-01-05',
   'RLS test draft A', 'draft'),
  ('10a1d000-0000-4000-8000-0000000000b2',
   'b0b00000-0000-4000-8000-000000000002', date '2026-01-05',
   'RLS test draft B', 'draft');

do $rls$
declare n int;
begin
  select count(*) into n from auth.users where id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'setup [rls_ownership]: expected 2 test auth.users rows, got %', n; end if;
  select count(*) into n from public.profiles where user_id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'setup [rls_ownership]: expected 2 test profiles rows, got %', n; end if;
  select count(*) into n from public.sessions where user_id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'setup [rls_ownership]: expected 2 test sessions rows, got %', n; end if;
  select count(*) into n from public.cards where id in ('ca4d0000-0000-4000-8000-0000000000a1','ca4d0000-0000-4000-8000-0000000000b2');
  if n <> 2 then raise exception 'setup [rls_ownership]: expected 2 test cards rows, got %', n; end if;
  select count(*) into n from public.journal_entries where user_id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'setup [rls_ownership]: expected 2 test journal_entries rows, got %', n; end if;
  raise notice 'setup [rls_ownership]: 2 auth users, 2 profiles, 2 sessions, 2 cards, 2 journal entries created (uncommitted)';
end
$rls$;

-- ===========================================================================
-- 3. Runtime identity - user A.
--    `set local role authenticated` + a transaction-local JWT claim is the same
--    mechanism the local Supabase tests use: auth.uid() reads the `sub` claim
--    of request.jwt.claims. auth.uid() is verified before anything is asserted.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub',  'a11ce000-0000-4000-8000-000000000001',
  'role', 'authenticated',
  'aud',  'authenticated'
)::text, true) as set_jwt_claims_for_user_a;

do $rls$
declare
  v_expected constant uuid := 'a11ce000-0000-4000-8000-000000000001';
begin
  if current_user <> 'authenticated' then
    raise exception 'identity [user A]: current_user is %, expected authenticated', current_user;
  end if;
  if auth.uid() is distinct from v_expected then
    raise exception 'identity [user A]: auth.uid() resolved to %, expected %',
      coalesce(auth.uid()::text, '<null>'), v_expected;
  end if;
  raise notice 'identity [user A]: current_user=authenticated, auth.uid()=%', auth.uid();
end
$rls$;

-- ===========================================================================
-- 4. User A - ownership assertions, table by table.
--    Every block: the five required checks, then positive controls that prove
--    the same statements do work on user A's own row.
-- ===========================================================================

-- ---- profiles  (ownership key: profiles.user_id) --------------------------
do $rls$
declare
  v_uid    constant uuid := 'a11ce000-0000-4000-8000-000000000001';  -- acting user: A
  v_other  constant uuid := 'b0b00000-0000-4000-8000-000000000002';  -- other user: B
  v_marker constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  n int;
begin
  select count(*) into n from public.profiles where user_id = v_uid;
  if n <> 1 then raise exception 'profiles/select-own [user A]: expected 1 own row, got %', n; end if;

  select count(*) into n from public.profiles where user_id = v_other;
  if n <> 0 then raise exception 'profiles/select-other [user A]: expected 0 rows owned by user B, got %', n; end if;

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'profiles/isolation [user A]: expected exactly 1 visible row in the table, got %', n; end if;

  update public.profiles set display_name = v_marker where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'profiles/update-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  delete from public.profiles where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'profiles/delete-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  -- positive controls: the identical statements work on user A's own row
  update public.profiles set display_name = display_name where user_id = v_uid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profiles/update-own-control [user A]: expected 1 row affected, got %', n; end if;

  delete from public.profiles where user_id = v_uid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profiles/delete-own-control [user A]: expected 1 row deleted, got %', n; end if;

  insert into public.profiles (user_id, display_name)
  values (v_uid, 'RLS test user A');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profiles/insert-own-control [user A]: expected 1 row inserted, got %', n; end if;

  raise notice 'PASS  profiles          [user A]  select-own 1 | select-other 0 | isolation 1 | update-cross 0 | delete-cross 0 | own-row controls 1/1/1';
end
$rls$;

-- ---- sessions  (ownership key: sessions.user_id) --------------------------
do $rls$
declare
  v_uid           constant uuid := 'a11ce000-0000-4000-8000-000000000001';  -- acting user: A
  v_other         constant uuid := 'b0b00000-0000-4000-8000-000000000002';  -- other user: B
  v_own_session   constant uuid := '5e551010-0000-4000-8000-0000000000a1';
  v_marker        constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  v_scratch uuid;
  n int;
begin
  select count(*) into n from public.sessions where user_id = v_uid;
  if n <> 1 then raise exception 'sessions/select-own [user A]: expected 1 own row, got %', n; end if;

  select count(*) into n from public.sessions where user_id = v_other;
  if n <> 0 then raise exception 'sessions/select-other [user A]: expected 0 rows owned by user B, got %', n; end if;

  select count(*) into n from public.sessions;
  if n <> 1 then raise exception 'sessions/isolation [user A]: expected exactly 1 visible row in the table, got %', n; end if;

  update public.sessions set region_label = v_marker where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'sessions/update-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  -- extra: ownership-reassignment attempt - A must not be able to steal B's row
  update public.sessions set user_id = v_uid where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'sessions/reassign-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  delete from public.sessions where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'sessions/delete-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  -- positive controls: the identical statements work on user A's own row
  update public.sessions set region_label = region_label where id = v_own_session;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'sessions/update-own-control [user A]: expected 1 row affected, got %', n; end if;

  insert into public.sessions (user_id, region_label, view)
  values (v_uid, 'RLS test scratch session', 'front')
  returning id into v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'sessions/insert-own-control [user A]: expected 1 row inserted, got %', n; end if;

  delete from public.sessions where id = v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'sessions/delete-own-control [user A]: expected 1 row deleted, got %', n; end if;

  raise notice 'PASS  sessions          [user A]  select-own 1 | select-other 0 | isolation 1 | update-cross 0 | reassign-cross 0 | delete-cross 0 | own-row controls 1/1/1';
end
$rls$;

-- ---- cards  (ownership key: cards.session_id -> sessions.user_id) ---------
do $rls$
declare
  v_own_session   constant uuid := '5e551010-0000-4000-8000-0000000000a1';  -- owned by A
  v_other_session constant uuid := '5e551010-0000-4000-8000-0000000000b2';  -- owned by B
  v_own_card      constant uuid := 'ca4d0000-0000-4000-8000-0000000000a1';
  v_marker        constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  v_scratch uuid;
  n int;
begin
  select count(*) into n from public.cards where session_id = v_own_session;
  if n <> 1 then raise exception 'cards/select-own [user A]: expected 1 own card, got %', n; end if;

  select count(*) into n from public.cards where session_id = v_other_session;
  if n <> 0 then raise exception 'cards/select-other [user A]: expected 0 cards of user B, got %', n; end if;

  select count(*) into n from public.cards;
  if n <> 1 then raise exception 'cards/isolation [user A]: expected exactly 1 visible row in the table, got %', n; end if;

  update public.cards set duration = v_marker where session_id = v_other_session;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cards/update-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  delete from public.cards where session_id = v_other_session;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cards/delete-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  -- extra: reparenting attempts. B's card must not move into A's session, and
  -- A's own card must not move into B's session - the policy's WITH CHECK
  -- rejects that move, so it either affects 0 rows or raises 42501.
  update public.cards set session_id = v_own_session where session_id = v_other_session;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cards/reparent-other-into-own [user A]: expected 0 rows affected, got %', n; end if;

  begin
    update public.cards set session_id = v_other_session where session_id = v_own_session;
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'cards/reparent-own-into-other [user A]: expected the policy to reject the move, but % row(s) were affected', n;
    end if;
  exception
    when insufficient_privilege then
      null;  -- expected: row-level security WITH CHECK rejected the move
  end;

  -- positive controls: the identical statements work on user A's own card
  update public.cards set duration = duration where id = v_own_card;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'cards/update-own-control [user A]: expected 1 row affected, got %', n; end if;

  insert into public.cards
    (session_id, location_label, quality_words, intensity_metaphor, duration, user_own_sentence)
  values
    (v_own_session, 'RLS test scratch location', array['noticeable','present'],
     'like a quiet background hum', 'a few minutes', 'RLS test scratch sentence')
  returning id into v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'cards/insert-own-control [user A]: expected 1 row inserted, got %', n; end if;

  delete from public.cards where id = v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'cards/delete-own-control [user A]: expected 1 row deleted, got %', n; end if;

  raise notice 'PASS  cards             [user A]  select-own 1 | select-other 0 | isolation 1 | update-cross 0 | delete-cross 0 | reparent 0/rejected | own-row controls 1/1/1';
end
$rls$;

-- ---- journal_entries  (ownership key: journal_entries.user_id) -------------
do $rls$
declare
  v_uid    constant uuid := 'a11ce000-0000-4000-8000-000000000001';  -- acting user: A
  v_other  constant uuid := 'b0b00000-0000-4000-8000-000000000002';  -- other user: B
  v_own    constant uuid := '10a1d000-0000-4000-8000-0000000000a1';
  v_marker constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  v_scratch uuid;
  n int;
begin
  select count(*) into n from public.journal_entries where user_id = v_uid;
  if n <> 1 then raise exception 'journal_entries/select-own [user A]: expected 1 own row, got %', n; end if;

  select count(*) into n from public.journal_entries where user_id = v_other;
  if n <> 0 then raise exception 'journal_entries/select-other [user A]: expected 0 rows owned by user B, got %', n; end if;

  select count(*) into n from public.journal_entries;
  if n <> 1 then raise exception 'journal_entries/isolation [user A]: expected exactly 1 visible row in the table, got %', n; end if;

  update public.journal_entries set draft_text = v_marker where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'journal_entries/update-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  delete from public.journal_entries where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'journal_entries/delete-cross-user [user A -> user B]: expected 0 rows affected, got %', n; end if;

  -- positive controls: the identical statements work on user A's own row
  update public.journal_entries set draft_text = draft_text where id = v_own;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'journal_entries/update-own-control [user A]: expected 1 row affected, got %', n; end if;

  insert into public.journal_entries (user_id, week_start, draft_text)
  values (v_uid, date '2026-01-12', 'RLS test scratch draft')
  returning id into v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'journal_entries/insert-own-control [user A]: expected 1 row inserted, got %', n; end if;

  delete from public.journal_entries where id = v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'journal_entries/delete-own-control [user A]: expected 1 row deleted, got %', n; end if;

  raise notice 'PASS  journal_entries   [user A]  select-own 1 | select-other 0 | isolation 1 | update-cross 0 | delete-cross 0 | own-row controls 1/1/1';
end
$rls$;

-- ===========================================================================
-- 5. Runtime identity - user B. Only the `sub` claim changes; the role stays
--    authenticated, and auth.uid() is verified again before asserting.
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object(
  'sub',  'b0b00000-0000-4000-8000-000000000002',
  'role', 'authenticated',
  'aud',  'authenticated'
)::text, true) as set_jwt_claims_for_user_b;

do $rls$
declare
  v_expected constant uuid := 'b0b00000-0000-4000-8000-000000000002';
begin
  if current_user <> 'authenticated' then
    raise exception 'identity [user B]: current_user is %, expected authenticated', current_user;
  end if;
  if auth.uid() is distinct from v_expected then
    raise exception 'identity [user B]: auth.uid() resolved to %, expected %',
      coalesce(auth.uid()::text, '<null>'), v_expected;
  end if;
  raise notice 'identity [user B]: current_user=authenticated, auth.uid()=%', auth.uid();
end
$rls$;

-- ===========================================================================
-- 6. User B - the same ownership matrix, mirrored. User B's own rows are the
--    ones that must be visible and writable, user A's must not be.
-- ===========================================================================

-- ---- profiles  (ownership key: profiles.user_id) --------------------------
do $rls$
declare
  v_uid    constant uuid := 'b0b00000-0000-4000-8000-000000000002';  -- acting user: B
  v_other  constant uuid := 'a11ce000-0000-4000-8000-000000000001';  -- other user: A
  v_marker constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  n int;
begin
  select count(*) into n from public.profiles where user_id = v_uid;
  if n <> 1 then raise exception 'profiles/select-own [user B]: expected 1 own row, got %', n; end if;

  select count(*) into n from public.profiles where user_id = v_other;
  if n <> 0 then raise exception 'profiles/select-other [user B]: expected 0 rows owned by user A, got %', n; end if;

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'profiles/isolation [user B]: expected exactly 1 visible row in the table, got %', n; end if;

  update public.profiles set display_name = v_marker where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'profiles/update-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  delete from public.profiles where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'profiles/delete-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  -- positive controls: the identical statements work on user B's own row
  update public.profiles set display_name = display_name where user_id = v_uid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profiles/update-own-control [user B]: expected 1 row affected, got %', n; end if;

  delete from public.profiles where user_id = v_uid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profiles/delete-own-control [user B]: expected 1 row deleted, got %', n; end if;

  insert into public.profiles (user_id, display_name)
  values (v_uid, 'RLS test user B');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profiles/insert-own-control [user B]: expected 1 row inserted, got %', n; end if;

  raise notice 'PASS  profiles          [user B]  select-own 1 | select-other 0 | isolation 1 | update-cross 0 | delete-cross 0 | own-row controls 1/1/1';
end
$rls$;

-- ---- sessions  (ownership key: sessions.user_id) --------------------------
do $rls$
declare
  v_uid           constant uuid := 'b0b00000-0000-4000-8000-000000000002';  -- acting user: B
  v_other         constant uuid := 'a11ce000-0000-4000-8000-000000000001';  -- other user: A
  v_own_session   constant uuid := '5e551010-0000-4000-8000-0000000000b2';
  v_marker        constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  v_scratch uuid;
  n int;
begin
  select count(*) into n from public.sessions where user_id = v_uid;
  if n <> 1 then raise exception 'sessions/select-own [user B]: expected 1 own row, got %', n; end if;

  select count(*) into n from public.sessions where user_id = v_other;
  if n <> 0 then raise exception 'sessions/select-other [user B]: expected 0 rows owned by user A, got %', n; end if;

  select count(*) into n from public.sessions;
  if n <> 1 then raise exception 'sessions/isolation [user B]: expected exactly 1 visible row in the table, got %', n; end if;

  update public.sessions set region_label = v_marker where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'sessions/update-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  update public.sessions set user_id = v_uid where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'sessions/reassign-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  delete from public.sessions where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'sessions/delete-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  update public.sessions set region_label = region_label where id = v_own_session;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'sessions/update-own-control [user B]: expected 1 row affected, got %', n; end if;

  insert into public.sessions (user_id, region_label, view)
  values (v_uid, 'RLS test scratch session', 'back')
  returning id into v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'sessions/insert-own-control [user B]: expected 1 row inserted, got %', n; end if;

  delete from public.sessions where id = v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'sessions/delete-own-control [user B]: expected 1 row deleted, got %', n; end if;

  raise notice 'PASS  sessions          [user B]  select-own 1 | select-other 0 | isolation 1 | update-cross 0 | reassign-cross 0 | delete-cross 0 | own-row controls 1/1/1';
end
$rls$;

-- ---- cards  (ownership key: cards.session_id -> sessions.user_id) ---------
do $rls$
declare
  v_own_session   constant uuid := '5e551010-0000-4000-8000-0000000000b2';  -- owned by B
  v_other_session constant uuid := '5e551010-0000-4000-8000-0000000000a1';  -- owned by A
  v_own_card      constant uuid := 'ca4d0000-0000-4000-8000-0000000000b2';
  v_marker        constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  v_scratch uuid;
  n int;
begin
  select count(*) into n from public.cards where session_id = v_own_session;
  if n <> 1 then raise exception 'cards/select-own [user B]: expected 1 own card, got %', n; end if;

  select count(*) into n from public.cards where session_id = v_other_session;
  if n <> 0 then raise exception 'cards/select-other [user B]: expected 0 cards of user A, got %', n; end if;

  select count(*) into n from public.cards;
  if n <> 1 then raise exception 'cards/isolation [user B]: expected exactly 1 visible row in the table, got %', n; end if;

  update public.cards set duration = v_marker where session_id = v_other_session;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cards/update-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  delete from public.cards where session_id = v_other_session;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cards/delete-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  update public.cards set session_id = v_own_session where session_id = v_other_session;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cards/reparent-other-into-own [user B]: expected 0 rows affected, got %', n; end if;

  begin
    update public.cards set session_id = v_other_session where session_id = v_own_session;
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'cards/reparent-own-into-other [user B]: expected the policy to reject the move, but % row(s) were affected', n;
    end if;
  exception
    when insufficient_privilege then
      null;  -- expected: row-level security WITH CHECK rejected the move
  end;

  -- positive controls: the identical statements work on user B's own card
  update public.cards set duration = duration where id = v_own_card;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'cards/update-own-control [user B]: expected 1 row affected, got %', n; end if;

  insert into public.cards
    (session_id, location_label, quality_words, intensity_metaphor, duration, user_own_sentence)
  values
    (v_own_session, 'RLS test scratch location', array['warm','present'],
     'like a soft weight', 'a few hours', 'RLS test scratch sentence')
  returning id into v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'cards/insert-own-control [user B]: expected 1 row inserted, got %', n; end if;

  delete from public.cards where id = v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'cards/delete-own-control [user B]: expected 1 row deleted, got %', n; end if;

  raise notice 'PASS  cards             [user B]  select-own 1 | select-other 0 | isolation 1 | update-cross 0 | delete-cross 0 | reparent 0/rejected | own-row controls 1/1/1';
end
$rls$;

-- ---- journal_entries  (ownership key: journal_entries.user_id) -------------
do $rls$
declare
  v_uid    constant uuid := 'b0b00000-0000-4000-8000-000000000002';  -- acting user: B
  v_other  constant uuid := 'a11ce000-0000-4000-8000-000000000001';  -- other user: A
  v_own    constant uuid := '10a1d000-0000-4000-8000-0000000000b2';
  v_marker constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  v_scratch uuid;
  n int;
begin
  select count(*) into n from public.journal_entries where user_id = v_uid;
  if n <> 1 then raise exception 'journal_entries/select-own [user B]: expected 1 own row, got %', n; end if;

  select count(*) into n from public.journal_entries where user_id = v_other;
  if n <> 0 then raise exception 'journal_entries/select-other [user B]: expected 0 rows owned by user A, got %', n; end if;

  select count(*) into n from public.journal_entries;
  if n <> 1 then raise exception 'journal_entries/isolation [user B]: expected exactly 1 visible row in the table, got %', n; end if;

  update public.journal_entries set draft_text = v_marker where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'journal_entries/update-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  delete from public.journal_entries where user_id = v_other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'journal_entries/delete-cross-user [user B -> user A]: expected 0 rows affected, got %', n; end if;

  -- positive controls: the identical statements work on user B's own row
  update public.journal_entries set draft_text = draft_text where id = v_own;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'journal_entries/update-own-control [user B]: expected 1 row affected, got %', n; end if;

  insert into public.journal_entries (user_id, week_start, draft_text)
  values (v_uid, date '2026-01-12', 'RLS test scratch draft')
  returning id into v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'journal_entries/insert-own-control [user B]: expected 1 row inserted, got %', n; end if;

  delete from public.journal_entries where id = v_scratch;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'journal_entries/delete-own-control [user B]: expected 1 row deleted, got %', n; end if;

  raise notice 'PASS  journal_entries   [user B]  select-own 1 | select-other 0 | isolation 1 | update-cross 0 | delete-cross 0 | own-row controls 1/1/1';
end
$rls$;

-- ===========================================================================
-- 7. Integrity check, back as the connecting superuser (RLS bypassed): the
--    fixtures must be intact, ownership unchanged, and no cross-user mutation
--    may have leaked into any row of the four tables.
-- ===========================================================================
reset role;
\echo 'rls_ownership: identity reset to the connecting role for the integrity check'

do $rls$
declare
  v_marker constant text := 'RLS-TEST-MUTATION-MUST-NOT-PERSIST';
  n int;
begin
  select count(*) into n from public.profiles where user_id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'integrity/profiles [rls_ownership]: expected 2 test profiles to survive, got %', n; end if;
  select count(*) into n from public.sessions where user_id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'integrity/sessions [rls_ownership]: expected 2 test sessions to survive, got %', n; end if;
  select count(*) into n from public.cards where id in ('ca4d0000-0000-4000-8000-0000000000a1','ca4d0000-0000-4000-8000-0000000000b2');
  if n <> 2 then raise exception 'integrity/cards [rls_ownership]: expected 2 test cards to survive, got %', n; end if;
  select count(*) into n from public.journal_entries where user_id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'integrity/journal_entries [rls_ownership]: expected 2 test journal entries to survive, got %', n; end if;

  -- ownership unchanged: no session was reassigned and no card was reparented
  select count(*) into n from public.sessions where id = '5e551010-0000-4000-8000-0000000000a1' and user_id = 'a11ce000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'integrity/session-ownership [rls_ownership]: session A is no longer owned by user A (matching rows: %)', n; end if;
  select count(*) into n from public.sessions where id = '5e551010-0000-4000-8000-0000000000b2' and user_id = 'b0b00000-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'integrity/session-ownership [rls_ownership]: session B is no longer owned by user B (matching rows: %)', n; end if;
  select count(*) into n from public.cards where id = 'ca4d0000-0000-4000-8000-0000000000a1' and session_id = '5e551010-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'integrity/card-ownership [rls_ownership]: card A is no longer attached to session A (matching rows: %)', n; end if;
  select count(*) into n from public.cards where id = 'ca4d0000-0000-4000-8000-0000000000b2' and session_id = '5e551010-0000-4000-8000-0000000000b2';
  if n <> 1 then raise exception 'integrity/card-ownership [rls_ownership]: card B is no longer attached to session B (matching rows: %)', n; end if;

  -- no cross-user mutation leaked anywhere in the four tables
  select (select count(*) from public.profiles        where display_name = v_marker)
       + (select count(*) from public.sessions        where region_label = v_marker)
       + (select count(*) from public.cards           where duration     = v_marker)
       + (select count(*) from public.journal_entries where draft_text   = v_marker)
    into n;
  if n <> 0 then raise exception 'integrity/mutation-leak [rls_ownership]: % row(s) carry the cross-user mutation marker', n; end if;

  raise notice 'PASS  integrity         [superuser]  8 test rows intact | ownership unchanged | 0 mutation markers';
end
$rls$;

-- ===========================================================================
-- 8. Isolation from unrelated records. Still inside the transaction, every row
--    count must equal the pre-test baseline plus exactly the rows this test
--    created (2 per table, 2 auth users). A mismatch means a pre-existing row
--    was created or removed by this test.
-- ===========================================================================
select
  (select count(*) from public.profiles)            = :pre_profiles + 2
  and (select count(*) from public.sessions)        = :pre_sessions + 2
  and (select count(*) from public.cards)           = :pre_cards + 2
  and (select count(*) from public.journal_entries) = :pre_journal + 2
  and (select count(*) from auth.users)             = :pre_auth_users + 2
  as counts_are_baseline_plus_test_rows
\gset

\if :counts_are_baseline_plus_test_rows
\echo 'rls_ownership: row counts = pre-test baseline + exactly the 2 test rows per table'
\else
do $rls$ begin raise exception 'isolation [rls_ownership]: a pre-existing row was created or removed by this test (row counts are not baseline + 2)'; end $rls$;
\endif

-- ===========================================================================
-- 9. Rollback. The only way out of the transaction: this file never commits.
--    The two test users and all ten test rows (2 users, 2 profiles,
--    2 sessions, 2 cards, 2 journal entries) disappear here. If an assertion
--    had failed, psql would have stopped already and the closed session would
--    have rolled the same transaction back.
-- ===========================================================================
rollback;

\echo 'rls_ownership: ROLLBACK issued - no test data was committed'

-- ===========================================================================
-- 10. Rollback verification (read-only, outside the transaction). Proves the
--     cleanup really happened and that every pre-test row count is back.
-- ===========================================================================
do $rls$
declare n int;
begin
  select count(*) into n from auth.users where id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 0 then raise exception 'cleanup/rollback [rls_ownership]: % test auth.users row(s) survived the rollback', n; end if;
  select count(*) into n from public.profiles where user_id in ('a11ce000-0000-4000-8000-000000000001','b0b00000-0000-4000-8000-000000000002');
  if n <> 0 then raise exception 'cleanup/rollback [rls_ownership]: % test profiles row(s) survived the rollback', n; end if;
  select count(*) into n from public.sessions where id in ('5e551010-0000-4000-8000-0000000000a1','5e551010-0000-4000-8000-0000000000b2');
  if n <> 0 then raise exception 'cleanup/rollback [rls_ownership]: % test sessions row(s) survived the rollback', n; end if;
  select count(*) into n from public.cards where id in ('ca4d0000-0000-4000-8000-0000000000a1','ca4d0000-0000-4000-8000-0000000000b2');
  if n <> 0 then raise exception 'cleanup/rollback [rls_ownership]: % test cards row(s) survived the rollback', n; end if;
  select count(*) into n from public.journal_entries where id in ('10a1d000-0000-4000-8000-0000000000a1','10a1d000-0000-4000-8000-0000000000b2');
  if n <> 0 then raise exception 'cleanup/rollback [rls_ownership]: % test journal_entries row(s) survived the rollback', n; end if;

  -- the simulated identity is gone as well
  if auth.uid() is not null then
    raise exception 'cleanup/rollback [rls_ownership]: auth.uid() still resolves after the rollback';
  end if;

  raise notice 'PASS  cleanup           [post-rollback]  test users and all test rows are gone, auth.uid() is null again';
end
$rls$;

select
  (select count(*) from public.profiles)            = :pre_profiles
  and (select count(*) from public.sessions)        = :pre_sessions
  and (select count(*) from public.cards)           = :pre_cards
  and (select count(*) from public.journal_entries) = :pre_journal
  and (select count(*) from auth.users)             = :pre_auth_users
  as baseline_restored
\gset

\if :baseline_restored
\echo 'rls_ownership: baseline restored - every row count equals its pre-test value'
\else
do $rls$ begin raise exception 'cleanup/rollback [rls_ownership]: a table row count differs from its pre-test baseline after the rollback'; end $rls$;
\endif

\echo 'rls_ownership: ALL ASSERTIONS PASSED - rollback performed, nothing committed'
\echo 'rls_ownership: note - Storage object policies are NOT covered by this test'
