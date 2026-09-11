-- Feature 28b: Reply reporting & realtime
-- Adds real-time access for replies, mirroring Feature 25's exact
-- pattern for questions/votes: a denormalized event_id for per-event
-- Realtime filtering, a narrow RLS policy scoped to already-public
-- content, and minimal column grants so a realtime payload never
-- carries attendee_id or reply text - a subscribed client uses each
-- event only as a signal to refetch the existing, fully-redacted REST
-- response.

alter table public.replies add column event_id uuid references public.events (id) on delete cascade;
update public.replies r set event_id = q.event_id from public.questions q where q.id = r.question_id;
alter table public.replies alter column event_id set not null;
create index replies_event_id_idx on public.replies (event_id);

create policy replies_realtime_select on public.replies
  for select
  to anon, authenticated
  using (
    visibility = 'public' and deleted_at is null
    and exists (
      select 1 from public.questions q
      where q.id = replies.question_id
        and q.visibility = 'public'
        and q.deleted_at is null
    )
  );

revoke select on public.replies from anon, authenticated;
grant select (id, event_id, question_id) on public.replies to anon, authenticated;

alter publication supabase_realtime add table public.replies;
