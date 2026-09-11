-- Feature 11b: Branding: logo & sponsor logo
-- Creates a private Storage bucket for event branding images (all access
-- goes through service-role server routes, matching this project's
-- established pattern from 29a - no Storage RLS policies needed) and the
-- two nullable event_settings columns that reference the uploaded objects.

insert into storage.buckets (id, name, public)
values ('event-branding', 'event-branding', false);

alter table public.event_settings
  add column logo_storage_path text,
  add column sponsor_logo_storage_path text;
