-- Feature 1: Supabase project & schema
-- Moderator sessions, generated reports, administrative audit log.

create table public.moderator_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  session_token text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index moderator_sessions_token_key
  on public.moderator_sessions (session_token)
  where deleted_at is null;
create index moderator_sessions_event_id_idx on public.moderator_sessions (event_id);

create trigger set_updated_at
  before update on public.moderator_sessions
  for each row execute function public.set_updated_at();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  generated_by uuid not null references public.profiles (id),
  report_type text not null,
  format text not null,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index reports_event_id_idx on public.reports (event_id);

create trigger set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  event_id uuid references public.events (id),
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index audit_logs_event_id_idx on public.audit_logs (event_id);
