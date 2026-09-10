-- Feature 18: Anonymous questions & attendee-type visibility
-- Default 'always' preserves existing behavior: every question so far has
-- already been rendered with no identity shown at all.

create type public.anonymity_mode as enum ('named', 'optional', 'always');

alter table public.event_settings
  add column anonymity_mode public.anonymity_mode not null default 'always',
  add column show_attendee_type boolean not null default false;
