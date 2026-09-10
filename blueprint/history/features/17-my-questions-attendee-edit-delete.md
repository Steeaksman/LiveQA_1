## Feature 17: My Questions & attendee edit/delete

**Branch:** `feature/my-questions-attendee-edit-delete`
**Status:** verified

## Goal

Let a joined Attendee see all of their own submitted questions -
regardless of moderation state - and edit or soft-delete them, but only
within an Administrator-configured time window after submission,
enforced server-side.

## In scope

- One new `event_settings` column: `attendee_edit_window_minutes integer
  not null default 0 check (attendee_edit_window_minutes >= 0)`. `0`
  means editing/deleting is disabled entirely (the safe default,
  consistent with every other opt-in restriction this project already
  defaults closed: `submissions_open`, `voting_open`,
  `require_attendee_name`, `require_attendee_type`,
  `duplicate_check_strictness`); a positive value is the number of
  minutes after a question's `created_at` during which its own submitter
  may still edit or delete it. One shared window governs both actions,
  matching this build-plan line's literal "edit/delete window" (not two
  separate settings).
- A new "Attendee edit window (minutes)" number field on the existing
  Settings tab of `/admin/events/[id].vue`.
- `server/api/events/[slug]/my-questions.get.ts`: query params `token`
  (required - without a real attendee, there is nothing to return).
  Returns **all** of that attendee's own non-deleted questions for this
  event regardless of `visibility`/`approval_status` - unlike the public
  feed and Feature 15's suggestions, showing an attendee their *own*
  content back to them is not the disclosure Feature 15 was built to
  avoid. Each row includes `id, text, approvalStatus, visibility,
  canModify` - `canModify` is computed server-side from
  `attendee_edit_window_minutes` and the question's age, never trusted
  from the client.
- `server/utils/find-editable-question.ts`: a shared helper used by both
  mutation endpoints below, since they need the identical
  authorization/window check - live event, real attendee for
  `(event_id, token)`, the question exists, is not deleted, and
  **belongs to that exact attendee** (ownership is re-derived from the
  token every time, never accepted as a client claim), and is still
  within the configured window. Returns the question row or a specific
  error reason.
- `server/api/questions/edit.post.ts`: body `{ eventId, token,
  questionId, text }`. Uses the shared helper; on success, validates the
  new `text` the same way Feature 13's submission endpoint already does
  (trimmed, non-empty, within that event's `question_max_length`), then
  updates the row's `text` **and recomputes `approval_status`/
  `visibility` using the exact same `moderation_mode` mapping Feature 13
  uses at creation** (`immediate` → `approved`/`public`; `queue` →
  `pending`/`hidden`) - see Data/contracts for why editing must re-run
  this mapping rather than leaving the prior state untouched.
- `server/api/questions/delete.post.ts`: body `{ eventId, token,
  questionId }`. Uses the shared helper; on success, soft-deletes
  (`deleted_at = now()`), the same convention every other delete in this
  project already uses (`attendee_types`' "Remove").
- `/e/[slug].vue`: a "My Questions" section (only shown when `joined`),
  listing the attendee's own questions with a status label (Pending /
  Public / Rejected, from `approvalStatus`/`visibility`) and, only when
  `canModify` is true, "Edit" (opens the text for editing in place,
  reusing the existing character-limit `UTextarea`) and "Delete"
  actions. A successful edit or delete re-fetches **both** this list and
  the public feed (the same "never let the client guess a
  moderation-dependent outcome" principle Feature 13 already
  established, since editing can change what the public feed shows).

## Out of scope

- **`question_revisions` (admin edit history).** That table's own schema
  comment names it "admin-only edit history," with an `editor` column
  that is a non-nullable FK to `profiles` - attendees have no `profiles`
  row and cannot populate it. An attendee's self-edit is not logged
  anywhere beyond the question's own `updated_at`; admin-visible edit
  history is Feature 33's job entirely.
- **Clearing existing votes when a question is edited.** Nothing asks
  for this, and it would be a new destructive side effect; votes stay
  exactly as they are regardless of edits.
- **Anonymity, attendee-type visibility, or displaying who asked a
  question anywhere except this attendee's own "My Questions" list** -
  Feature 18's job; the public feed still shows no submitter identity at
  all.
- **Moderator-side visibility into who has how many pending edits, or
  any moderator action on a question** - Features 19/20.
- **Any change to how a question first gets its initial state at
  submission** - Feature 13's `questions.post.ts` is unchanged; the
  identical mapping is *reused* by the edit endpoint, not altered.
- **A configurable "who can delete" beyond the submitter** - only the
  question's own attendee, via their own device token, can ever edit or
  delete it; there is no admin/moderator delete action here.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Edit-window settings migration** - `alter table
      public.event_settings add column attendee_edit_window_minutes
      integer not null default 0 check
      (attendee_edit_window_minutes >= 0);`.
      **Done when:** the migration file exists, matching this project's
      plain `alter table` convention; applying it (outside this skill)
      is required before later steps can be verified live.
- [x] 2. **Admin edit-window setting** - add the number field to the
      Settings tab, fetched/saved with the tab's existing fields.
      **Done when:** code builds; setting a value (including `0`) and
      saving persists it, confirmed by a read-only query once the
      migration is applied.
- [x] 3. **My Questions list endpoint** -
      `server/api/events/[slug]/my-questions.get.ts` per the contract
      above.
      **Done when:** requesting with a real attendee's token returns all
      of their own questions regardless of visibility, each with a
      correct `canModify` reflecting the configured window and the
      question's age; requesting with no token, an unrecognized token,
      or a token belonging to a different event's attendee returns an
      empty list, not another attendee's data or an error.
- [x] 4. **Shared ownership/window helper + edit endpoint** -
      `server/utils/find-editable-question.ts` and
      `server/api/questions/edit.post.ts` per the contract above.
      **Done when:** editing your own question within the window updates
      its text and recomputes approval/visibility per the current
      `moderation_mode`, confirmed by a read-only query; editing after
      the window, editing someone else's question, or editing with the
      window at `0` are all rejected with a clear error and no change;
      exceeding `question_max_length` is rejected the same way Feature
      13's submission endpoint already rejects it.
- [x] 5. **Delete endpoint** - `server/api/questions/delete.post.ts`,
      reusing the step-4 helper.
      **Done when:** deleting your own question within the window sets
      `deleted_at`, confirmed by a read-only query, and it then
      disappears from both the public feed and "My Questions"; deleting
      after the window or someone else's question is rejected with no
      change.
- [x] 6. **"My Questions" UI** - wire the list, edit, and delete actions
      into `/e/[slug].vue` per the contract above.
      **Done when:** a joined attendee sees their own questions with
      correct status labels; Edit/Delete controls appear only when
      `canModify` is true; a successful edit or delete refreshes both
      this list and the public feed.

## Files / areas

- `supabase/migrations/<timestamp>_add_attendee_edit_window.sql` (new)
- `app/pages/admin/events/[id].vue` (edit - edit-window setting)
- `server/api/events/[slug]/my-questions.get.ts` (new)
- `server/utils/find-editable-question.ts` (new)
- `server/api/questions/edit.post.ts` (new)
- `server/api/questions/delete.post.ts` (new)
- `app/pages/e/[slug].vue` (edit - My Questions section)

## Data / contracts

- **Editing re-runs the exact same initial-state mapping submission
  already uses, rather than preserving the prior `approval_status`/
  `visibility`.** This closes a real moderation-bypass gap: under
  `queue` mode, a human specifically approved the *original* text: if an
  edit silently kept the row `approved`/`public`, the attendee could
  swap in different text a moderator never saw. Resetting to
  `pending`/`hidden` on edit (immediately re-approving only under
  `immediate` mode, where no per-submission review ever happened in the
  first place) applies the same rule submission already enforces,
  consistently, rather than inventing a second one.
- **Ownership is re-derived from `(event_id, token)` on every call, never
  accepted as a client-supplied fact** - the shared helper looks up the
  attendee by token first, then checks the question's `attendee_id`
  against that resolved id, not the other way around.
- **`canModify` is a server-computed, server-trusted boolean.** The
  client never independently calculates "is this still within the
  window" from a raw timestamp; it only ever displays what the server
  already decided, and the mutation endpoints re-check the window
  themselves regardless of what the list endpoint most recently reported.
- **A `0` edit window disables the feature entirely for that event** -
  not "an instant window," a hard off switch, matching how `0`-as-
  "disabled" is unambiguous for an integer setting with no other
  meaningful zero value.
- **Soft delete only** - `deleted_at`, never a hard `DELETE`, the
  established convention this project already uses everywhere else.

## Testing

No test runner configured; `npm run build` passed after all six steps
(step 1 is a migration, not executed by any build/test command in this
project, matching every prior migration).

**Not yet exercised live:** editing/deleting within and after the
window, the moderation-mode re-approval mapping, cross-attendee
ownership rejection, and the UI refresh behavior. This implementation
pass did not start a dev server or apply the pending migration; these
are build-verified only so far, the same caveat recorded for Features
6-16.

## Notes for the AI

- Do not preserve a question's prior `approval_status`/`visibility` on
  edit - recompute it from `moderation_mode`, exactly like submission
  does.
- Do not let the edit/delete endpoints trust a client-supplied ownership
  claim - re-derive the attendee from the token and compare against the
  question's actual `attendee_id` every time.
- Do not write to `question_revisions` - that table is Feature 33's
  admin-only edit history, structurally incompatible with an attendee
  actor (its `editor` column is a non-nullable `profiles` FK).
- Do not clear or touch `votes` when a question is edited.
- Do not add a moderator/admin-facing delete action here - only the
  submitting attendee, via their own token, can trigger these two
  endpoints.
