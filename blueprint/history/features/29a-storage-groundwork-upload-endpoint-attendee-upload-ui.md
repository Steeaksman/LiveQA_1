# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 29a: Storage groundwork, upload endpoint & attendee upload UI

**Branch:** `feature/storage-groundwork-upload-endpoint-attendee-upload-ui`
**Status:** verified

## Goal

Let an attendee attach an image or PDF to their own question, backed by
a new, private Supabase Storage bucket - the first time this project
has touched Storage at all. Everything after the upload succeeds
(showing attachments to other attendees and moderators) is Feature
29b's job.

**Resolved before writing this spec (split already approved
separately); each point below is inferred from repository evidence, not
invented from nothing:**

1. **`attachments` has no owner column at all** - not `attendee_id`, not
   anything. The only sensible, safe reading is that an attachment
   belongs to *the question's own submitter* - so this feature requires
   the uploading attendee to already own the target question
   (`questions.attendee_id` must match their resolved identity),
   checked server-side on every upload. There is no product signal
   anywhere suggesting an attendee could attach a file to someone
   else's question.
2. **Upload lives in "My Questions," not the public feed.** The public
   feed endpoint deliberately never exposes a question's raw
   `attendee_id` to the client (Feature 12's own stated redaction
   rule) - there is no client-safe way to know "is this my question" on
   that view. "My Questions" (Feature 17) is the one surface that
   already lists exactly an attendee's own submissions, so it's the
   only place an upload control can exist without inventing a new
   ownership-revealing endpoint.
3. **File-type limits are a fixed, non-configurable security allowlist;
   size and count are the two event-configurable numbers.** The
   build-plan line pairs "configurable type/size/count limits" with
   "secure server-side validation" in the same sentence - read as two
   coordinate requirements rather than three configurable knobs: type
   checking is the security backstop ("secure...validation"), while
   size and count are the tunable product knobs. Building a full
   per-event MIME-type picker in the admin UI is materially larger
   scope with no stated need; a fixed allowlist (common image formats
   plus PDF, matching "image/document" from the build-plan's own
   wording) is the simpler, safer default and is easy to revisit later
   if an admin genuinely needs finer control.
4. **The bucket is private; every access goes through a service-role
   server route, including reads (signed URLs)** - matching this
   project's dominant, near-universal pattern of service-role-only
   access to anon-facing data. No Storage RLS policies are added at
   all, since the service role already bypasses Storage RLS exactly
   like it bypasses every Postgres table's RLS in this app.
5. **Uploading is gated by `submissions_open`**, the same flag every
   other attendee-initiated content-adding action in this app already
   checks, for consistency.

## In scope

- **New migration:**
  - **A private Storage bucket**, created via `insert into
    storage.buckets (id, name, public) values
    ('question-attachments', 'question-attachments', false)` - the
    same plain-SQL-migration convention this project already uses for
    everything else, rather than a separate manual Dashboard step.
  - **`event_settings.attachment_max_count integer not null default 0
    check (attachment_max_count >= 0)`** - `0` means attachments are
    disabled for the event, matching Feature 17's exact "`0` =
    disabled" convention for `attendee_edit_window_minutes`.
  - **`event_settings.attachment_max_size_bytes bigint not null
    default 5242880 check (attachment_max_size_bytes >= 0)`** - `5
    MB` is a documented, sensible starting default; an admin can raise
    or lower it.
- **Admin Settings tab (`/admin/events/[id].vue`, edit):** two new
  numeric fields, "Max attachments per question" and "Max attachment
  size (bytes)," fetched/saved alongside the tab's existing numeric
  settings.
- **`server/api/events/[slug].get.ts` (edit):** adds
  `attachmentMaxCount` and `attachmentMaxSizeBytes` to the context
  response, alongside the other settings the attendee page already
  reads.
- **`server/api/attachments.post.ts` (new).** Multipart form body
  (`eventId`, `token`, `questionId`, `file`), parsed via h3's
  `readMultipartFormData`. In order: resolves the live event (else
  generic "Event not found."); checks `submissions_open` (else
  "Submissions are currently closed."); resolves the attendee by
  `(event_id, token)` (else "Please join the event before adding an
  attachment."); resolves the target question scoped to `(id,
  event_id, attendee_id)` **together** - a question that exists but
  isn't this attendee's own resolves to the same generic "Question not
  found." as one that doesn't exist at all, never distinguishing the
  two; reads `attachment_max_count` (`0` -> "Attachments are not
  enabled for this event.") and the question's current attachment
  count (`>=` the max -> "You've reached the maximum number of
  attachments for this question."); validates the uploaded file's MIME
  type against the fixed allowlist (`image/jpeg`, `image/png`,
  `image/gif`, `image/webp`, `application/pdf` - else "Unsupported
  file type.") and its size against `attachment_max_size_bytes` (else
  "File is too large (max N MB)."). On success, uploads the file to
  `question-attachments` at a **server-generated** path
  (`<eventId>/<questionId>/<crypto.randomUUID()>`, never the
  client-supplied filename, to avoid any path-traversal or collision
  risk from untrusted input) and inserts `{ question_id, storage_path,
  mime_type, size_bytes }` into `attachments`.
- **`server/api/events/[slug]/my-questions.get.ts` (edit).** Each
  returned question gains `attachments: { id, mimeType, sizeBytes,
  viewUrl: string }[]` - a short-lived signed URL
  (`supabase.storage.from('question-attachments').createSignedUrl(...)`,
  generated server-side with the service-role client) for each of that
  question's own, non-deleted attachments. This is the direct feedback
  loop for what an attendee just uploaded, not a public display
  mechanism - Feature 29b owns showing attachments to anyone else.
- **`app/pages/e/[slug].vue` (edit).** In the existing "My Questions"
  section, each question gains: a short list of its current
  attachments (mime type, size, a "View" link using the signed URL) when
  it has any, and - only while `submissionsOpen` and
  `attachmentMaxCount > 0` and the question's current attachment count
  is below that max - a file input plus "Upload" button that posts to
  `/api/attachments` as multipart form data and refetches My Questions
  on success.

## Out of scope

- **Showing an attachment on the public feed or moderator queue** -
  Feature 29b's job entirely; this feature's only display surface is
  the uploading attendee's own "My Questions" view.
- **A moderator remove-attachment action** - Feature 29b's job; nothing
  in this feature lets anyone delete an attachment once uploaded.
- **A per-event configurable file-type allowlist** - see the resolved
  note above; type checking is a fixed security boundary in this
  feature, not a product setting.
- **Attaching a file to a reply** - the schema's `attachments` table
  only has `question_id`, never `reply_id`; nothing here invents that.
- **Multiple files in one upload request, or drag-and-drop** - one file
  per request, a plain file input; nothing asked for either.
- **Image thumbnailing, resizing, or any processing of the uploaded
  file** - stored exactly as uploaded.
- **Attaching a file at the moment of question submission** - the
  attendee submits the question first (already-established flow), then
  adds an attachment afterward from My Questions; `attachments.question_id
  not null` makes an attachment-before-question ordering impossible
  anyway.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Migration: Storage bucket + configurable limits** per the
      contract above.
      **Done when:** the migration file exists, matching this
      project's plain-SQL conventions; applying it (outside this
      skill) is required before later steps can be verified live.
- [x] 2. **Admin settings: attachment limits** - the two numeric fields
      in `/admin/events/[id].vue` per the contract above.
      **Done when:** code builds; setting and saving both values
      persists them, confirmed by a read-only query once the migration
      is applied.
- [x] 3. **Context endpoint exposes the limits** -
      `server/api/events/[slug].get.ts` per the contract above.
      **Done when:** requesting a live event's context returns both
      values, defaulting to `0`/`5242880` when unset.
- [x] 4. **Upload endpoint** - `server/api/attachments.post.ts` per the
      contract above.
      **Done when:** uploading a valid file to the attendee's own
      question creates one `attachments` row and one Storage object,
      confirmed by a read-only query; uploading to a question owned by
      a different attendee, an unknown question, or a non-public-yet-
      real question all return the same "Question not found."; an
      oversized file, an unsupported type, exceeding the per-question
      count, or a `0` max-count event each return their respective
      message with no row or object created.
- [x] 5. **My Questions exposes attachments** -
      `server/api/events/[slug]/my-questions.get.ts` per the contract
      above.
      **Done when:** a question with attachments returns each with a
      working signed view URL; a question with none returns an empty
      array.
- [x] 6. **Attendee upload UI** - `app/pages/e/[slug].vue` per the
      contract above.
      **Done when:** the upload control is hidden once a question's
      attachment count reaches the configured max, or while
      submissions are closed, or when the event's max count is `0`;
      uploading a valid file succeeds and the new attachment appears
      in the list after refetching; existing attachments show a
      working "View" link.

## Files / areas

- `supabase/migrations/<timestamp>_add_attachments_storage.sql` (new)
- `app/pages/admin/events/[id].vue` (edit)
- `server/api/events/[slug].get.ts` (edit)
- `server/api/attachments.post.ts` (new)
- `server/api/events/[slug]/my-questions.get.ts` (edit)
- `app/pages/e/[slug].vue` (edit)

## Data / contracts

- **No Storage RLS policies are added.** The bucket is private and
  every operation (upload, signed-URL generation) goes through a
  service-role server route - matching this project's dominant
  service-role-only access pattern instead of adding another anon
  carve-out.
- **An attachment's storage path is always server-generated**
  (`<eventId>/<questionId>/<uuid>`), never derived from the
  client-supplied filename - the original filename is not stored or
  trusted anywhere.
- **Ownership is checked by requiring `(id, event_id, attendee_id)` to
  match together on the target question** - a question that exists but
  belongs to someone else is indistinguishable from one that doesn't
  exist at all, matching this app's anti-enumeration convention applied
  to a new case.
- **`attachment_max_count = 0` disables the feature entirely for that
  event**, exactly mirroring `attendee_edit_window_minutes`'s existing
  `0`-means-disabled convention.
- **File-type validation is fixed and identical for every event** - not
  a stored setting, and not something any admin action in this feature
  can change.
- **Signed URLs are generated fresh on every `my-questions` request**,
  never cached or stored - they expire on Supabase's own schedule and
  the endpoint simply re-issues one each time it's called.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue/server-route changes (steps 2-6). The migration
(step 1) is not executed by any build or test command, matching every
prior migration-carrying feature.

**Not yet exercised live:** the full upload flow end to end (a
successful upload, each rejection case, the signed URL actually
resolving to the uploaded file, and the upload control's visibility
rules). This implementation pass did not start a dev server; these are
build-verified only (`npm run build` passed after all six steps).
Nitro/H3's own default request-body-size limit has not been checked
against the configured `attachment_max_size_bytes` default - worth
confirming in live testing that a request near the configured max
isn't rejected by the framework before this feature's own size check
even runs.

**One extra safety net beyond the spec's literal wording:** if the
`attachments` row insert fails after a successful Storage upload, the
endpoint now removes the just-uploaded object rather than leaving an
orphaned file behind.

## Notes for the AI

- Do not let an attendee upload to a question they don't own - scope
  every lookup by `(id, event_id, attendee_id)` together.
- Do not trust or store the client-supplied filename - always generate
  the storage path server-side.
- Do not add Storage RLS policies - every access goes through a
  service-role route.
- Do not build a per-event configurable file-type allowlist - the type
  check is fixed, per the resolved note above.
- Do not show attachments anywhere but the uploading attendee's own "My
  Questions" view, and do not add any delete/remove action - both are
  Feature 29b's job.
- Do not support attaching a file to a reply - the schema has no
  column for it.
