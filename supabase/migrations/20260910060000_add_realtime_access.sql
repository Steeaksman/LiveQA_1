-- Feature 25: Realtime sync
-- Adds the first real RLS-based read access for anon/authenticated,
-- narrowly scoped to enable Supabase Realtime postgres_changes
-- subscriptions on public question/vote activity. This does not replace
-- the service-role server routes, which remain the sole path for every
-- normal read and write; these policies exist only so a client-side
-- Realtime channel can receive change notifications, and only for
-- already-public content. Column grants are minimal so a realtime
-- payload never carries attendee_id or question text - a subscribed
-- client uses each event only as a signal to refetch the existing,
-- fully-redacted REST response.

alter table public.votes add column event_id uuid references public.events (id) on delete cascade;
update public.votes v set event_id = q.event_id from public.questions q where q.id = v.question_id;
alter table public.votes alter column event_id set not null;
create index votes_event_id_idx on public.votes (event_id);

create policy questions_realtime_select on public.questions
  for select
  to anon, authenticated
  using (visibility = 'public' and deleted_at is null);

create policy votes_realtime_select on public.votes
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.questions q
      where q.id = votes.question_id
        and q.visibility = 'public'
        and q.deleted_at is null
    )
  );

revoke select on public.questions from anon, authenticated;
grant select (id, event_id) on public.questions to anon, authenticated;

revoke select on public.votes from anon, authenticated;
grant select (id, event_id, question_id) on public.votes to anon, authenticated;

alter publication supabase_realtime add table public.questions;
alter publication supabase_realtime add table public.votes;
