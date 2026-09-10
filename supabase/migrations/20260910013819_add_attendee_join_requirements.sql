-- Feature 12: Attendee join flow & device identity
-- Lets an admin require a name and/or an attendee type at join time.

alter table public.event_settings
  add column require_attendee_name boolean not null default false,
  add column require_attendee_type boolean not null default false;
