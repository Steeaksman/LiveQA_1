# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 24: Attendee content reporting

**Branch:** `feature/attendee-content-reporting`
**Status:** verified

## Goal

Let an attendee flag a public question as a problem with one click, once
per question, and let moderators see how many reports each question has
so they can prioritize triage - reusing the existing add-only, idempotent
pattern this project already established for voting.

**Scope note (resolved before writing this spec, not asked to the
user):** the schema's `content_reports` table (Feature 1) already
supports reporting either a question *or* a reply
(`num_nonnulls(question_id, reply_id) = 1`), but the `replies` table
(also Feature 1) has no rows and no producing feature yet - Feature 28
("Replies/comments") hasn't shipped. Nothing can be reported as a reply
today because no reply exists to report. This feature builds question
reporting only; `reply_id` stays unused until Feature 28 exists, at
which point extending this same mechanism to replies is that feature's
call, not a gap in this one.

## In scope

- **`server/api/questions/report.post.ts` (new)**, mirroring
  `votes.post.ts`'s structure exactly. Body `{ eventId, token,
  questionId }`. Resolves the event (`status = 'live'`, else the
  generic "Event not found."), resolves the attendee by `(event_id,
  token)` (else "Please join the event before reporting a question."),
  and confirms the question exists, belongs to this event, is
  `visibility = 'public'`, and not soft-deleted (else "Question not
  found.") - the same restriction `votes.post.ts` already applies, since
  the only place a Report button appears is the public feed. Inserts
  `{ question_id, attendee_id }` into `content_reports`; a `23505`
  unique-violation (this attendee already reported this question) is
  treated as idempotent success, never an error - the exact pattern
  `votes.post.ts` already established for a duplicate vote. Returns
  `{ reported: true }` on success either way.
- **`server/api/events/[slug]/questions.get.ts` (edit).** Adds
  `reported: boolean` per question, resolved the same way `hasVoted`
  already is: when a `token` is supplied and resolves to a real
  attendee, a second batch query against `content_reports` (scoped to
  that attendee and the fetched question ids) builds the set of
  already-reported question ids; without a token (or an unresolved
  one), every question reports `reported: false`, matching `hasVoted`'s
  existing fallback.
- **`app/pages/e/[slug].vue` (edit).** A "Report" button on each public
  feed question, shown only once the device has joined (mirroring the
  vote button's existing visibility rule). Clicking it posts to
  `/api/questions/report` with the device's token and that question's
  id; on success (or if it was already reported), the button becomes a
  disabled "Reported" state - no confirmation dialog, no reason prompt,
  a single click, matching the build-plan's own one-line description
  with nothing about categorizing or explaining a report.
- **`server/api/events/[slug]/moderation/questions.get.ts` (edit).**
  Adds `reportCount: number` to each question, via the exact same
  PostgREST embedded-count technique this file already uses for
  `voteCount` (`content_reports(count)` alongside the existing
  `votes(count)` in the same `questions` select) - no separate query
  needed.
- **`app/pages/m/[slug].vue` (edit).** Each question card's state line
  now also shows "`N` reports" whenever `reportCount > 0` (nothing shown
  at `0`, avoiding clutter on the common case) - purely informational,
  giving moderators a triage signal. Reports are resolved using this
  project's *existing* moderation actions (reject, hide, archive); no
  new "dismiss report" or "resolve report" action is added.

## Out of scope

- **Reporting a reply** - see the resolved scope note above; there is
  nothing to report until Feature 28 exists.
- **A reason field, category picker, or any explanation attached to a
  report.** The `content_reports.reason` column exists in the schema
  but nothing in the build-plan line asks for collecting one; this
  feature leaves it unused (always `null`) rather than inventing a
  reason-taxonomy or free-text-note requirement.
- **A "dismiss," "resolve," or "clear" action on reports** - not asked
  for; a moderator acts on a flagged question using the moderation
  actions Features 20/21 already built. The report count itself is
  never cleared or reset by any action in this feature.
- **Un-reporting, or reporting the same question with an updated
  reason** - matches the add-only, idempotent precedent votes already
  established; a second report attempt changes nothing.
- **Reporting from "My Questions"** - that view is about an attendee's
  own submissions; reporting your own question has no sensible use
  case, and the Report button is scoped to the public feed only.
- **Rate limiting or abuse protection on the report endpoint** - Feature
  30's job, the same carve-out already established for every other
  attendee-facing mutation in this app.
- **Any admin-facing report list, export, or dashboard** - the
  overview's "reports (CSV/HTML/PDF)" line under Admin oversight (a
  later, different section) refers to event data exports, not this
  content-moderation table; this feature does not touch anything under
  `/admin/*`.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Report endpoint** - `server/api/questions/report.post.ts`
      per the contract above.
      **Done when:** reporting a live event's public question creates
      one `content_reports` row, confirmed by a read-only query;
      reporting the same question again with the same token succeeds
      without creating a second row; reporting a non-public, unknown, or
      soft-deleted question returns "Question not found."; reporting
      without having joined returns the join-required message.
- [x] 2. **Public feed exposes `reported`** -
      `server/api/events/[slug]/questions.get.ts` per the contract
      above.
      **Done when:** a question the calling token has reported returns
      `reported: true`; every other question returns `false`; omitting
      the token returns `false` for all questions, matching today's
      `hasVoted` fallback exactly.
- [x] 3. **Report button on the public feed** - `app/pages/e/[slug].vue`
      per the contract above.
      **Done when:** the button is hidden before joining, shows
      "Report" after joining on an unreported question, and switches to
      a disabled "Reported" state immediately after a successful report
      or on reload for a question already reported by this device.
- [x] 4. **Moderation queue exposes `reportCount`** -
      `server/api/events/[slug]/moderation/questions.get.ts` per the
      contract above.
      **Done when:** a question with reports returns the correct count
      via the `content_reports(count)` embed; a question with none
      returns `0`.
- [x] 5. **Moderator queue shows the report count** -
      `app/pages/m/[slug].vue` per the contract above.
      **Done when:** a reported question's card shows "`N` reports";
      an unreported question's card shows nothing extra.

## Files / areas

- `server/api/questions/report.post.ts` (new)
- `server/api/events/[slug]/questions.get.ts` (edit)
- `app/pages/e/[slug].vue` (edit)
- `server/api/events/[slug]/moderation/questions.get.ts` (edit)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **No new migration.** `content_reports`, its exactly-one-target check
  constraint, and its two per-target unique indexes have existed since
  Feature 1; this feature is their first consumer.
- **Reporting is add-only and idempotent**, identical in shape to
  voting: a duplicate insert is caught by the unique index and treated
  as success, never surfaced as an error to the attendee.
- **A report can only target a currently public question** - the same
  restriction `votes.post.ts` already applies to its target, checked
  fresh on every call, never trusted from the client.
- **The report count is a raw aggregate, with no attendee-identifying
  information ever returned to the moderator queue** - only a number,
  matching this project's general redaction discipline even though
  reports are moderator-only data (there is simply no product need to
  expose which attendee filed which report here).
- **`content_reports.reason` is written as `null` by this feature** -
  the column exists for potential future use, but nothing here ever
  populates it.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue/server-route changes (all five steps - no migration
is needed).

**Not yet exercised live:** the full report flow end to end (reporting
as a joined attendee, the idempotent repeat-report, the button's
reported-state persistence across a reload, and the moderator queue's
report count appearing and matching reality). This implementation pass
did not start a dev server; these are build-verified only (`npm run
build` passed after all five steps).

## Notes for the AI

- Do not build reply reporting - `replies` has no producing feature yet.
- Do not add a reason field, category picker, or any report-note
  collection - `reason` stays unused.
- Do not add a dismiss/resolve/clear action for reports - moderators use
  the existing reject/hide/archive actions.
- Do not let the report endpoint succeed against a non-public question -
  match `votes.post.ts`'s existing visibility check exactly.
- Do not surface a duplicate-report attempt as an error - treat the
  `23505` unique violation as success, matching `votes.post.ts`.
- Do not add self-report prevention - `votes.post.ts` has no equivalent
  self-vote prevention, and this feature does not invent a new
  restriction its sibling endpoint doesn't already have.
