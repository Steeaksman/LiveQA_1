-- Feature 1: Supabase project & schema
-- Corrective migration.
--
-- 1. Supabase grants EXECUTE on new public-schema functions directly to
--    anon/authenticated/service_role by default (not only via PUBLIC), so
--    the previous migration's "revoke from public" left anon's own grant
--    in place. Revoke explicitly from anon and authenticated, then
--    re-grant to authenticated only (still required for RLS policies to
--    evaluate for real Administrator/Event Manager sessions).
-- 2. Add the 7 foreign-key indexes the performance advisor flagged as
--    missing - these are exactly the "indexes on hot paths" the spec
--    calls for and were simply missed the first time.

revoke execute on function public.is_administrator(uuid) from anon, authenticated;
revoke execute on function public.is_event_manager_for(uuid, uuid) from anon, authenticated;

grant execute on function public.is_administrator(uuid) to authenticated;
grant execute on function public.is_event_manager_for(uuid, uuid) to authenticated;

create index content_reports_question_id_idx on public.content_reports (question_id);
create index content_reports_reply_id_idx on public.content_reports (reply_id);
create index event_manager_assignments_granted_by_idx on public.event_manager_assignments (granted_by);
create index event_templates_created_by_idx on public.event_templates (created_by);
create index question_revisions_edited_by_idx on public.question_revisions (edited_by);
create index replies_attendee_id_idx on public.replies (attendee_id);
create index reports_generated_by_idx on public.reports (generated_by);
