-- Feature 17: My Questions & attendee edit/delete
-- 0 means the feature is disabled for the event; a positive value is the
-- number of minutes after creation an attendee may still edit/delete
-- their own question.

alter table public.event_settings
  add column attendee_edit_window_minutes integer not null default 0
    check (attendee_edit_window_minutes >= 0);
