## Feature 30b: Blocked-term filtering

**Branch:** `feature/blocked-term-filtering`
**Status:** verified

## Goal

Let an Administrator maintain one global blocked-term list and have every
question and reply submission, across every event, rejected if its text
contains one of those terms - the second half of Feature 30's split,
completing the abuse-protection bundle 30a already started.

**Resolved before writing this spec (split already approved separately;
each point below is inferred from repository evidence, not invented from
nothing):**

1. **This is Administrator-only and global, never per-event or
   Event-Manager-accessible.** `project-plan.md`'s own role table lists
   "blocked-term config" under the Administrator's system-wide scope, not
   the Event Manager row - the same global, no-Event-Manager-permission
   shape `event_templates` already uses (its own migration comment says
   so explicitly: "administrator-only; no Event Manager template
   permission is described yet").
2. **No new server route is needed for the admin CRUD.** Every existing
   Administrator-only global table in this project (`event_templates`,
   `profiles`, `event_manager_assignments`) is managed via direct client
   Supabase calls gated by RLS's `is_administrator(auth.uid())` - only
   Event Manager *creation* uses a server route, because creating a
   Supabase Auth user needs the admin auth API, not because the table
   write itself needs one. Adding, listing, and soft-deleting a plain
   text term needs nothing beyond RLS.
3. **Matching is case-insensitive substring containment, checked in the
   application, not in SQL.** This project's only precedent for
   text-matching against user content is Feature 16's `ilike` search
   (case-insensitive by nature); there is no full-text-search
   infrastructure here to build a fancier match against, and a
   moderation blocklist is realistically small (tens to low hundreds of
   entries) - fetching the active list once per submission and checking
   it in JS is the simplest correct option.
4. **The rejection message never names the matched term.** Revealing
   which specific word tripped the filter would let an attendee
   trial-and-error their way to reconstructing the blocklist; every
   other generic-error convention in this project (the anti-enumeration
   "Question not found." pattern) already prefers not leaking the exact
   reason over precision.
5. **Moderator-authored replies are not filtered.** Feature 28a already
   established moderators as a trusted actor whose replies skip
   moderation entirely (auto-approved, no approval_status check); nothing
   in this build-plan line singles out moderator content, so the filter
   only applies where an attendee's own text reaches the system -
   `questions.post.ts` and the attendee-facing `replies.post.ts`, not
   `moderation/replies.post.ts`.

## In scope

- **New migration:** `public.blocked_terms` table -
  `id uuid primary key default gen_random_uuid(), term text not null,
  created_by uuid not null references public.profiles (id), created_at
  timestamptz not null default now(), updated_at timestamptz not null
  default now(), deleted_at timestamptz` (the exact `event_templates`
  shape, minus its `config jsonb`), a `set_updated_at` trigger matching
  every other table, and a partial unique index on `lower(term) where
  deleted_at is null` (same "unique while active" shape as
  `attendees_token_key`). RLS: enabled, with `blocked_terms_select`,
  `blocked_terms_insert`, and `blocked_terms_update` policies - each
  gated purely by `public.is_administrator(auth.uid())`, mirroring
  `event_templates`'s three policies exactly. No delete policy - removal
  is a soft delete via the update policy, consistent with this project's
  delete-everywhere convention.
- **`server/utils/check-blocked-terms.ts` (new).** One export:
  `containsBlockedTerm(text: string): Promise<boolean>` - fetches every
  non-deleted `blocked_terms.term` via the service-role client, then
  returns true if any term appears (case-insensitively) anywhere in
  `text`.
- **`server/api/questions.post.ts` (edit).** After the existing
  text-length check, call `containsBlockedTerm(text)`; on `true`,
  respond 400 with `"Your question could not be submitted. Please
  rephrase and try again."` and insert nothing.
- **`server/api/replies.post.ts` (edit).** Same addition, same message
  shape: `"Your reply could not be submitted. Please rephrase and try
  again."`
- **`app/pages/admin/blocked-terms.vue` (new).** Mirrors
  `event-managers.vue`'s exact shape for an Administrator-only global
  list page: `definePageMeta({ middleware: ['admin',
  'administrator-only'] })`; on mount, direct client
  `supabase.from('blocked_terms').select(...).is('deleted_at',
  null).order('term')`; an input plus "Add" button that validates
  non-empty trimmed text client-side, then `supabase.from('blocked_terms')
  .insert({ term, created_by: <current user id> })`, showing the unique-
  constraint violation as "That term is already blocked." and any other
  error generically; a "Remove" button per row that sets `deleted_at`
  via update, mirroring `toggleRevoked`'s exact pattern.
- **`app/pages/admin/index.vue` (edit).** One new
  `<NuxtLink to="/admin/blocked-terms">Blocked Terms</NuxtLink>` inside
  the existing `profile?.role === 'administrator'` block, alongside
  Event Managers and Templates.

## Out of scope

- **Filtering moderator-authored replies, question edits (Feature 17's
  attendee edit), or any other write path** - per the resolved note
  above, only the two attendee-facing submission routes are named by
  this build-plan line.
- **Per-event overrides, exemptions, or an Event-Manager-visible
  version of this list** - global and Administrator-only per the
  resolved note above; no event-scoped variant exists or is implied.
- **Regex, wildcard, or word-boundary matching** - plain case-insensitive
  substring containment only, per the resolved note above; a term like
  "spam" also matches inside "spammer," which is the simplest, most
  defensible behavior for a moderation blocklist and not something this
  feature attempts to refine further.
- **Editing an existing term's text** - add and remove (soft-delete)
  only, matching this page's minimal CRUD surface; correcting a typo is
  remove-then-re-add.
- **Bulk import/export of the term list** - one input, one term at a
  time, matching every other simple admin list in this project.
- **Any change to the 30a rate-limit/ban counters** - a blocked
  submission is never inserted, so it already cannot contribute to those
  counts; no coordination code is needed between the two sub-features.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Migration: blocked_terms table & RLS** per the contract above.
      **Done when:** the migration file exists, matching `event_templates`'s
      exact table-plus-RLS shape; applying it (outside this skill) is
      required before later steps can be verified live.
- [x] 2. **Blocked-term check helper** -
      `server/utils/check-blocked-terms.ts` per the contract above.
      **Done when:** code builds; an empty or all-deleted term list
      returns `false` for any text (confirmed by code review, since
      exercising real data requires a live database outside this skill).
- [x] 3. **Wire into question and reply submission** -
      `questions.post.ts` and `replies.post.ts` per the contract above.
      **Done when:** code builds; both routes call the helper after the
      text-length check and before insert, returning 400 with the
      content-type-specific message on a match and inserting nothing.
- [x] 4. **Admin blocked-terms page & nav link** -
      `app/pages/admin/blocked-terms.vue` (new) and the `admin/index.vue`
      link, per the contract above.
      **Done when:** code builds; the page lists active terms, adding a
      term persists it and clears the input, a duplicate term shows the
      specific "already blocked" message, and removing a term soft-deletes
      it and drops it from the list on refresh (confirmed by a read-only
      query once the migration is applied).

## Files / areas

- `supabase/migrations/20260910110000_add_blocked_terms.sql` (new)
- `server/utils/check-blocked-terms.ts` (new)
- `server/api/questions.post.ts` (edit)
- `server/api/replies.post.ts` (edit)
- `app/pages/admin/blocked-terms.vue` (new)
- `app/pages/admin/index.vue` (edit)

## Data / contracts

- **`public.blocked_terms`** - `id, term (text, not null), created_by
  (uuid, not null, FK to profiles), created_at, updated_at, deleted_at`.
  Partial unique index on `lower(term) where deleted_at is null`.
- **RLS:** `blocked_terms_select` / `_insert` / `_update`, each gated by
  `public.is_administrator(auth.uid())` alone - no Event Manager or
  attendee/moderator policy exists or is implied; the service role
  (used by `check-blocked-terms.ts`) bypasses RLS as it does everywhere
  else in this project.
- **Match algorithm:** case-insensitive substring containment,
  `text.toLowerCase().includes(term.toLowerCase())` for each active term,
  evaluated in the route handler - not a SQL `ilike`/regex query.
- **Rejection response:** `{ success: false, data: null, error: string }`
  with HTTP 400, matching this project's existing validation-error
  shape exactly (same status class as "too long" and "text required").
- **Uniqueness:** duplicate active terms are rejected at the database
  level (the partial unique index); the admin page surfaces that specific
  Postgres error as "That term is already blocked."

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** a real blocked-term addition
actually rejecting a matching submission, and the admin page's add/remove
flow against a real Supabase project - both require a dev server and the
migration applied, the same caveat recorded for every prior feature that
could not start a server from this skill.

`npm run build` was run after all four steps and passed cleanly (only
pre-existing, unrelated dependency deprecation warnings appeared);
`questions.post.mjs`/`replies.post.mjs` grew and the new
`blocked-terms.vue` route registered in the build output.

## Notes for the AI

- Do not filter moderator-authored replies, question edits, or any route
  besides `questions.post.ts` and the attendee-facing `replies.post.ts` -
  per the resolved note above.
- Do not reveal the matched term in any error message - the rejection
  message is fixed and generic per content type.
- Do not add an Event Manager-facing view or a per-event override of this
  list - it is global and Administrator-only, full stop.
- Do not build a server route for the admin list/add/remove actions -
  reuse direct client Supabase calls gated by the new RLS policies,
  matching `event_templates`'s and `event-managers.vue`'s existing
  precedent exactly.
- Do not implement regex/wildcard matching - plain substring containment
  only, per the resolved note above.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
