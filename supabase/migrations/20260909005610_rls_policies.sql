-- Feature 1: Supabase project & schema
-- RLS on every application table.
--
-- Administrator/Event Manager tables get full auth.uid()-based policies.
-- Attendee/moderator/Q&A tables are enabled with NO policies (default-deny
-- for anon/authenticated; the service role bypasses RLS and is the only
-- writer until Features 12/19/25 define the real token/session-based
-- access rules). audit_logs and reports are Administrator-read-only with
-- no client write policy for any role.

create function public.is_administrator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'administrator' and deleted_at is null
  );
$$;

create function public.is_event_manager_for(uid uuid, target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.role = 'event_manager'
      and p.deleted_at is null
      and (
        p.em_scope = 'global'
        or exists (
          select 1 from public.event_manager_assignments ema
          where ema.event_manager_id = p.id
            and ema.event_id = target_event_id
            and ema.deleted_at is null
        )
      )
  );
$$;

-- profiles
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select
  using (id = auth.uid() or public.is_administrator(auth.uid()));

create policy profiles_insert on public.profiles
  for insert
  with check (public.is_administrator(auth.uid()));

create policy profiles_update on public.profiles
  for update
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));

-- events
alter table public.events enable row level security;

create policy events_select on public.events
  for select
  using (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), id)
  );

create policy events_insert on public.events
  for insert
  with check (public.is_administrator(auth.uid()));

create policy events_update on public.events
  for update
  using (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), id)
  )
  with check (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), id)
  );

-- event_settings
alter table public.event_settings enable row level security;

create policy event_settings_select on public.event_settings
  for select
  using (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  );

create policy event_settings_insert on public.event_settings
  for insert
  with check (public.is_administrator(auth.uid()));

create policy event_settings_update on public.event_settings
  for update
  using (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  )
  with check (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  );

-- event_manager_assignments
alter table public.event_manager_assignments enable row level security;

create policy event_manager_assignments_select on public.event_manager_assignments
  for select
  using (
    public.is_administrator(auth.uid())
    or event_manager_id = auth.uid()
  );

create policy event_manager_assignments_insert on public.event_manager_assignments
  for insert
  with check (public.is_administrator(auth.uid()));

create policy event_manager_assignments_update on public.event_manager_assignments
  for update
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));

-- event_templates (administrator-only; no Event Manager template permission
-- is described yet)
alter table public.event_templates enable row level security;

create policy event_templates_select on public.event_templates
  for select
  using (public.is_administrator(auth.uid()));

create policy event_templates_insert on public.event_templates
  for insert
  with check (public.is_administrator(auth.uid()));

create policy event_templates_update on public.event_templates
  for update
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));

-- attendee_types
alter table public.attendee_types enable row level security;

create policy attendee_types_select on public.attendee_types
  for select
  using (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  );

create policy attendee_types_insert on public.attendee_types
  for insert
  with check (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  );

create policy attendee_types_update on public.attendee_types
  for update
  using (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  )
  with check (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  );

-- topics
alter table public.topics enable row level security;

create policy topics_select on public.topics
  for select
  using (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  );

create policy topics_insert on public.topics
  for insert
  with check (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  );

create policy topics_update on public.topics
  for update
  using (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  )
  with check (
    public.is_administrator(auth.uid())
    or public.is_event_manager_for(auth.uid(), event_id)
  );

-- Attendee/moderator/Q&A tables: RLS enabled, no policies. Default-deny for
-- anon/authenticated. Service role (server-only) bypasses RLS and is the
-- only writer until Features 12, 19, and 25 define real access rules.
alter table public.attendees enable row level security;
alter table public.questions enable row level security;
alter table public.question_revisions enable row level security;
alter table public.votes enable row level security;
alter table public.replies enable row level security;
alter table public.attachments enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderator_sessions enable row level security;

-- audit_logs and reports: Administrator read-only, no client write policy
-- for any role (writes only ever come from server routes using the
-- service-role key).
alter table public.audit_logs enable row level security;

create policy audit_logs_select on public.audit_logs
  for select
  using (public.is_administrator(auth.uid()));

alter table public.reports enable row level security;

create policy reports_select on public.reports
  for select
  using (public.is_administrator(auth.uid()));
