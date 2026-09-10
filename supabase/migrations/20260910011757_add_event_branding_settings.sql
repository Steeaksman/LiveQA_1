-- Feature 11a: Branding: colors, text, dark mode
-- Adds the event_settings columns Feature 12+ will read from to style the
-- attendee-facing pages. This migration only stores the choices; nothing
-- applies them yet.

create type public.theme_mode as enum ('light', 'dark', 'system');

alter table public.event_settings
  add column accent_color text,
  add column background_color text,
  add column welcome_text text,
  add column theme_mode public.theme_mode not null default 'system';
