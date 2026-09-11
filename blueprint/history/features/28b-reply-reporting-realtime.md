# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 28b: Reply reporting & realtime

**Branch:** `feature/reply-reporting-realtime`
**Status:** verified

## Goal

Extend the two mechanisms Feature 28a's replies fell outside of when
they shipped: Feature 24's report button (replies had no `event_id` to
scope by, and didn't exist as visible content yet) and Feature 25's
Realtime sync (same reason). Closes out build-plan item 28 entirely.

**One opportunistic, disclosed cleanup, not asked for but directly
enabled by this feature's own migration:** Feature 28a's
`moderation/replies/action.post.ts` had to scope a reply to its event
through a PostgREST embedded-resource join
(`questions!inner(event_id)` + `.eq('questions.event_id', ...)`)
because `replies` had no `event_id` of its own - flagged in that
feature's review packet as the one query worth extra attention. Once
this feature adds `replies.event_id` (needed anyway, for the same
per-event Realtime filtering reason `votes.event_id` was added in
Feature 25), that endpoint can scope with a plain `.eq('event_id',
...)` instead. Fixing it here removes the flagged risk with the exact
column this feature was already adding - leaving the join in place once
a simpler, safer option exists would be the oversight, not fixing it.

## In scope

- **New migration**, mirroring Feature 25's `votes.event_id` pattern
  exactly:
  - **`replies.event_id`** (new column, `uuid not null references
    events(id) on delete cascade`, backfilled from
    `questions.event_id` via `question_id`, indexed) - required because
    Realtime's `filter` option only supports a plain `column=eq.value`
    match, and `replies` has no `event_id` today.
  - **`replies_realtime_select`** RLS policy, `for select to anon,
    authenticated`, scoped to `visibility = 'public' and deleted_at is
    null` **and** the parent question also currently public and
    non-deleted (an `exists` subquery against `questions`) - mirroring
    `votes_realtime_select`'s same defense-in-depth reasoning: a reply
    under a question that's no longer public shouldn't be realtime-
    visible even if the reply row itself is still marked public.
  - **Column grants restricted to `(id, event_id, question_id)`** via
    `revoke` + `grant select (...)`, matching `votes`'s exact shape -
    never `attendee_id` or `text`. The realtime payload is a refetch
    signal only, same as Features 25/27 already established.
  - **`alter publication supabase_realtime add table public.replies;`**
- **`server/api/events/[slug]/moderation/replies/action.post.ts`
  (edit)** - the disclosed cleanup above: replaces the
  `questions!inner(event_id)` join-filter with a plain `.eq('event_id',
  session.eventId)` now that the column exists directly on `replies`.
  No behavior change, same tenant-scoping guarantee, simpler and safer
  query.
- **`server/api/replies/report.post.ts` (new)**, mirroring
  `server/api/questions/report.post.ts` exactly. Body `{ eventId,
  token, replyId }`. Resolves the live event, the attendee by
  `(event_id, token)`, and the target reply scoped by `(id, event_id)`
  **directly** (using the new column, not a join) and `visibility =
  'public'`, not soft-deleted. Inserts `{ reply_id: replyId,
  attendee_id }` into `content_reports` (the existing
  `num_nonnulls(question_id, reply_id) = 1` check constraint is
  satisfied since `question_id` is omitted); a `23505` duplicate is
  idempotent success, matching every other report/vote endpoint in this
  app.
- **`server/api/events/[slug]/questions.get.ts` (edit).** Each embedded
  reply gains `reported: boolean`, resolved the same way a question's
  `reported` already is - a token-scoped batch lookup against
  `content_reports` for the fetched reply ids, `false` for every reply
  when no token resolves.
- **`server/api/events/[slug]/moderation/questions.get.ts` (edit).**
  Each embedded reply gains `reportCount: number`, using the exact same
  PostgREST embedded-count technique already used for questions
  (`content_reports(count)` added to the `replies` select).
- **`app/pages/e/[slug].vue` (edit).** A "Report"/"Reported" button
  next to each reply, visible under the same `joined` condition the
  question-level Report button already uses; posts to
  `/api/replies/report` and flips that one reply's `reported` to `true`
  on success, mirroring `reportQuestion()`'s exact structure.
- **`app/pages/m/[slug].vue` (edit).** Each reply's line now also shows
  "`N` reports" whenever its `reportCount > 0`, matching the question-
  level convention exactly (nothing shown at `0`).
- **`app/pages/e/[slug].vue` (edit, same file as above).** The existing
  Realtime channel (already listening to `questions` and `votes`) adds
  a third `postgres_changes` listener for `replies`
  (`event: '*'`, filtered to `event_id=eq.<context.id>`), calling the
  same debounced `scheduleRefresh()` already wired up - no new channel,
  no new reconnect/fallback-poll logic, since it rides the one channel
  Features 25 and 27 already manage.

## Out of scope

- **Any moderator-side realtime for replies** - unchanged from Feature
  25's decision; moderators stay on the existing 15-second poll, which
  already includes replies since Feature 28a embedded them in the
  moderation queue response. Nothing new is needed there.
- **Reporting a reply from "My Questions" or any other new surface** -
  the public feed's reply thread is the only place a Report button is
  added, matching where question reporting lives.
- **A reason field, dismiss action, or anything else Feature 24 already
  declined for question reports** - replies get exactly the same
  minimal mechanism, no more.
- **Re-litigating Feature 25's moderator-Realtime decision** - not
  reopened; this feature only extends the existing attendee-side
  channel to a third table.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Migration: `replies.event_id` + Realtime RLS/publication**
      per the contract above.
      **Done when:** the migration file exists, matching this
      project's plain-SQL conventions and Feature 25's exact pattern
      for `votes`; applying it (outside this skill) is required before
      later steps can be verified live.
- [x] 2. **Simplify the reply action endpoint's event scoping** -
      `server/api/events/[slug]/moderation/replies/action.post.ts` per
      the contract above.
      **Done when:** code builds; the endpoint's behavior is
      unchanged (confirmed by re-reading its four action cases against
      Feature 28a's original `Done when`), now using `replies.event_id`
      directly instead of the embedded join.
- [x] 3. **Reply report endpoint** - `server/api/replies/report.post.ts`
      per the contract above.
      **Done when:** reporting a live event's public reply creates one
      `content_reports` row with `reply_id` set, confirmed by a
      read-only query; reporting the same reply again with the same
      token succeeds without a second row; reporting a non-public,
      unknown, or different-event reply returns "Question not found."
      - matching the question-report endpoint's reused not-found
      wording for the equivalent case; reporting without having joined
      returns the join-required message.
- [x] 4. **Public feed exposes `reported` per reply** -
      `server/api/events/[slug]/questions.get.ts` per the contract
      above.
      **Done when:** a reply the calling token has reported returns
      `reported: true`; every other reply returns `false`; omitting
      the token returns `false` for all replies.
- [x] 5. **Moderation queue exposes `reportCount` per reply** -
      `server/api/events/[slug]/moderation/questions.get.ts` per the
      contract above.
      **Done when:** a reply with reports returns the correct count via
      the `content_reports(count)` embed; a reply with none returns
      `0`.
- [x] 6. **Report button per reply on the public feed** -
      `app/pages/e/[slug].vue` per the contract above.
      **Done when:** the button is hidden before joining, shows
      "Report" after joining on an unreported reply, and switches to a
      disabled "Reported" state immediately after a successful report
      or on reload for a reply already reported by this device.
- [x] 7. **Moderator queue shows the reply report count** -
      `app/pages/m/[slug].vue` per the contract above.
      **Done when:** a reported reply's line shows "`N` reports"; an
      unreported reply's line shows nothing extra.
- [x] 8. **Attendee realtime covers replies** - `app/pages/e/[slug].vue`
      per the contract above.
      **Done when:** code builds; the existing channel's `.on(...)`
      chain includes a `replies` listener filtered to this event,
      calling the same `scheduleRefresh()` the `questions`/`votes`
      listeners already use.

## Files / areas

- `supabase/migrations/<timestamp>_add_reply_realtime_access.sql` (new)
- `server/api/events/[slug]/moderation/replies/action.post.ts` (edit)
- `server/api/replies/report.post.ts` (new)
- `server/api/events/[slug]/questions.get.ts` (edit)
- `server/api/events/[slug]/moderation/questions.get.ts` (edit)
- `app/pages/e/[slug].vue` (edit)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **`replies.event_id` mirrors `votes.event_id` exactly** - same
  reasoning (Realtime filter scoping), same shape (backfilled,
  not-null, indexed).
- **A reply report is add-only and idempotent**, identical in shape to
  a question report and a vote: a duplicate insert is caught by the
  existing unique index and treated as success, never surfaced as an
  error.
- **A reply's realtime visibility depends on both its own and its
  parent question's current public state** - the RLS policy checks
  both, so a reply under a question that's since been hidden or
  rejected stops producing realtime events even if the reply row
  itself is still `visibility: 'public'`.
- **The realtime payload for replies carries the same minimal columns
  as votes** (`id, event_id, question_id`) - never `attendee_id` or
  `text`; the client only ever uses the event as a refetch trigger.
- **This feature closes build-plan item 28.** Once complete, both 28a
  and 28b are checked, and the parent "28. Replies/comments" line
  becomes fully done.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue/server-route changes (steps 2-8). The migration
(step 1) is not executed by any build or test command, matching every
prior migration-carrying feature.

**Not yet exercised live:** the full extended flow end to end (reporting
a reply and its idempotent repeat, the report count appearing in the
moderator queue, and a genuine cross-tab realtime update triggered by a
new reply). This implementation pass did not start a dev server; these
are build-verified only (`npm run build` passed after all eight steps).

## Notes for the AI

- Do not add any moderator-side realtime for replies - the existing
  poll already covers them.
- Do not add a reason field or dismiss action for reply reports -
  matches Feature 24's minimal mechanism exactly.
- Do not open a second Realtime channel on the attendee page - extend
  the existing one from Features 25/27.
- Do not grant more columns than `replies(id, event_id, question_id)`
  to `anon`/`authenticated`.
- Do not skip simplifying `moderation/replies/action.post.ts`'s event
  scoping now that `replies.event_id` exists - this was the specific
  risk flagged in Feature 28a's review packet.
