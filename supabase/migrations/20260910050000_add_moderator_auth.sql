-- Feature 19: Moderator authentication
-- Per-event moderator password hash and rate-limiting state. The
-- `events.moderator_access_enabled` toggle and the `moderator_sessions`
-- table already exist (Feature 1) and need no change.

alter table public.event_settings
  add column moderator_password_hash text,
  add column moderator_failed_attempts integer not null default 0,
  add column moderator_locked_until timestamptz;
