-- Feature 36: Supabase free-tier usage guardrails
-- A single global settings row for admin-configurable usage thresholds,
-- and a narrowly-scoped function to read the database's own size (the
-- built-in pg_database_size is not directly callable via PostgREST
-- since it lives outside any exposed schema).
--
-- Default thresholds are 70%/90% of Supabase's Free plan limits verified
-- at the time this feature was built (500 MB database, 1 GB storage,
-- 200 concurrent Realtime connections) - starting points the admin can
-- adjust, not permanently fixed values.

create table public.usage_guardrail_thresholds (
  id uuid primary key default gen_random_uuid(),
  active_count_warning_threshold integer not null default 140,
  active_count_critical_threshold integer not null default 180,
  db_size_warning_bytes bigint not null default 367001600,
  db_size_critical_bytes bigint not null default 471859200,
  storage_warning_bytes bigint not null default 751619277,
  storage_critical_bytes bigint not null default 966367642,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.usage_guardrail_thresholds default values;

create trigger set_updated_at
  before update on public.usage_guardrail_thresholds
  for each row execute function public.set_updated_at();

alter table public.usage_guardrail_thresholds enable row level security;

create policy usage_guardrail_thresholds_select on public.usage_guardrail_thresholds
  for select
  using (public.is_administrator(auth.uid()));

create policy usage_guardrail_thresholds_update on public.usage_guardrail_thresholds
  for update
  using (public.is_administrator(auth.uid()))
  with check (public.is_administrator(auth.uid()));

create function public.get_database_size_bytes()
returns bigint
language sql
stable
as $$
  select pg_database_size(current_database());
$$;

revoke execute on function public.get_database_size_bytes() from public;
grant execute on function public.get_database_size_bytes() to service_role;
