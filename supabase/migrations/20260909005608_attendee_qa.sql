-- Feature 1: Supabase project & schema
-- Attendee identity, topics, questions, votes, replies, attachments, content reports.

create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.visibility_state as enum ('hidden', 'public');

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index topics_event_id_idx on public.topics (event_id);
create unique index topics_one_current_per_event
  on public.topics (event_id)
  where is_current and deleted_at is null;

create trigger set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  token text not null,
  display_name text,
  attendee_type_id uuid references public.attendee_types (id),
  banned_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index attendees_token_key on public.attendees (token) where deleted_at is null;
create index attendees_event_id_idx on public.attendees (event_id);
create index attendees_attendee_type_id_idx on public.attendees (attendee_type_id);

create trigger set_updated_at
  before update on public.attendees
  for each row execute function public.set_updated_at();

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  topic_id uuid references public.topics (id),
  attendee_id uuid not null references public.attendees (id),
  text text not null,
  anonymous boolean not null default false,
  approval_status public.approval_status not null default 'pending',
  visibility public.visibility_state not null default 'hidden',
  answered boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index questions_event_id_idx on public.questions (event_id);
create index questions_topic_id_idx on public.questions (topic_id);
create index questions_attendee_id_idx on public.questions (attendee_id);
create index questions_event_visibility_idx on public.questions (event_id, visibility);

create trigger set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

create table public.question_revisions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  original_text text not null,
  revised_text text not null,
  edited_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index question_revisions_question_id_idx on public.question_revisions (question_id);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index votes_question_attendee_key on public.votes (question_id, attendee_id);
create index votes_attendee_id_idx on public.votes (attendee_id);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  attendee_id uuid references public.attendees (id),
  text text not null,
  approval_status public.approval_status not null default 'pending',
  visibility public.visibility_state not null default 'hidden',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index replies_question_id_idx on public.replies (question_id);

create trigger set_updated_at
  before update on public.replies
  for each row execute function public.set_updated_at();

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index attachments_question_id_idx on public.attachments (question_id);

create trigger set_updated_at
  before update on public.attachments
  for each row execute function public.set_updated_at();

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  question_id uuid references public.questions (id) on delete cascade,
  reply_id uuid references public.replies (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint content_reports_exactly_one_target check (
    num_nonnulls (question_id, reply_id) = 1
  )
);

create unique index content_reports_attendee_question_key
  on public.content_reports (attendee_id, question_id)
  where question_id is not null;
create unique index content_reports_attendee_reply_key
  on public.content_reports (attendee_id, reply_id)
  where reply_id is not null;
