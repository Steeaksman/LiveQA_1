-- Feature 15: Duplicate-question suggestions
-- Trigram similarity search over public questions, at an admin-configurable
-- per-event strictness level.

create extension if not exists pg_trgm;

create type public.duplicate_check_strictness as enum ('off', 'low', 'medium', 'high');

alter table public.event_settings
  add column duplicate_check_strictness public.duplicate_check_strictness not null default 'off';

create index questions_text_trgm_idx on public.questions using gin (text gin_trgm_ops);

create function public.find_similar_questions(
  p_event_id uuid,
  p_query text,
  p_threshold real,
  p_limit integer
)
returns table (id uuid, text text, score real)
language sql
security invoker
stable
as $$
  select q.id, q.text, similarity(q.text, p_query) as score
  from public.questions q
  where q.event_id = p_event_id
    and q.visibility = 'public'
    and q.deleted_at is null
    and similarity(q.text, p_query) >= p_threshold
  order by score desc
  limit p_limit;
$$;

revoke all on function public.find_similar_questions(uuid, text, real, integer) from public;
grant execute on function public.find_similar_questions(uuid, text, real, integer) to service_role;
