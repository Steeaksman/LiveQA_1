-- Feature 1: Supabase project & schema
-- Identity (profiles) and event administration core tables.

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create type public.profile_role as enum ('administrator', 'event_manager');
create type public.em_scope as enum ('global', 'restricted');
create type public.event_status as enum ('draft', 'scheduled', 'live', 'closed', 'archived');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.profile_role not null,
  em_scope public.em_scope,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_em_scope_matches_role check (
    (role = 'event_manager' and em_scope is not null)
    or (role = 'administrator' and em_scope is null)
  )
);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  join_code text not null,
  name text not null,
  status public.event_status not null default 'draft',
  submissions_open boolean not null default false,
  voting_open boolean not null default false,
  moderator_access_enabled boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index events_slug_key on public.events (slug) where deleted_at is null;
create unique index events_join_code_key on public.events (join_code) where deleted_at is null;
create index events_created_by_idx on public.events (created_by);

create trigger set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create table public.event_settings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index event_settings_event_id_key on public.event_settings (event_id) where deleted_at is null;

create trigger set_updated_at
  before update on public.event_settings
  for each row execute function public.set_updated_at();

create table public.event_manager_assignments (
  id uuid primary key default gen_random_uuid(),
  event_manager_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  granted_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index event_manager_assignments_unique
  on public.event_manager_assignments (event_manager_id, event_id)
  where deleted_at is null;
create index event_manager_assignments_event_id_idx on public.event_manager_assignments (event_id);

create trigger set_updated_at
  before update on public.event_manager_assignments
  for each row execute function public.set_updated_at();

create table public.event_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger set_updated_at
  before update on public.event_templates
  for each row execute function public.set_updated_at();

create table public.attendee_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index attendee_types_event_id_label_key
  on public.attendee_types (event_id, label)
  where deleted_at is null;

create trigger set_updated_at
  before update on public.attendee_types
  for each row execute function public.set_updated_at();
