-- Feature 4b: Question/moderation/voting settings step
-- Adds the event_settings columns Features 13/14/19-21 will read from.
-- This migration only stores the choices; nothing enforces them yet.

create type public.moderation_mode as enum ('immediate', 'queue');

alter table public.event_settings
  add column question_max_length integer not null default 500 check (question_max_length > 0),
  add column moderation_mode public.moderation_mode not null default 'queue',
  add column hide_vote_counts boolean not null default false;
