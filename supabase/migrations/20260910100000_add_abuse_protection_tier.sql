-- Feature 30a: Rate limiting, temporary bans & duplicate-check tier
-- Adds the per-event Open/Standard/Strict abuse-protection tier, matching
-- the enum-plus-alter-table shape already used for moderation_mode,
-- anonymity_mode, and duplicate_check_strictness.

create type public.abuse_protection_tier as enum ('open', 'standard', 'strict');

alter table public.event_settings
  add column abuse_protection_tier public.abuse_protection_tier not null default 'standard';
