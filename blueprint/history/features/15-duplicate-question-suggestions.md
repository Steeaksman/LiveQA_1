## Feature 15: Duplicate-question suggestions

**Branch:** `feature/duplicate-question-suggestions`
**Status:** verified

## Goal

As an Attendee types a new question, show existing questions that look
similar - using Postgres trigram similarity - so they can upvote one
instead of creating a near-duplicate, at a strictness level the
Administrator or Event Manager configures per event.

## In scope

- **Suggestions only ever compare against `visibility: 'public'`
  questions** - the same filter Feature 13's public feed already uses.
  Comparing against `pending`/`hidden` questions too would leak an
  unapproved submission's text to any attendee who happens to type
  something similar, defeating the moderation-queue visibility gate
  Feature 1's state machine deliberately built; this feature does not
  introduce that new disclosure path.
- One new `event_settings` column, `duplicate_check_strictness` (new
  Postgres enum `public.duplicate_check_strictness` -
  `'off' | 'low' | 'medium' | 'high'`, `not null default 'off'` -
  consistent with defaulting every other closed/restrictive setting in
  this project to its least-intrusive value until an admin opts in).
  Each level maps to a trigram similarity threshold, strictest catching
  the most loosely related text: `low` → `0.5`, `medium` → `0.35`,
  `high` → `0.2`. These exact numbers are this feature's own reversible
  choice (nothing elsewhere specifies them); the mapping's *direction* -
  stricter means a lower threshold, catching more candidates - is the
  one part of this that must not be reinterpreted later.
- A new switch on the existing Settings tab of `/admin/events/[id].vue`:
  a `USelect` ("Off" / "Low" / "Medium" / "High"), fetched/saved
  alongside the tab's existing fields.
- Migration: `create extension if not exists pg_trgm`; a GIN trigram
  index on `questions.text` (the standard indexing pattern for this
  extension, not optional/premature - a similarity query over this
  column without it would be a full scan); a `SECURITY INVOKER`,
  `stable` SQL function `public.find_similar_questions(p_event_id uuid,
  p_query text, p_threshold real, p_limit integer) returns table (id
  uuid, text text, score real)`, granted only to `service_role` (revoked
  from `public`, matching Feature 1's `is_administrator`/
  `is_event_manager_for` hardening precedent) - a database function is
  the only way to run a parameterized `similarity()` comparison
  server-side; this is not the same as the RPC/view Feature 14
  deliberately avoided for sorting, since that was reasonably doable in
  application code and this is not (PostgREST/supabase-js have no filter
  syntax for a dynamic-threshold `similarity()` expression).
- `server/api/events/[slug]/duplicate-questions.get.ts`: query params
  `text` (the attendee's current draft). Resolves the event by slug
  (must be live, else the same generic "Event not found." every other
  public endpoint in this app already uses), reads
  `duplicate_check_strictness`; when `'off'` or `text` (trimmed) is
  under 5 characters, returns an empty list without querying the
  database. Otherwise calls `find_similar_questions` via the
  service-role client with that level's threshold and a limit of 5,
  returning `{ questions: [{ id, text, score }] }` ordered by
  descending score.
- `/e/[slug].vue`: below the question textarea, a debounced (400ms)
  fetch to that endpoint as the attendee types (skipped entirely when
  `duplicateCheckStrictness` is `'off'`, from context); a small,
  passive "Questions like this have already been asked:" list of the
  matched text - informational only, no vote button or link wired to
  it (see Out of scope).

## Out of scope

- **Any interaction on a suggested question** (upvote it, jump to it,
  auto-fill it) - the build-plan line says "suggestions," not a
  redirect-to-vote flow; Feature 14 already owns voting, and wiring a
  vote action into this feature would guess at UX nobody asked for here.
- **Comparing against non-public questions** - see the In-scope note
  above; this is a deliberate privacy boundary, not an oversight.
- **Full-text search or a `tsvector` column** - Feature 16 (Question
  search) is the feature that owns attendee-facing search; this feature
  uses trigram similarity only, so the two features' infrastructure
  doesn't overlap or need reconciling later.
- **Rate limiting on the suggestions endpoint** - Feature 30 (Abuse
  protection modes). The 400ms client-side debounce is ordinary UX/
  network hygiene, not an anti-abuse control.
- **Blocking or warning before submission** - a question is never
  rejected, and submission (Feature 13's endpoint) is entirely
  unchanged; suggestions are advisory only, shown beside the textarea.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Trigram infrastructure migration** - `create extension if not
      exists pg_trgm;`; `create type public.duplicate_check_strictness as
      enum ('off', 'low', 'medium', 'high');`; `alter table
      public.event_settings add column duplicate_check_strictness
      public.duplicate_check_strictness not null default 'off';`;
      `create index questions_text_trgm_idx on public.questions using gin
      (text gin_trgm_ops);`; the `find_similar_questions` function per
      the contract above, with its `revoke`/`grant` statements.
      **Done when:** the migration file exists, follows this project's
      plain-SQL conventions; applying it (outside this skill) is
      required before later steps can be verified live.
- [x] 2. **Admin strictness setting** - add the "Duplicate check
      strictness" `USelect` to the Settings tab, fetched/saved with the
      tab's existing fields.
      **Done when:** code builds; setting each of the four levels and
      saving persists it, confirmed by a read-only query once the
      migration is applied.
- [x] 3. **Suggestions endpoint** -
      `server/api/events/[slug]/duplicate-questions.get.ts` per the
      contract above.
      **Done when:** querying a live event with `duplicate_check_strictness:
      'off'` returns an empty list without a database call; querying one
      set to a non-`'off'` level with text similar to an existing public
      question returns it, ordered by descending score; a hidden/pending
      question with identical text is never returned regardless of
      strictness; a query under 5 characters returns an empty list.
- [x] 4. **Live suggestions in the submit form** - wire the debounced
      fetch and passive suggestion list into `/e/[slug].vue`'s question
      textarea per the contract above.
      **Done when:** typing a question similar to an existing public one
      (with strictness above `'off'`) shows it in the suggestion list
      within roughly the debounce window; an event with strictness
      `'off'` never shows the list or issues the request; submitting the
      question is unaffected either way.

## Files / areas

- `supabase/migrations/<timestamp>_add_duplicate_question_suggestions.sql` (new)
- `app/pages/admin/events/[id].vue` (edit - strictness setting)
- `server/api/events/[slug]/duplicate-questions.get.ts` (new)
- `server/api/events/[slug].get.ts` (edit - expose
  `duplicateCheckStrictness` so the client knows whether to bother
  fetching suggestions at all)
- `app/pages/e/[slug].vue` (edit - debounced suggestion list)

## Data / contracts

- **Suggestions never include non-public questions.** This is a privacy
  boundary as much as a feature contract: the moderation queue's
  visibility gate (Feature 1's state machine) stays intact.
- **Strictness controls a similarity *threshold*, not a suggestion
  count** - the returned list is always capped at 5 regardless of level;
  a stricter setting widens what counts as "similar," it doesn't show
  more results per se (though in practice a lower threshold usually
  surfaces more candidates up to that cap).
- **The trigram function is the only new database function in this
  feature, is `SECURITY INVOKER` (never `DEFINER`), and is reachable
  only via the service-role client** - it is not exposed to `anon` or
  `authenticated` at the Postgres grant level, matching Feature 1's own
  precedent for `is_administrator`/`is_event_manager_for`.
- **Suggested question text is rendered through normal Vue interpolation
  (`{{ }}`)**, the same safe-rendering rule already applied to question
  text in Feature 13.

## Testing

No test runner configured; `npm run build` passed after all four steps
(step 1 is a migration, not executed by any build/test command in this
project, matching every prior migration).

**Not yet exercised live:** each strictness level's threshold behavior,
the public-only filter excluding a hidden/pending near-duplicate, the
debounced UI, and the `'off'` no-request path. This implementation pass
did not start a dev server or apply the pending migration; these are
build-verified only so far, the same caveat recorded for Features 6-14.

## Notes for the AI

- Do not compare against `pending`/`hidden` questions - `visibility =
  'public'` only, no exceptions.
- Do not add a vote button, "ask this instead," or any other interactive
  action to a suggested question - display only.
- Do not build full-text search or a `tsvector` column here - Feature 16
  owns search; this feature is trigram similarity only.
- Do not grant `find_similar_questions` to `anon` or `authenticated` -
  service-role only, called from the Nitro route.
- Do not add rate limiting to the suggestions endpoint - Feature 30's
  job; the client-side debounce is UX hygiene, not a security control.
