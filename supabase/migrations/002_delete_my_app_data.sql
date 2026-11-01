-- SomaMap - delete-everything helper - blueprint Chapter 6.1, Table 12 row 8 and T8.
--
-- Why this exists: PostgREST issues one statement per request, so the application rows of
-- a delete-everything cannot be removed in one transaction from the client. A single
-- function call is one transaction, which is what makes the row half atomic.
--
-- SECURITY: this function is `security invoker` on purpose. It runs as the calling user,
-- so row-level security is still in force and the function can only ever reach that
-- user's own rows - `auth.uid()` is the only identity it uses. A `security definer`
-- function would bypass every policy in 001_init.sql and is explicitly not used here.
-- It is granted to `authenticated` only, so an anonymous request cannot call it.
--
-- Cards are never deleted here: they carry no user column, and they belong to a session.
-- Deleting the sessions takes the cards with them through the existing
-- `cards_session_id_fkey ... on delete cascade`, which is also how T8 proves the cascade.
--
-- The result reports what REMAINS, not what was removed, so the caller's success test is
-- simply "everything came back zero" and a repeated run is safe by construction.
--
-- Rerun safety: create or replace, and the grants are idempotent.

begin;

create or replace function public.delete_my_app_data()
returns table (
  sessions_remaining        integer,
  cards_remaining           integer,
  journal_entries_remaining integer,
  profiles_remaining        integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'delete_my_app_data requires an authenticated user';
  end if;

  delete from public.sessions where user_id = v_user;
  delete from public.journal_entries where user_id = v_user;
  delete from public.profiles where user_id = v_user;

  return query
    select
      (select count(*)::integer from public.sessions        where user_id = v_user),
      (select count(*)::integer
         from public.cards c
         join public.sessions s on s.id = c.session_id
        where s.user_id = v_user),
      (select count(*)::integer from public.journal_entries where user_id = v_user),
      (select count(*)::integer from public.profiles        where user_id = v_user);
end;
$$;

revoke all on function public.delete_my_app_data() from public;
revoke all on function public.delete_my_app_data() from anon;
grant execute on function public.delete_my_app_data() to authenticated;

commit;
