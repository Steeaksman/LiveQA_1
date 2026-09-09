-- Feature 1: Supabase project & schema
-- Corrective migration: harden the helper functions the advisors flagged.
--
-- 1. set_updated_at() had a mutable search_path (WARN).
-- 2. is_administrator/is_event_manager_for were callable by anon over
--    PostgREST RPC (WARN) - they exist only to be called from inside RLS
--    policies, never directly by a client. Revoke from PUBLIC and grant
--    only to authenticated, which RLS policies still need in order to
--    evaluate for real Administrator/Event Manager sessions.
--    `authenticated` remaining able to call them directly via RPC is an
--    accepted residual (WARN): both return only a boolean, and the
--    function must stay executable by that role for RLS itself to work.

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.is_administrator(uuid) from public;
revoke execute on function public.is_event_manager_for(uuid, uuid) from public;

grant execute on function public.is_administrator(uuid) to authenticated;
grant execute on function public.is_event_manager_for(uuid, uuid) to authenticated;
