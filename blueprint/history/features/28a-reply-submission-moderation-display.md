# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 28a: Reply submission, moderation & display

**Branch:** `feature/reply-submission-moderation-display`
**Status:** verified

## Goal

Let an attendee post a threaded reply to a public question (moderated
per the event's existing moderation mode), let a moderator post their
own reply that's public immediately, give moderators the matching
approve/reject/hide/publish actions for replies, and show all of this
on both the attendee feed and the moderator queue.

**Resolved before writing this spec (split already approved
separately):** `replies.attendee_id` is nullable, unlike
`questions.attendee_id` (`not null`) - the schema's own design
anticipates a reply source other than an attendee. The only role with
a live-event "responding" workflow in this app is the Moderator (per
the overview's user table; Administrators/Event Managers have no queue
interaction at all). A moderator-authored reply
(`attendee_id: null`) is therefore auto-approved and immediately
public - no further moderation makes sense for something a moderator
already chose to post - while an attendee-authored reply goes through
the exact same `moderation_mode`-driven immediate/queue logic
`questions.post.ts` already uses, and needs the moderator actions this
feature adds. This reading is inferred from repository evidence (the
nullable column, the matching `approval_status`/`visibility` shape,
and "independently moderated" in the build-plan's own wording implying
*some* replies need moderating), not invented from nothing.

**Also resolved, smaller points:**
- **No anonymity for replies.** `replies` has no `anonymous` column and
  no per-reply anonymity toggle exists anywhere; a reply's author is
  always shown as their real display name (attendee-authored) or the
  literal label "Moderator" (moderator-authored, `attendee_id: null`).
  Anonymity is a `questions`-only concept and does not carry over.
- **Reply length reuses `question_max_length`.** No separate
  `reply_max_length` setting exists, and this feature does not invent
  one; the same event-configured cap applies to both.
- **A reply can only target a currently public question** - mirrors
  `votes.post.ts`'s existing rule that a vote can only target a public
  question; replying to something an attendee couldn't even see makes
  no sense.
- **Replying is gated by `submissions_open`**, the same flag that gates
  asking a question - a reply is a form of submission.
- **"Optional" in the build-plan line means a reply is not mandatory
  per question**, not a per-event on/off toggle - no `event_settings`
  column suggests such a toggle exists, and inventing one is out of
  scope.

## In scope

- **`server/api/replies.post.ts` (new)**, mirroring `questions.post.ts`
  closely. Body `{ eventId, token, questionId, text }`. Resolves the
  live event (else generic "Event not found."); checks
  `submissions_open` (else "Submissions are currently closed.");
  resolves the attendee by `(event_id, token)` (else "Please join the
  event before replying."); resolves the target question scoped to
  `(id, event_id)` **and** `visibility = 'public'`, not soft-deleted
  (else "Question not found."); validates `text` (trimmed, required -
  "Please enter a reply." - capped at the event's
  `question_max_length` - "Your reply is too long (max N
  characters)."). Computes `approval_status`/`visibility` from the
  event's `moderation_mode` exactly like `questions.post.ts` does
  (`immediate` -> `approved`/`public`; `queue` -> `pending`/`hidden`).
  Inserts with `attendee_id: attendee.id`.
- **`server/api/events/[slug]/moderation/replies.post.ts` (new)**,
  moderator-session-authenticated (`verifyModeratorSession`). Body
  `{ token, questionId, text }`. Resolves the target question scoped to
  `(id, event_id)` (else `404` "Question not found."); validates `text`
  the same way (`400` "Please enter a reply." / length cap). Inserts
  with `attendee_id: null, approval_status: 'approved', visibility:
  'public'` - no moderation, per the resolved note above.
- **`server/api/events/[slug]/moderation/replies/action.post.ts`
  (new)**, moderator-session-authenticated. Body `{ token, replyId,
  action }`, `action` one of `approve`, `reject`, `hide`, `publish`
  (no `mark_answered`/`archive` - `replies` has neither column).
  `401` on a bad session; `404` "Reply not found." when `replyId`
  doesn't resolve to a non-deleted reply whose question belongs to this
  session's event (scoped by joining through `question_id` ->
  `questions.event_id`, never trusting `replyId` alone); `400`
  "Invalid action." otherwise. `approve` sets `approval_status:
  'approved'`; `reject` sets `approval_status: 'rejected'` **and**
  forces `visibility: 'hidden'` (same safety rule Feature 20 already
  applies to questions); `hide` sets `visibility: 'hidden'`; `publish`
  requires the reply's current `approval_status` to already be
  `'approved'` (else `400` "Approve the reply before publishing it.")
  and sets `visibility: 'public'`.
- **`server/api/events/[slug]/questions.get.ts` (edit).** Each returned
  question gains `replies: { id, text, createdAt, displayName: string
  | null }[]` - only `visibility = 'public'`, non-deleted replies,
  ordered oldest-first (a thread reads top-to-bottom). `displayName` is
  the resolved attendee's `display_name` when `attendee_id` is set, or
  the literal string `"Moderator"` when it is `null`. Resolved via a
  batch lookup against `attendees` for the reply-author ids actually
  present (mirroring this endpoint's existing submitter-lookup
  pattern) - never a raw `attendee_id` in the response.
- **`server/api/events/[slug]/moderation/questions.get.ts` (edit).**
  Each returned question gains `replies: { id, text, createdAt,
  approvalStatus, visibility, displayName: string | null }[]` - **every**
  non-deleted reply regardless of state (moderators need to see and act
  on pending ones), same `displayName`/`"Moderator"` resolution as
  above.
- **`app/pages/e/[slug].vue` (edit).** Under each question, its public
  replies render as `displayName - text`; when `joined`, a small reply
  input + button posts to `/api/replies` and refetches the list on
  success (reusing `refreshQuestions()`), clearing the input only after
  a confirmed success - matching this page's existing submit-question
  discipline.
- **`app/pages/m/[slug].vue` (edit).** Under each question in the
  queue, every reply renders with its state and only the currently
  legal action buttons (mirroring `availableActions`'s per-state
  filtering pattern for questions, scaled down to the four reply
  actions); a small input + button lets the moderator post their own
  reply, which appears immediately (public, no action buttons needed)
  after the queue refetches.

## Out of scope

- **Reply reporting or Realtime** - Feature 28b's job, the sibling
  split of this same build-plan item.
- **Bulk reply actions** - Feature 21's bulk tooling was scoped to
  questions; nothing here extends multi-select to replies.
- **Any anonymity option for a reply** - see the resolved note above;
  `replies` has no such column and this feature does not add one.
- **Nested replies (a reply to a reply)** - the schema only links a
  reply to a `question_id`, one level deep; nothing here builds
  threading beyond that.
- **Notifications for new/pending replies** - Feature 23's polling
  timer watches pending *questions* only; this feature does not extend
  it to replies.
- **Editing or deleting a reply, by anyone** - not asked for; the
  attendee edit/delete window (Feature 17) was scoped to questions
  only, and nothing here proposes an equivalent for replies.
- **A separate `reply_max_length` setting** - reuses
  `question_max_length`, per the resolved note above.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Attendee reply submission endpoint** -
      `server/api/replies.post.ts` per the contract above.
      **Done when:** replying to a public question in an `immediate`-
      mode event creates an `approved`/`public` reply; in a `queue`-
      mode event it creates `pending`/`hidden`; replying to a non-
      public, unknown, or different-event question returns "Question
      not found."; replying without submissions open, without having
      joined, or with empty/too-long text all return their respective
      messages - each confirmed by a read-only query where a write is
      expected.
- [x] 2. **Moderator-authored reply endpoint** -
      `server/api/events/[slug]/moderation/replies.post.ts` per the
      contract above.
      **Done when:** a valid moderator session creates a reply with
      `attendee_id: null`, `approval_status: 'approved'`, `visibility:
      'public'`, confirmed by a read-only query; an invalid session
      returns `401`; an unknown or different-event `questionId` returns
      `404`.
- [x] 3. **Moderator reply action endpoint** -
      `server/api/events/[slug]/moderation/replies/action.post.ts` per
      the contract above.
      **Done when:** each of the four actions produces its documented
      column change; `publish` against a non-approved reply returns
      `400` and writes nothing; an unknown action returns `400`; a
      `replyId` whose question belongs to a different event returns
      `404`.
- [x] 4. **Public feed embeds replies** -
      `server/api/events/[slug]/questions.get.ts` per the contract
      above.
      **Done when:** a question with public replies returns them
      oldest-first with the correct `displayName`/`"Moderator"`
      resolution; a pending or hidden reply never appears in this
      response.
- [x] 5. **Moderation queue embeds replies** -
      `server/api/events/[slug]/moderation/questions.get.ts` per the
      contract above.
      **Done when:** a question's response includes every one of its
      non-deleted replies regardless of state, each with the correct
      `displayName`/`"Moderator"` resolution.
- [x] 6. **Attendee reply UI** - `app/pages/e/[slug].vue` per the
      contract above.
      **Done when:** public replies render under their question;
      submitting a reply while joined works and the input clears only
      on confirmed success; the reply control is absent before joining.
- [x] 7. **Moderator reply UI** - `app/pages/m/[slug].vue` per the
      contract above.
      **Done when:** every reply renders with its state and only its
      currently legal action buttons; clicking one updates it after a
      refetch; posting a moderator reply appears as public immediately.

## Files / areas

- `server/api/replies.post.ts` (new)
- `server/api/events/[slug]/moderation/replies.post.ts` (new)
- `server/api/events/[slug]/moderation/replies/action.post.ts` (new)
- `server/api/events/[slug]/questions.get.ts` (edit)
- `server/api/events/[slug]/moderation/questions.get.ts` (edit)
- `app/pages/e/[slug].vue` (edit)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **No new migration.** `replies` and its `approval_status`/
  `visibility` columns have existed since Feature 1; this feature is
  their first consumer.
- **A moderator-authored reply is never moderated** - it is inserted
  already `approved`/`public`; the four reply actions exist for
  attendee-authored replies (and for a moderator later reconsidering
  one, e.g., hiding it).
- **`reject` forces `visibility` back to `hidden`** on replies, exactly
  matching Feature 20's rule for questions, for the same reason - a
  rejected reply must never remain public.
- **A reply is only ever resolved through its question's `event_id`**,
  never trusted or looked up by `replyId` alone across either
  moderation endpoint - the same tenant-scoping discipline every prior
  moderation endpoint in this app already applies.
- **`displayName` on a reply is `"Moderator"` when `attendee_id` is
  `null`, and the resolved attendee's real name otherwise** - there is
  no anonymity redaction to apply, since replies have no `anonymous`
  concept.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue/server-route changes (all seven steps - no migration
is needed).

**Not yet exercised live:** the full reply lifecycle end to end (an
attendee reply in both moderation modes, a moderator-authored reply
appearing immediately, each of the four moderator actions against a
real reply, and both surfaces' display). This implementation pass did
not start a dev server; these are build-verified only (`npm run build`
passed after all seven steps).

**One query worth extra attention during live testing:** the reply
action endpoint scopes its lookup through the reply's question to the
session's event using PostgREST's embedded-resource filter
(`.select('..., questions!inner(event_id)').eq('questions.event_id',
...)`) - a less common pattern than the plain `.eq()` calls used
everywhere else in this codebase. It reads as correct PostgREST syntax,
but this pass could not run it against the live database to confirm.

## Notes for the AI

- Do not moderate a moderator-authored reply - it is inserted already
  approved and public.
- Do not add anonymity handling for replies - the column does not
  exist and this feature does not add one.
- Do not add bulk reply actions, reply editing/deletion, or reply
  notifications - all explicitly out of scope.
- Do not scope a reply lookup by `replyId` alone - always join through
  to the question's `event_id`.
- Do not let `publish` succeed against a reply that is not currently
  `approved` - re-check its current row, never a client-supplied
  assumption.
- Do not build reply reporting or realtime here - Feature 28b's job.
