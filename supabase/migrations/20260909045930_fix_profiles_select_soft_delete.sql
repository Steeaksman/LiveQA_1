-- Feature 3: Event Manager accounts & permissions
-- Corrective migration: profiles_select's self-read clause did not exclude
-- soft-deleted rows, so a revoked account could still read its own profile
-- and appear authenticated even though every other table already denies it
-- (is_administrator/is_event_manager_for both filter deleted_at is null).

drop policy profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select
  using (
    deleted_at is null
    and (id = (select auth.uid()) or is_administrator((select auth.uid())))
  );
