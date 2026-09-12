## Feature 29b: Attachment display & moderation

**Branch:** `feature/attachment-display-moderation`
**Status:** verified

## Goal

Show an attendee's uploaded attachments to everyone else viewing the same
question - on the public feed and in the moderator queue - and give
moderators a way to remove one, completing the work 29a's own "Out of
scope" explicitly reserved for this feature.

## In scope

- **`server/api/events/[slug]/questions.get.ts` (edit).** Each returned
  question gains `attachments: { id, mimeType, sizeBytes, viewUrl }[]`,
  fetched once for every question already in the response (never
  soft-deleted) and resolved to fresh signed URLs in one batched
  `createSignedUrls` call, the same shape and batching style
  `my-questions.get.ts` already uses. No anonymity redaction applies -
  an attachment carries no submitter identity, unlike `displayName`.
- **`server/api/events/[slug]/moderation/questions.get.ts` (edit).** Same
  `attachments` array, same shape, added to each moderation queue row -
  moderators need the `id` to remove one and the `viewUrl` to actually see
  what was uploaded before deciding.
- **`server/api/events/[slug]/moderation/attachments/remove.post.ts`
  (new).** Body `{ token, attachmentId }`. Authenticates with
  `verifyModeratorSession({ slug, token })` exactly as
  `moderation/replies/action.post.ts` does. Resolves the attachment scoped
  to this moderator's event via `attachments.select('id, question_id,
  questions!inner(event_id)').eq('questions.event_id',
  session.eventId).is('deleted_at', null)` - the same embedded-join
  tenant-scoping shape 28a's original reply-action route used before an
  unrelated Realtime need gave `replies` its own `event_id` column;
  nothing here creates a comparable reason to add `event_id` to
  `attachments`, so this route keeps the join. A missing, already-removed,
  or cross-event attachment id all resolve to the same generic "Attachment
  not found." On success, sets `deleted_at = now()` on the `attachments`
  row only - the Storage object is left in place, matching this project's
  soft-delete-everywhere convention (`questions`/`replies`/`attachments`
  all soft-delete; a confirmed *permanent* delete anywhere is explicitly
  Feature 33's job, not this one's).
- **`app/pages/e/[slug].vue` (edit).** Each question in the public feed
  gains a read-only attachment list (mirroring the existing reply-list
  block's placement and style): mime type, size, and a "View" link using
  the signed URL, shown only when the array is non-empty. No new state,
  no upload control here - 29a's upload control stays in My Questions.
- **`app/pages/m/[slug].vue` (edit).** Each queue question gains the same
  read-only attachment list, plus a "Remove" button per attachment that
  calls the new route (mirroring `performReplyAction`'s loading/error
  pattern: a per-attachment `actioningAttachmentId` ref and an inline
  error keyed by attachment id) and refetches the queue on success.

## Out of scope

- **Deleting the Storage object on removal.** Soft-delete only, per the
  resolved note above - this project never hard-deletes on a moderation
  action; a later "confirmed permanent delete" feature (33) is where
  actual object cleanup belongs, for both this and every other soft-delete
  table.
- **Reporting an attachment.** `content_reports` only has `question_id`
  and `reply_id` columns (Feature 24's schema) - there is no
  `attachment_id` to report against, and this feature does not add one.
  Attachments are covered only by the moderator remove action above.
- **Approve/reject/hide states for attachments**, unlike replies. The
  `attachments` table has no `approval_status` or `visibility` column at
  all (confirmed in 29a's own resolved notes) - a binary "exists or
  removed" is the entire state model; inventing intermediate states here
  would require a schema change this build-plan line never asked for.
- **Any change to the upload endpoint, upload UI, or the event-configured
  limits** - all already shipped in 29a; this feature only displays what
  was uploaded and adds one removal action.
- **Attaching a file to a reply, multiple files per request, thumbnailing,
  or any file processing** - all already out of scope per 29a and
  unchanged here.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Public feed exposes attachments** -
      `server/api/events/[slug]/questions.get.ts` per the contract above.
      **Done when:** code builds; a question with non-deleted attachments
      returns each with a working signed `viewUrl`; a question with none
      returns an empty array.
- [x] 2. **Moderator queue exposes attachments** -
      `server/api/events/[slug]/moderation/questions.get.ts` per the
      contract above.
      **Done when:** code builds; the same per-question `attachments`
      shape appears in the moderation response.
- [x] 3. **Moderator remove-attachment route** -
      `server/api/events/[slug]/moderation/attachments/remove.post.ts` per
      the contract above.
      **Done when:** code builds; an invalid session returns 401 "Not
      authorized."; a missing, already-removed, or cross-event attachment
      id returns 404 "Attachment not found." (confirmed by code review,
      since exercising a real Supabase project is outside this skill); a
      valid removal sets `deleted_at` and returns the attachment id.
- [x] 4. **Public feed displays attachments** - `app/pages/e/[slug].vue`
      per the contract above.
      **Done when:** code builds; a question with attachments shows the
      read-only list with working "View" links; a question with none
      shows no attachment block.
- [x] 5. **Moderator queue displays attachments and the remove action** -
      `app/pages/m/[slug].vue` per the contract above.
      **Done when:** code builds; the attachment list and "Remove" button
      render per question; clicking Remove and refetching the queue omits
      the removed attachment (confirmed by code review of the refetch call
      and the endpoints' shared `deleted_at` filter; not yet exercised
      live - requires a dev server and a real uploaded attachment, the
      same caveat recorded for 29a).

## Files / areas

- `server/api/events/[slug]/questions.get.ts` (edit)
- `server/api/events/[slug]/moderation/questions.get.ts` (edit)
- `server/api/events/[slug]/moderation/attachments/remove.post.ts` (new)
- `app/pages/e/[slug].vue` (edit)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **Attachment shape is identical across all three read endpoints**
  (public feed, moderator queue, and 29a's existing `my-questions`):
  `{ id: string, mimeType: string, sizeBytes: number, viewUrl: string |
  null }`. `viewUrl` is `null` only if signing unexpectedly fails, never
  used to hide an attachment that exists.
- **Removal is a soft delete** (`deleted_at = now()`) on the `attachments`
  row - the Storage object is never deleted by this feature. Every read
  endpoint already filters `.is('deleted_at', null)`, so a removed
  attachment disappears from the public feed, the moderator queue, and the
  uploading attendee's own My Questions view without any change to that
  third endpoint.
- **Tenant scoping for the remove route** uses the embedded-join shape
  `attachments` -> `questions!inner(event_id)`, matching 28a's original,
  disclosed-as-unusual precedent for the same problem (a child table with
  no `event_id` of its own). This is a repeat of an already-accepted
  pattern, not a new one.
- **No new Postgres RLS or Storage RLS.** Every access here goes through a
  service-role route (the moderator-session-gated remove route, and the
  two existing service-role read endpoints), matching every other feature
  touching `attachments`.
- **Response envelope:** `{ success, data, error }` throughout. The remove
  route returns `{ attachmentId: string }` on success.

## Testing

No test runner configured; `npm run build` is the automated check for all
five steps. **Not yet exercised live:** a real attachment actually
rendering on the public feed and moderator queue, its signed URL
resolving, and a real removal disappearing from both views end to end -
this requires a dev server, the 29a migration already applied, and a real
uploaded file, the same caveat recorded for every prior Storage-touching
feature (29a).

`npm run build` was run after all five steps and passed cleanly (only
pre-existing, unrelated dependency deprecation warnings appeared); the new
`moderation/attachments/remove.post.mjs` route registered correctly in the
build output.

## Notes for the AI

- Do not delete the Storage object on removal - soft-delete the row only,
  per the resolved note above; do not pull Feature 33's "confirmed
  permanent delete" scope forward into this feature.
- Do not invent `approval_status`/`visibility` columns or states for
  attachments - the schema has none, and a binary remove is this
  feature's entire moderation surface.
- Do not add attachment reporting - `content_reports` has no
  `attachment_id` column and this feature does not add one.
- Reuse `verifyModeratorSession` exactly as
  `moderation/replies/action.post.ts` does; do not re-implement moderator
  session verification inline.
- The remove route has no `action` field/discriminator, unlike
  `replies/action.post.ts` - there is exactly one possible action, so a
  discriminator would be pure ceremony; follow `questions/delete.post.ts`'s
  single-purpose-route precedent instead.
- Do not touch 29a's upload endpoint, upload UI, or the event-configured
  limit settings - this feature only reads and removes.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
