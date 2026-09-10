# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 25: Realtime sync

**Branch:** `feature/realtime-sync`
**Status:** verified

## Goal

Make the attendee public feed update itself the moment a question or vote
changes, using real Supabase Realtime - the first feature to add actual
RLS-based read access for `anon`, exactly as Feature 1's own schema
comment names this feature for. Moderators keep getting live-ish updates
through the polling mechanism Feature 23 already built, now broadened
to cover the whole queue (including topics), per the resolved
architecture decision below.

**Scope note (resolved before writing this spec, one point asked to the
user, two disclosed):**

1. **Moderator delivery mechanism - asked, and resolved.** Moderators
   authenticate with a custom password/session scheme (Feature 19), not
   Supabase Auth, so at the database role level a moderator's connection
   is indistinguishable from an anonymous attendee's - both are `anon`.
   Standard Supabase Realtime (`postgres_changes`) is gated by RLS on
   that same role, so any RLS policy broad enough to give moderators
   live visibility into pending/hidden/rejected questions would give
   every attendee that same visibility too - a real content leak. Per
   the user's explicit choice, this feature does **not** build a
   separate authorized Realtime channel for moderators (Realtime
   Broadcast + Authorization, new infrastructure this project hasn't
   used). Moderators keep the existing 15-second poll, broadened to also
   refresh topics.
2. **"Admin views" - disclosed, not asked.** No admin page currently
   displays any live-changing Q&A data at all (the admin pages built so
   far are event configuration only); the "Live admin dashboard" that
   will need this is Feature 31, not yet built. There is nothing on the
   admin surface for this feature to wire up.
3. **"Replies" - disclosed, not asked.** The `replies` table (Feature 1)
   has no producing feature yet (Feature 28); nothing anywhere reads or
   writes a reply. There is nothing to sync.

This feature's real, buildable scope is: the attendee public feed gets
genuine Realtime; the moderator queue's existing poll gets broadened to
also cover topics.

## In scope

- **New migration.** Two things, both prerequisites for the rest of this
  feature:
  - **`votes.event_id`** (new column, `uuid not null references
    events(id) on delete cascade`, backfilled from
    `questions.event_id` via the existing `question_id` link, indexed).
    Realtime's `filter` option only supports a plain
    `column=eq.value` match, and `votes` has no `event_id` today -
    without this column, a vote-change subscription could not be scoped
    to one event at all, directly contradicting this build-plan item's
    own "each subscribed only to what it needs" requirement.
  - **RLS policies enabling Realtime, narrowly.** `questions_realtime_select`
    and `votes_realtime_select`, both `for select to anon, authenticated`,
    scoped to `visibility = 'public' and deleted_at is null` (votes via
    an `exists` check against its question). **Column grants are then
    narrowed with an explicit `revoke` + `grant select (...)`** so the
    only columns ever visible to these roles are `questions(id,
    event_id)` and `votes(id, event_id, question_id)` - `attendee_id`,
    `text`, `anonymous`, and `approval_status` are never granted. A
    subscribed client only ever learns "something changed for this
    event," never any content; it must still call the existing, fully
    redacted `GET /api/events/[slug]/questions` to render anything.
    **Both tables are added to the `supabase_realtime` publication**
    (`alter publication supabase_realtime add table ...`), the
    Supabase-specific step that actually turns changes into delivered
    events - easy to omit and silently get nothing.
  - This is the first time this project adds real RLS read policies to
    `questions`/`votes`. Feature 1's schema comment named Features
    12/19/25 as the ones that would "define the real token/session-based
    access rules" for these tables - in practice, 12 and 19 both chose
    service-role server routes instead, which remain every normal read
    and write path in this app unchanged. This feature's policies exist
    solely to make Realtime subscriptions possible, not as a general
    anon read API.
- **`server/api/votes.post.ts` (edit).** Sets `event_id: eventId` on the
  `votes` insert (the value is already in scope as the endpoint's
  validated `eventId`).
- **`app/pages/e/[slug].vue` (edit).** On mount (client-only, matching
  this page's existing SSR-hydration discipline), opens one Supabase
  Realtime channel via the existing `useSupabase()` composable
  (already used elsewhere for the anon-key client), subscribing to
  `postgres_changes` on `questions` (`event: '*'`, since both new
  questions and visibility/text changes matter) and `votes`
  (`event: 'INSERT'`, since votes are add-only), both filtered to
  `event_id=eq.<context.id>`. Any event calls the page's existing
  `refreshQuestions()` (the `refresh()` from its `useFetch`), **debounced
  by 500ms** so a burst of near-simultaneous votes triggers one refetch,
  not several. The channel is removed on unmount.
- **`app/pages/m/[slug].vue` (edit).** The existing 15-second poll
  (Feature 23's `pollForNewArrivals`) now also calls `loadTopics()`
  alongside `loadQueue()` each tick, so the topics panel (current topic,
  additions, renames, reorders, deletions - anything another moderator
  changed) stays reasonably fresh without a manual reload, matching the
  chosen polling-based delivery mechanism. The interval stays at 15
  seconds - unchanged, since nothing asked for a faster cadence, only a
  broader one.

## Out of scope

- **A moderator-authorized Realtime channel** - explicitly declined by
  the user; moderators stay on polling.
- **Any admin-facing realtime** - no admin view exists yet that shows
  live Q&A data; Feature 31 ("Live admin dashboard") is where that would
  first apply.
- **Reply realtime** - `replies` has no producing feature yet (Feature
  28).
- **Realtime for `submissions_open`/`voting_open`** - not named in the
  build-plan line for this feature; an attendee would need to reload to
  see either flag change. A future feature can add this if wanted.
- **Presence-based active counts** - Feature 26's job.
- **Reconnect/polling-fallback behavior for a dropped Realtime
  connection** - Feature 27's job; this feature opens one channel and
  does not attempt to detect or recover from a disconnect.
- **Realtime for `content_reports`** - reports are moderator-only data
  (Feature 24) and moderators are on polling in this feature, not
  Realtime; there is no consumer for report realtime here.
- **Any change to the redaction logic itself** - the Realtime payload
  never carries redactable content; existing anonymity, vote-count-hiding,
  and attendee-type-visibility logic in the REST endpoints is untouched.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Migration: `votes.event_id` + Realtime RLS/publication** per
      the contract above.
      **Done when:** the migration file exists, matching this project's
      plain-SQL conventions; applying it (outside this skill) is
      required before later steps can be verified live.
- [x] 2. **`votes.post.ts` sets `event_id`** per the contract above.
      **Done when:** code builds; a new vote's row includes the correct
      `event_id`, confirmed by a read-only query once the migration is
      applied.
- [x] 3. **Attendee Realtime subscription** - `app/pages/e/[slug].vue`
      per the contract above.
      **Done when:** code builds; opening the page subscribes once per
      mount and unsubscribes on navigation away, confirmed by code
      review of the mount/unmount pair (live cross-tab verification
      requires the migration applied and a running dev server, recorded
      as not yet exercised below).
- [x] 4. **Moderator poll broadened to topics** -
      `app/pages/m/[slug].vue` per the contract above.
      **Done when:** code builds; the same 15-second timer now calls
      both `loadQueue()` and `loadTopics()` each tick.

## Files / areas

- `supabase/migrations/<timestamp>_add_realtime_access.sql` (new)
- `server/api/votes.post.ts` (edit)
- `app/pages/e/[slug].vue` (edit)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **The Realtime payload is a signal, never a data source.** No code in
  this feature reads a field out of a `postgres_changes` payload; every
  handler's only action is triggering an existing, fully redacted
  refetch. This sidesteps needing to reconcile Realtime's raw-row
  delivery with this project's server-side anonymity/redaction logic
  entirely.
- **Column grants are the actual privacy boundary, not just RLS rows.**
  A public, non-deleted question or its votes are still only ever
  visible to `anon`/`authenticated` as `(id, event_id[, question_id])` -
  never `attendee_id`, `text`, `anonymous`, or `approval_status`, even
  though the row itself passes the RLS check.
- **These are the first RLS policies ever added to `questions`/`votes`,
  and they are strictly narrower than "12/19/25 define real access
  rules" originally anticipated** - Features 12 and 19 already settled
  on service-role routes for every normal read/write; this feature does
  not revisit that, it only adds the minimum RLS needed for Realtime
  itself to function.
- **`votes.event_id` is set once, at insert, from the same validated
  `eventId` the endpoint already trusts** - never a second lookup, never
  client-supplied independently of the question it's attached to.
- **The moderator poll's scope is broadened, not its cadence** - still
  15 seconds, unchanged from Feature 23.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue/server-route changes (steps 2-4). The migration (step
1) is not executed by any build or test command in this project, and -
unlike every prior migration-only feature - this one also requires a
Supabase Dashboard step beyond running the SQL: confirming the project's
Realtime settings actually allow the `questions` and `votes` tables
(the `alter publication` statement handles this from the SQL side, but
it's worth a dashboard glance given this is the first table this project
has added to Realtime).

**Not yet exercised live:** the full realtime flow end to end (a second
browser tab seeing a new question or vote appear without reloading, the
debounce actually coalescing a vote burst, and the moderator queue's
topics panel refreshing via the broadened poll). This implementation
pass did not start a dev server; these are build-verified only (`npm
run build` passed after all four steps).

## Notes for the AI

- Do not build a moderator-facing Realtime channel - the user explicitly
  chose polling for moderators in this feature.
- Do not add realtime for `submissions_open`/`voting_open`, replies, or
  any admin surface - none are in scope, for the reasons in the scope
  note.
- Do not let the Realtime subscription code read or render any field
  from a `postgres_changes` payload - always treat it as a refetch
  trigger only.
- Do not grant more columns than `questions(id, event_id)` and
  `votes(id, event_id, question_id)` to `anon`/`authenticated` - never
  `attendee_id`, `text`, `anonymous`, or `approval_status`.
- Do not forget the `alter publication supabase_realtime add table ...`
  statements - RLS and grants alone do not make Realtime deliver events.
- Do not speed up the moderator poll's interval - only broaden what it
  refreshes.
