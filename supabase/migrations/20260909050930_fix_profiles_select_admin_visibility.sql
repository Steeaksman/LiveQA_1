-- Feature 3: Event Manager accounts & permissions
-- Corrective migration: the previous profiles_select fix applied
-- `deleted_at is null` to the whole policy, which also hid revoked
-- profiles from administrators - breaking the ability to see and restore
-- them. The soft-delete check should only gate the self-read branch.

drop policy profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select
  using (
    is_administrator((select auth.uid()))
    or (deleted_at is null and id = (select auth.uid()))
  );
