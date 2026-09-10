# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 20: Moderator queue & core actions

**Branch:** `feature/moderator-queue-core-actions`
**Status:** verified

## Goal

Turn Feature 19's password-gated `/m/<slug>` placeholder into the real
moderator queue: every non-deleted question in the event, with the
actions a moderator needs to triage them (approve, reject, hide,
publish, mark/unmark answered, archive/unarchive), plus moderator-facing
controls to open/close submissions and voting - all authenticated by the
existing moderator session, never Supabase Auth.

**Scope note (resolved before writing this spec):** the build-plan line
for this feature also lists "change current topic." The schema already
has exactly the column that action would flip
(`topics.is_current`, Feature 1, with a unique-per-event partial index),
but nothing anywhere in this app creates or lists a `topics` row yet -
that groundwork is what Feature 22 ("Current speaker/topic tracking")
describes. Per the user's explicit choice, "change current topic" is
deferred to Feature 22, which will build topic management and the
current-topic concept together. This feature builds the other seven
actions plus the two open/close controls.

## In scope

- **`server/utils/verify-moderator-session.ts` (new shared helper),
  extracted from `moderator-session.get.ts`'s existing inline check.**
  Given `{ slug, token }`: resolves the event by slug (`status = 'live'`
  and `moderator_access_enabled`, both re-checked every call - the same
  never-trust-a-cached-state discipline Feature 19 already established),
  then looks up a non-soft-deleted `moderator_sessions` row for that event
  and token with `revoked_at is null` and `expires_at` in the future.
  Returns `{ ok: true, eventId: string }` or `{ ok: false }` - callers
  decide how to respond (a soft boolean for the existing session-check
  endpoint, a hard `401` for every new mutating endpoint below, since
  none of them are anonymous-public the way `/api/events/[slug]` is).
- **`server/api/events/[slug]/moderator-session.get.ts` (edit)** - now
  calls the shared helper instead of duplicating its logic; behavior is
  unchanged (`{ valid: boolean }`, never an error).
- **`server/api/events/[slug]/moderation/questions.get.ts` (new).**
  Query `{ token }`. `401` "Not authorized." when the session doesn't
  verify. Otherwise returns every non-soft-deleted question for the
  event (**not** filtered to `visibility = 'public'` the way the
  attendee-facing endpoint is - the queue's whole purpose is to see
  pending/hidden/rejected items too), each with: `id`, `text`,
  `createdAt`, `approvalStatus` (`pending|approved|rejected`),
  `visibility` (`hidden|public`), `answered`, `archived`, `voteCount`
  (always the real count - `hide_vote_counts` is an attendee-facing
  setting, not a moderator one), `displayName`, and `attendeeType`.
  **The last two are resolved with the exact same anonymity/type-
  visibility rule Feature 18 built for the public feed** (anonymous
  question → both `null`; non-anonymous → `displayName` always,
  `attendeeType` only when `show_attendee_type` is true) - moderators see
  precisely what the public will see once a question is published, not
  a privileged unmasked view; nothing in this project's plans asks for
  moderators to bypass attendee anonymity, so this feature does not
  invent that capability. Also returns the event's current
  `submissionsOpen`/`votingOpen` (the queue page needs both on load
  alongside the list, avoiding a third fetch). Sorted newest-first,
  matching the attendee feed's default.
- **`server/api/events/[slug]/moderation/questions/action.post.ts`
  (new).** Body `{ token, questionId, action }`, where `action` is one
  of: `approve`, `reject`, `hide`, `publish`, `mark_answered`,
  `unmark_answered`, `archive`, `unarchive`. `401` when the session
  doesn't verify; `404` "Question not found." when `questionId` doesn't
  resolve to a non-soft-deleted question in *this* event (re-checked by
  id **and** `event_id` together - never trusting that a client-supplied
  id belongs to the session's event); `400` "Invalid action." for
  anything else. Per-action effect and legality:
  - `approve` - `approval_status = 'approved'`. Always allowed.
  - `reject` - `approval_status = 'rejected'` **and forces `visibility =
    'hidden'`** - a rejected question must never stay publicly visible,
    even if it was already published before being reconsidered. Always
    allowed.
  - `hide` - `visibility = 'hidden'`. Always allowed (idempotent if
    already hidden).
  - `publish` - `visibility = 'public'`. Requires the question's
    *current* `approval_status` to already be `'approved'`; otherwise
    `400` "Approve the question before publishing it." (matches the
    documented state machine: `approved|rejected → hidden|public`, so
    only approved content can go public).
  - `mark_answered` - `answered = true`. Requires `approval_status =
    'approved'`; otherwise `400` "Approve the question before marking it
    answered." Does **not** require `visibility = 'public'` - the
    documented chain (`hidden|public → answered`) allows a question
    answered live without ever being shown on the public feed.
  - `unmark_answered` - `answered = false`. Always allowed - moderators
    need to correct a misclick during a live event without a database
    console.
  - `archive` - `archived = true`. Always allowed regardless of any
    other field - Feature 21's "Archive All Unanswered" already implies
    archiving does not require `answered = true` first.
  - `unarchive` - `archived = false`. Always allowed.
  On success, returns `{ questionId }` and the row's new
  `approvalStatus`/`visibility`/`answered`/`archived` so the UI can
  update without a full refetch.
- **`server/api/events/[slug]/moderation/event-controls.post.ts`
  (new).** Body `{ token, submissionsOpen?, votingOpen? }` - at least one
  of the two must be a boolean, or `400` "Nothing to update." `401` when
  the session doesn't verify. Updates only the field(s) provided on
  `events`. This is the moderator-facing equivalent of the admin
  Settings tab's existing switches for the same two columns - moderators
  have no Supabase Auth session and cannot use the client-side
  RLS-scoped update the admin page uses, so this is a new service-role
  route.
- **`app/pages/m/[slug].vue` (edit).** Replaces the placeholder text
  after a successful login or valid stored session with the real queue:
  two switches ("Submissions open", "Voting open") wired to
  `event-controls.post.ts`, and a flat, newest-first list of questions,
  each showing its text, `displayName`/`attendeeType` (when present),
  vote count, current state as plain labels (approval status,
  visibility, answered, archived), and only the action buttons that are
  currently legal for that question's state (e.g., "Publish" is hidden,
  not just disabled, when `approvalStatus !== 'approved'`) - the server
  still re-validates every click regardless. Every action button
  refetches the list on completion (no realtime yet - Feature 25's job);
  an inline error message appears next to a question if its action
  fails.

## Out of scope

- **"Change current topic," or anything about topics** - deferred to
  Feature 22 per the resolved scope note above. No topic data is
  fetched, displayed, or written by this feature.
- **Bulk/multi-select actions or "Archive All Unanswered"** - Feature 21
  owns both; every action in this feature targets exactly one question.
- **Editing a question's text as a moderator** - not asked for here;
  Feature 33 ("Question edit history & soft delete") is the named home
  for admin-only wording edits, and Feature 17 already covers the
  attendee's own edit window. This feature's action endpoint never
  touches `text`.
- **Realtime updates, presence, or a live connection indicator** -
  Features 25-27's job; this queue is fetch-and-refetch only.
- **Any moderator-bypasses-anonymity capability** - explicitly not built
  here (see the contract note above); moderators see the same
  `displayName`/`attendeeType` redaction the public feed applies.
- **Moderator logout, session revocation, or "who is currently
  moderating"** - unchanged from Feature 19; still no such action or
  identity anywhere in this app.
- **Notifications (visual or sound) for new/pending questions** -
  Feature 23's job.
- **Content reporting or its review surface** - Feature 24's job.
- **Changing `submissions_open`/`voting_open` gating logic on the
  attendee side** - this feature only adds a second, moderator-facing
  way to flip the same two existing columns the admin Settings tab
  already writes; it does not change how `questions.post.ts` or
  `votes.post.ts` read them.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **`verify-moderator-session` helper + refactor** -
      `server/utils/verify-moderator-session.ts` per the contract above;
      update `moderator-session.get.ts` to call it instead of its
      current inline logic.
      **Done when:** code builds; a request with a previously valid
      token from Feature 19 still returns `{ valid: true }` through the
      refactored endpoint, confirmed by a read-only query showing the
      session row it matched.
- [x] 2. **Moderation questions list endpoint** -
      `server/api/events/[slug]/moderation/questions.get.ts` per the
      contract above.
      **Done when:** a valid moderator token returns every non-deleted
      question for the event regardless of visibility, each with the
      full state fields and correctly redacted
      `displayName`/`attendeeType`; an invalid or expired token returns
      `401`.
- [x] 3. **Moderation question action endpoint** -
      `server/api/events/[slug]/moderation/questions/action.post.ts`
      per the contract above.
      **Done when:** each of the eight actions produces the documented
      column change, confirmed by a read-only query; `publish` and
      `mark_answered` are rejected with `400` on a non-approved
      question and produce no write; an unknown `action` value returns
      `400`; a `questionId` from a different event returns `404`.
- [x] 4. **Event controls endpoint** -
      `server/api/events/[slug]/moderation/event-controls.post.ts` per
      the contract above.
      **Done when:** toggling either or both flags persists them,
      confirmed by a read-only query; an invalid/expired token returns
      `401`; a body with neither flag returns `400`.
- [x] 5. **`/m/<slug>` queue UI** - `app/pages/m/[slug].vue` per the
      contract above.
      **Done when:** after login, the page shows the two switches and
      the full question list with correctly gated action buttons per
      question; clicking an available action updates that question's
      displayed state; toggling a switch persists and survives a
      reload.

## Files / areas

- `server/utils/verify-moderator-session.ts` (new)
- `server/api/events/[slug]/moderator-session.get.ts` (edit - refactor only)
- `server/api/events/[slug]/moderation/questions.get.ts` (new)
- `server/api/events/[slug]/moderation/questions/action.post.ts` (new)
- `server/api/events/[slug]/moderation/event-controls.post.ts` (new)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **No new migration.** Every column this feature reads or writes
  (`approval_status`, `visibility`, `answered`, `archived`,
  `submissions_open`, `voting_open`) already exists from Feature 1's
  original schema and has been live since the app's first migration -
  unlike every recent feature, nothing here is blocked on a pending
  Dashboard SQL step.
- **Approval and public visibility stay independent flags, per the
  overview's explicit note** ("approved doesn't imply visible") -
  `approve` never changes `visibility`, and a moderator must separately
  `publish` to make an approved question public.
- **One deliberate asymmetry: `reject` forces `visibility` back to
  `hidden`.** This is a content-safety guarantee, not a violation of the
  "independent flags" rule above - a rejected question must never remain
  publicly visible, even if a moderator is reconsidering a question they
  had already published.
- **`archive`/`unarchive` are gated on nothing else.** Feature 21's
  "Archive All Unanswered" already establishes that archiving does not
  require `answered = true` first, so individual archiving here follows
  the same rule for consistency.
- **Every mutating endpoint re-verifies the moderator session's full
  validity chain on every call** (event still live, moderator access
  still enabled, session not expired/revoked/soft-deleted) via the new
  shared helper - never cached from a prior check, matching Feature 19's
  own precedent.
- **A `questionId` is only ever trusted after confirming it belongs to
  the session's own event** - the action endpoint scopes its lookup by
  `(id, event_id)` together, never `id` alone.
- **Moderators see the same anonymity/type-visibility redaction
  attendees see on the public feed** - this feature does not add a
  privileged, unmasked identity view for moderators.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue/server-route changes (all five steps - there is no
migration step this time).

**Not yet exercised live:** the full queue end to end (every action
against every legal and illegal starting state, the two event-control
switches, and the redaction behavior for anonymous/typed questions in
the queue view). This implementation pass did not start a dev server;
these are build-verified only (`npm run build` passed after all five
steps).

## Notes for the AI

- Do not build "change current topic," or read/write anything on
  `topics` - deferred to Feature 22 by the user's explicit choice.
- Do not build bulk actions or "Archive All Unanswered" - Feature 21's
  job.
- Do not let the action endpoint touch `text` - no moderator wording
  edits here.
- Do not let `publish` or `mark_answered` succeed against a question
  that is not currently `approved` - re-check the question's own current
  row, never a client-supplied assumption about its state.
- Do not let `reject` leave `visibility` at `public` - always force it
  to `hidden` in the same update.
- Do not apply `hide_vote_counts` to the moderator queue's vote counts -
  that setting is attendee-facing only.
- Do not give moderators an unmasked view of `displayName`/`attendeeType`
  on an anonymous question - apply the exact same redaction Feature 18
  built for the public feed.
- Do not scope the action endpoint's question lookup by `id` alone -
  always confirm `event_id` matches the session's resolved event too.
