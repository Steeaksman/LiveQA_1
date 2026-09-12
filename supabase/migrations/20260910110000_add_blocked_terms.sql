-- Feature 30b: Blocked-term filtering
-- A global, Administrator-only blocked-term list, mirroring
-- event_templates' exact table/RLS shape (administrator-only; no Event
-- Manager permission is described anywhere for this).

create table public.blocked_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index blocked_terms_term_key on public.blocked_terms (lower(term)) where deleted_at is null;

create trigger set_updated_at
  before update on public.blocked_terms
  for each row execute function public.set_updated_at();

alter table public.blocked_terms enable row level security;

create policy blocked_terms_select on public.blocked_terms
  for select
  using (public.is_administrator(auth.uid()));

create policy blocked_terms_insert on public.blocked_terms
  for insert
  with check (public.is_administrator(auth.uid()));

create policy blocked_terms_update on public.blocked_terms
  for update
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));
