-- Feature 3: Event Manager accounts & permissions
-- PostgREST never exposes the auth schema to clients (even administrators),
-- so listing accounts by email needs a denormalized copy on profiles.
-- Backfilled here for any existing profile; set going forward by whatever
-- creates the account (scripts/create-admin.mjs, the Event Manager create
-- route).

alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id;
