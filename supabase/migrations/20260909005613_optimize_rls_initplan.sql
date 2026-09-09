-- Feature 1: Supabase project & schema
-- Corrective migration: the performance advisor flagged 23 policies that
-- re-evaluate auth.uid() once per row. Wrapping it as `(select auth.uid())`
-- lets Postgres evaluate it once per query (the standard Supabase RLS
-- performance pattern). Drop and recreate each policy with the same
-- authorization logic, just wrapped.

-- profiles
drop policy profiles_select on public.profiles;
drop policy profiles_insert on public.profiles;
drop policy profiles_update on public.profiles;

create policy profiles_select on public.profiles
  for select
  using (id = (select auth.uid()) or public.is_administrator((select auth.uid())));

create policy profiles_insert on public.profiles
  for insert
  with check (public.is_administrator((select auth.uid())));

create policy profiles_update on public.profiles
  for update
  using (public.is_administrator((select auth.uid())))
  with check (public.is_administrator((select auth.uid())));

-- events
drop policy events_select on public.events;
drop policy events_insert on public.events;
drop policy events_update on public.events;

create policy events_select on public.events
  for select
  using (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), id)
  );

create policy events_insert on public.events
  for insert
  with check (public.is_administrator((select auth.uid())));

create policy events_update on public.events
  for update
  using (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), id)
  )
  with check (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), id)
  );

-- event_settings
drop policy event_settings_select on public.event_settings;
drop policy event_settings_insert on public.event_settings;
drop policy event_settings_update on public.event_settings;

create policy event_settings_select on public.event_settings
  for select
  using (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  );

create policy event_settings_insert on public.event_settings
  for insert
  with check (public.is_administrator((select auth.uid())));

create policy event_settings_update on public.event_settings
  for update
  using (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  )
  with check (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  );

-- event_manager_assignments
drop policy event_manager_assignments_select on public.event_manager_assignments;
drop policy event_manager_assignments_insert on public.event_manager_assignments;
drop policy event_manager_assignments_update on public.event_manager_assignments;

create policy event_manager_assignments_select on public.event_manager_assignments
  for select
  using (
    public.is_administrator((select auth.uid()))
    or event_manager_id = (select auth.uid())
  );

create policy event_manager_assignments_insert on public.event_manager_assignments
  for insert
  with check (public.is_administrator((select auth.uid())));

create policy event_manager_assignments_update on public.event_manager_assignments
  for update
  using (public.is_administrator((select auth.uid())))
  with check (public.is_administrator((select auth.uid())));

-- event_templates
drop policy event_templates_select on public.event_templates;
drop policy event_templates_insert on public.event_templates;
drop policy event_templates_update on public.event_templates;

create policy event_templates_select on public.event_templates
  for select
  using (public.is_administrator((select auth.uid())));

create policy event_templates_insert on public.event_templates
  for insert
  with check (public.is_administrator((select auth.uid())));

create policy event_templates_update on public.event_templates
  for update
  using (public.is_administrator((select auth.uid())))
  with check (public.is_administrator((select auth.uid())));

-- attendee_types
drop policy attendee_types_select on public.attendee_types;
drop policy attendee_types_insert on public.attendee_types;
drop policy attendee_types_update on public.attendee_types;

create policy attendee_types_select on public.attendee_types
  for select
  using (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  );

create policy attendee_types_insert on public.attendee_types
  for insert
  with check (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  );

create policy attendee_types_update on public.attendee_types
  for update
  using (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  )
  with check (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  );

-- topics
drop policy topics_select on public.topics;
drop policy topics_insert on public.topics;
drop policy topics_update on public.topics;

create policy topics_select on public.topics
  for select
  using (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  );

create policy topics_insert on public.topics
  for insert
  with check (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  );

create policy topics_update on public.topics
  for update
  using (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  )
  with check (
    public.is_administrator((select auth.uid()))
    or public.is_event_manager_for((select auth.uid()), event_id)
  );

-- audit_logs
drop policy audit_logs_select on public.audit_logs;

create policy audit_logs_select on public.audit_logs
  for select
  using (public.is_administrator((select auth.uid())));

-- reports
drop policy reports_select on public.reports;

create policy reports_select on public.reports
  for select
  using (public.is_administrator((select auth.uid())));
