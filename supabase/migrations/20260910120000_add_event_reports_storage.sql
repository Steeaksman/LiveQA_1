-- Feature 34a: Report data aggregation, CSV & printable HTML export
-- Creates a private Storage bucket for generated event reports (all
-- access goes through service-role server routes, matching this
-- project's established pattern - no Storage RLS policies needed).

insert into storage.buckets (id, name, public)
values ('event-reports', 'event-reports', false);
