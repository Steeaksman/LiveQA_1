## Feature 33a: Admin question view & wording edit with revision history

**Branch:** `feature/admin-question-view-wording-edit-with-revision-history`
**Status:** verified

## Goal

Give an Administrator or an Event Manager with access to a specific event
a view of every question in that event and a way to correct a question's
wording, with every edit recorded in `question_revisions` - the table
Feature 1 already created (schema: `question_id, original_text,
revised_text, edited_by, created_at`) and nothing has ever written to.

**Resolved before writing this spec (split already approved separately;
each point below is inferred from repository evidence, not invented from
nothing):**

1. **No admin-facing question view exists yet.** Feature 31's dashboard
   shows only aggregate counts; the only place any question's full text
   and state are currently visible is the moderator queue
   (`/m/<slug>`), which has no wording-edit or revision-history concept
   and is a different actor (event-scoped password session, not
   Administrator/Event Manager). This feature adds the first
   admin-side per-question view, as a new tab on the existing event
   management page - the same pattern every other admin capability on
   that page already follows.
2. **An admin's wording edit does not reset moderation state.**
   Feature 17's attendee-initiated edit resets `approval_status`/
   `visibility` because it is treated as a resubmission needing review
   again. An Administrator/Event Manager is already a trusted actor in
   this app (mirroring moderator-authored replies' auto-approval,
   Feature 28a) - a wording correction is not a new submission, so this
   feature leaves `approval_status`/`visibility`/`answered`/`archived`
   untouched.
3. **Blocked-term filtering (Feature 30b) does not apply to an admin
   edit**, for the same trusted-actor reason moderator-authored replies
   were exempted from it.
4. **The event's configured `question_max_length` still applies.** An
   admin edit is still text going into the same column every other
   question-writing path respects; there is no stated reason to let an
   admin bypass a length rule the event itself defines.
5. **This is the "admin question edits" category Feature 32's audit log
   explicitly deferred** ("no producing feature yet"). This feature is
   that producing feature, so the edit action also calls
   `logAuditAction`, completing that disclosed gap rather than leaving
   it open.
6. **Restore and confirmed permanent delete are Feature 33b's job**, not
   this feature's - per the approved split, this feature only adds the
   view and the wording-edit/revision-history capability.

## In scope

- **`server/api/admin/events/[id]/questions.get.ts` (new).**
  `verifyEventAccess`-gated. Returns every non-deleted question for the
  event (any approval/visibility/answered/archived state, no filtering -
  this is an oversight view, not the moderation queue) as `{ id, text,
  approvalStatus, visibility, answered, archived, createdAt, displayName
  }[]`, each with an embedded `revisions: { id, originalText,
  revisedText, editedByEmail, createdAt }[]` (fetched in one batched
  query across all the event's questions and joined to `profiles(email)`
  for the editor, ordered oldest first per question). `displayName`
  always shows the real submitter name regardless of the question's own
  anonymity - matching the moderation queue's existing precedent that
  admin/moderator surfaces never apply attendee-facing redaction.
- **`server/api/admin/events/[id]/questions/edit.post.ts` (new).**
  `verifyEventAccess`-gated. Body `{ questionId, text }`. Resolves the
  target question scoped to `(id, event_id)`, not deleted - a missing or
  cross-event id returns "Question not found." Validates the trimmed
  text is non-empty ("Please enter a question.") and does not exceed the
  event's `event_settings.question_max_length` (same message shape as
  every other question-writing endpoint). On success: inserts `{
  question_id, original_text: <text before this update>, revised_text:
  <new text>, edited_by: callerId }` into `question_revisions`, then
  updates only `questions.text` (no approval/visibility/answered/archived
  change), then calls `logAuditAction(callerId, 'question_edited',
  eventId, { questionId })`.
- **`app/pages/admin/events/[id].vue` (edit).** New `'questions'` entry
  in the `activeTab` union and a tab button labeled "Questions". Panel:
  fetches the new list route on tab-select (same Bearer-token pattern as
  the Dashboard tab); renders each question with its state badges, a
  "Show revisions (N)" toggle listing each `original -> revised` pair
  with editor email and timestamp, and an inline edit control (a
  textarea pre-filled with the current text plus Save/Cancel) that posts
  to the new edit route and refetches the list on success.

## Out of scope

- **Restore or permanent delete for questions** - Feature 33b's job
  entirely; nothing here can undo a soft delete or hard-delete anything.
- **Extending restore/permanent-delete to replies or attachments** -
  split to a new build-plan item (44); "everywhere" in the parent
  build-plan line stays scoped to questions across both 33a and 33b.
- **Resetting or otherwise touching `approval_status`, `visibility`,
  `answered`, or `archived` on edit** - per the resolved note above, an
  admin wording edit is not a resubmission.
- **Blocked-term filtering on the admin edit** - per the resolved note
  above, matching moderator-authored replies' existing exemption.
- **Editing a reply's or an attachment's content** - this build-plan
  line and `question_revisions`'s schema are both question-specific;
  nothing here invents a parallel mechanism for other content types.
- **Any change to the moderator queue** - moderators still have no
  wording-edit or revision-history capability; this is an
  Administrator/Event-Manager-only surface, not a moderator one.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Admin question list route** -
      `server/api/admin/events/[id]/questions.get.ts` per the contract
      above.
      **Done when:** code builds; a missing/invalid bearer token returns
      401 "Not authorized." (confirmed by code review, since exercising a
      real Supabase project is outside this skill); every question in
      the event is returned regardless of state, each with its revisions
      ordered oldest first.
- [x] 2. **Admin wording-edit route** -
      `server/api/admin/events/[id]/questions/edit.post.ts` per the
      contract above.
      **Done when:** code builds; an edit inserts exactly one
      `question_revisions` row and updates only `questions.text`; a
      missing/cross-event question id returns "Question not found."; an
      empty or over-length edit is rejected with no row or update
      created; a successful edit calls `logAuditAction` with
      `'question_edited'`.
- [x] 3. **Questions tab** - the `activeTab`/list/edit-UI additions in
      `/admin/events/[id].vue` per the contract above.
      **Done when:** code builds; selecting the Questions tab lists every
      question with its state badges; editing a question's text and
      saving refetches and shows the updated text; expanding "Show
      revisions" lists each prior edit with its editor and timestamp.

## Files / areas

- `server/api/admin/events/[id]/questions.get.ts` (new)
- `server/api/admin/events/[id]/questions/edit.post.ts` (new)
- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

- **No new migration, no new column, no new RLS policy** -
  `question_revisions` and its schema already exist from Feature 1; this
  feature is only the first to write to and read from it.
- **`question_revisions.original_text` is always the text immediately
  before this specific update** - not the question's first-ever text -
  so the full wording history is reconstructable by walking the chain in
  `created_at` order, exactly matching a standard append-only revision
  log.
- **Authorization:** `verifyEventAccess(event, eventId)` on both new
  routes, identical to every other admin/Event-Manager-scoped route in
  this project.
- **Audit log integration:** `logAuditAction(callerId,
  'question_edited', eventId, { questionId })` - `details` intentionally
  omits the actual text (already fully captured in `question_revisions`
  itself; the audit entry only needs to record that an edit happened,
  by whom, and to which question).
- **Response envelope:** `{ success, data, error }` throughout, matching
  every other server route in this project.

## Testing

No test runner configured; `npm run build` is the automated check for all
three steps. **Not yet exercised live:** a real edit actually producing a
revision row, the list route's batched revision join returning correctly
shaped data, and the tab's edit/refetch flow - all require a dev server
and a real Supabase project, the same caveat recorded for every prior
feature that could not start a server from this skill.

`npm run build` was run after all three steps and passed cleanly (only
pre-existing, unrelated dependency deprecation and plugin-timing warnings
appeared); both new routes registered correctly in the build output.

## Notes for the AI

- Do not reset `approval_status`/`visibility`/`answered`/`archived` on an
  admin edit - per the resolved note above.
- Do not apply blocked-term filtering to the admin edit route.
- Do not build restore or permanent delete here - Feature 33b's job.
- Do not extend this to replies or attachments - Feature 44's job.
- Reuse `verifyEventAccess` and `logAuditAction` exactly as they already
  exist; do not re-implement authorization or audit logging inline.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
