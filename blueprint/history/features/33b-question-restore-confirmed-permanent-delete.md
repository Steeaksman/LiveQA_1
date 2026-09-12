## Feature 33b: Question restore & confirmed permanent delete

**Branch:** `feature/question-restore-confirmed-permanent-delete`
**Status:** verified

## Goal

Let an Administrator or an Event Manager with access to a specific event
soft-delete a question, restore it, or permanently and irreversibly
delete it (and everything that hangs off it) - built on 33a's admin
Questions tab, the first admin-facing surface with any per-question
control.

**Resolved before writing this spec (split already approved separately;
each point below is inferred from repository evidence, not invented from
nothing):**

1. **Every child table already cascade-deletes from `questions`.**
   Feature 1's schema declares `on delete cascade` from
   `question_revisions`, `votes`, `replies`, and `attachments` to
   `questions.id`, and `content_reports` cascades from both `questions`
   and `replies`. A single hard `DELETE FROM questions WHERE id = ...`
   therefore already removes every row that belongs to it - no manual
   multi-table cleanup is needed in code, only the Storage objects
   behind any of that question's attachments, which Postgres cascade
   cannot reach.
2. **Storage cleanup for permanent delete is best-effort, after the
   database delete succeeds** - matching this project's established
   order for two-step cleanup (the database row is the source of truth;
   an orphaned Storage object on a rare failure is the same class of
   acceptable residue `attachments.post.ts`'s own rollback and
   `branding-logo.delete.ts` already accept elsewhere, never the reverse
   - a DB row surviving while its Storage object is already gone would
   be a worse, actually-broken state).
3. **Permanent delete does not require soft-deleting first.** The
   build-plan line lists soft delete/restore/permanent delete as three
   related but independent capabilities, not a required sequence; an
   admin can permanently delete an active question directly, with the
   confirmation step (below) as the actual safety gate.
4. **"Confirmed" means a real confirmation step, using the simplest
   mechanism this project has any use for.** Nothing in this codebase
   has built a confirmation dialog/modal before, so this feature uses
   the browser's native `window.confirm(...)` before calling the
   permanent-delete endpoint - a genuine, blocking "are you sure," not a
   cosmetic one, without inventing new UI component infrastructure for a
   single irreversible action.
5. **A soft-deleted question cannot be edited.** 33a's edit route already
   scopes its target lookup to `deleted_at is null`, so a deleted
   question already returns "Question not found." there unmodified; this
   feature's admin UI simply does not offer the Edit control for a
   deleted question, matching that existing behavior instead of
   contradicting it.
6. **Restore and permanent delete for replies/attachments are Feature
   44's job**, per the approved split - this feature touches only
   `questions`.

## In scope

- **`server/api/admin/events/[id]/questions.get.ts` (edit).** Adds a
  second array to the existing response, `deletedQuestions`, built the
  same way as `questions` but for rows where `deleted_at is not null`
  (same per-question shape, including embedded `revisions`) - one
  additional query, not a second route.
- **`server/api/admin/events/[id]/questions/soft-delete.post.ts`
  (new).** `verifyEventAccess`-gated. Body `{ questionId }`. Resolves the
  question scoped to `(id, event_id)` with `deleted_at is null` - a
  missing, cross-event, or already-deleted id returns "Question not
  found." On success, sets `deleted_at = now()` and calls
  `logAuditAction(callerId, 'question_soft_deleted', eventId, {
  questionId })`.
- **`server/api/admin/events/[id]/questions/restore.post.ts` (new).**
  Same shape, mirrored: resolves the question scoped to `(id, event_id)`
  with `deleted_at is not null` (a missing, cross-event, or
  not-currently-deleted id returns "Question not found."), sets
  `deleted_at = null`, calls `logAuditAction(callerId,
  'question_restored', eventId, { questionId })`.
- **`server/api/admin/events/[id]/questions/permanent-delete.post.ts`
  (new).** `verifyEventAccess`-gated. Body `{ questionId }`. Resolves the
  question scoped to `(id, event_id)` regardless of its current
  `deleted_at` state (per the resolved note above) - a missing or
  cross-event id returns "Question not found." Reads the storage paths
  of that question's `attachments` rows, then hard-deletes the question
  row (cascading to revisions/votes/replies/attachments/content_reports
  automatically), then best-effort removes those Storage objects, then
  calls `logAuditAction(callerId, 'question_permanently_deleted',
  eventId, { questionId })`.
- **`app/pages/admin/events/[id].vue` (edit).** Questions tab gains: a
  "Delete" button per active question (calls soft-delete, refetches); a
  "Deleted questions" section listing `deletedQuestions`, each with
  "Restore" (calls restore, refetches) and no Edit control; a
  "Permanently delete" button on every question in both sections, gated
  by a `window.confirm(...)` naming the question and stating this cannot
  be undone before calling the permanent-delete route and refetching.

## Out of scope

- **Restore or permanent delete for replies or attachments** - Feature
  44's job, per the resolved note above.
- **A "trash retention window" or automatic purge of soft-deleted
  questions** - not named anywhere in the plans; a soft-deleted question
  stays soft-deleted until an admin restores or permanently deletes it,
  indefinitely.
- **Editing a soft-deleted question's text** - per the resolved note
  above, the existing edit route already rejects it; this feature does
  not add an edit control for deleted questions.
- **A custom confirmation dialog/modal component** - `window.confirm`
  per the resolved note above; no new UI component is built for this.
- **Requiring soft delete before permanent delete, or any other required
  sequencing between the three actions** - each is independently
  reachable, per the resolved note above.
- **Any change to the moderator queue's `archive`/`unarchive` actions**
  - a distinct, already-existing lifecycle flag, unrelated to this
  feature's soft-delete/restore/permanent-delete on `deleted_at`.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **List route returns deleted questions too** -
      `server/api/admin/events/[id]/questions.get.ts` per the contract
      above.
      **Done when:** code builds; the response includes both `questions`
      (unchanged, non-deleted) and a new `deletedQuestions` array with
      the same per-question shape.
- [x] 2. **Soft-delete and restore routes** -
      `questions/soft-delete.post.ts` and `questions/restore.post.ts`
      per the contract above.
      **Done when:** code builds; soft-delete on an already-deleted (or
      missing/cross-event) question returns "Question not found." and
      changes nothing; restore on a not-currently-deleted (or
      missing/cross-event) question returns the same; a valid call in
      either direction updates only `deleted_at` and calls
      `logAuditAction` with the corresponding action name.
- [x] 3. **Permanent-delete route** -
      `questions/permanent-delete.post.ts` per the contract above.
      **Done when:** code builds; a missing/cross-event question id
      returns "Question not found."; a valid call removes the question
      row (confirmed by code review that cascade deletes handle its
      children, since exercising real cascades requires a live database
      outside this skill), best-effort removes its attachments' Storage
      objects, and calls `logAuditAction` with
      `'question_permanently_deleted'`.
- [x] 4. **Questions tab: delete, restore, permanent-delete UI** - the
      additions to `/admin/events/[id].vue` per the contract above.
      **Done when:** code builds; Delete moves a question into the
      Deleted questions section on refetch; Restore moves it back;
      Permanently delete only proceeds after `window.confirm` and then
      removes the question from both sections on refetch; no Edit
      control appears for a deleted question.

## Files / areas

- `server/api/admin/events/[id]/questions.get.ts` (edit)
- `server/api/admin/events/[id]/questions/soft-delete.post.ts` (new)
- `server/api/admin/events/[id]/questions/restore.post.ts` (new)
- `server/api/admin/events/[id]/questions/permanent-delete.post.ts` (new)
- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

- **No new migration, no new column, no new RLS policy** - this feature
  only uses `questions.deleted_at` (already present since Feature 1) and
  the existing FK cascade rules.
- **Soft delete and restore are exact mirror images**, each requiring
  the opposite current `deleted_at` state to succeed - never a blind
  unconditional write.
- **Permanent delete is a real, irreversible `DELETE`, not another
  `deleted_at` write** - once it succeeds, the row and every cascaded
  child row are gone; there is no server-side undo.
- **Storage cleanup on permanent delete is best-effort** - a failure to
  remove a Storage object does not fail the request or roll back the
  already-committed database delete, per the resolved note above.
- **Authorization:** `verifyEventAccess(event, eventId)` on all three new
  routes, identical to every other admin/Event-Manager-scoped route in
  this project.
- **Audit log integration:** `'question_soft_deleted'`,
  `'question_restored'`, and `'question_permanently_deleted'`, each with
  `{ questionId }` as `details` - consistent with `'question_edited'`'s
  existing shape from 33a.
- **Response envelope:** `{ success, data, error }` throughout; all three
  new action routes return `{ questionId }` on success.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** a real soft-delete/restore round
trip, a real permanent delete actually cascading through revisions,
votes, replies, attachments, and content reports, and the Storage
cleanup actually removing objects - all require a dev server and a real
Supabase project, the same caveat recorded for every prior feature that
could not start a server from this skill.

`npm run build` was run after all four steps and passed cleanly (only
pre-existing, unrelated dependency deprecation and plugin-timing warnings
appeared); all three new routes registered correctly in the build output.

## Notes for the AI

- Do not manually delete from `question_revisions`, `votes`, `replies`,
  `attachments`, or `content_reports` before deleting the question - the
  existing FK cascades already handle it; adding manual cleanup would be
  redundant and risks drifting from the schema's own cascade rules.
- Do not require a soft delete before permitting a permanent delete.
- Do not build a custom confirmation modal - `window.confirm` is this
  feature's entire confirmation mechanism, per the resolved note above.
- Do not add an edit control for a deleted question in the tab UI.
- Do not extend restore/permanent-delete to replies or attachments -
  Feature 44's job.
- Reuse `verifyEventAccess` and `logAuditAction` exactly as they already
  exist; do not re-implement authorization or audit logging inline.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
