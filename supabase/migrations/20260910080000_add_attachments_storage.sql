-- Feature 29a: Attachments - Storage groundwork, upload & attendee UI
-- Creates a private Storage bucket for question attachments (all access
-- goes through service-role server routes, matching this project's
-- established pattern - no Storage RLS policies needed) and the two
-- event-configurable numeric limits. File-type validation is a fixed,
-- server-side security allowlist, not per-event configurable - see the
-- feature spec for why.

insert into storage.buckets (id, name, public)
values ('question-attachments', 'question-attachments', false);

alter table public.event_settings
  add column attachment_max_count integer not null default 0
    check (attachment_max_count >= 0),
  add column attachment_max_size_bytes bigint not null default 5242880
    check (attachment_max_size_bytes >= 0);
