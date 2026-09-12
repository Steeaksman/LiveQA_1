## Feature 34a: Report data aggregation, CSV & printable HTML export

**Branch:** `feature/report-data-aggregation-csv-printable-html-export`
**Status:** verified

## Goal

Let an Administrator or an Event Manager with access to a specific event
generate a combined or topic-by-topic report of that event's Q&A activity
and download it as CSV or printable HTML - the first feature to write to
the `reports` table Feature 1 already created, and the "report
generation" audit category Feature 32's audit log explicitly deferred.

**Resolved before writing this spec (split already approved separately;
each point below is inferred from repository evidence, not invented from
nothing):**

1. **Report content respects the same anonymity redaction as the public
   feed, not the admin/moderator surfaces' full visibility.**
   `project-plan.md`'s exact wording is "display names where permitted"
   - a report may leave the admin's hands (shared with stakeholders,
   sponsors, etc.), so it reuses `questions.get.ts`'s existing redaction
   rule (`anonymous ? null : displayName`, `attendeeType` shown only when
   `show_attendee_type` is on and the question isn't anonymous) rather
   than the moderation queue's unconditional real-name display.
2. **Question *state* (approval/visibility/answered/archived) is still
   fully visible**, even though identity is redacted - this is
   deliberately an oversight document covering "questions/answered/
   archived" as named states, not a public-facing feed; state and
   identity are independent axes and only identity is redacted.
3. **`hide_vote_counts` does not apply to the report.** That setting
   controls what attendees see live; vote counts and the top-voted
   marker are explicitly named required report content regardless of
   what the event currently hides from its own audience.
4. **Attachment references are descriptive, never signed URLs.** A
   generated report is persisted and may be opened long after any
   1-hour signed URL (this project's existing TTL, Features 29a/33)
   would have expired - each reference is `{ mimeType, sizeBytes }`
   only, not a link.
5. **Replies carry no anonymity redaction**, because none exists anywhere
   in this app for replies (Feature 28a's own display-name resolution is
   already `attendee_id ? name : 'Moderator'` with no anonymous flag to
   check) - the report reuses that exact resolution unchanged.
6. **"Top-voted" can mark more than one question on a tie.** Feature
   31's live dashboard widget had to pick exactly one (a single-slot
   display, tie-broken by earliest `created_at`); a report has no such
   display constraint, so every question sharing the event's maximum
   vote count (when that maximum is greater than zero) is marked
   top-voted - a more accurate, deliberately different choice from that
   earlier single-widget tie-break.
7. **A generated report is persisted to Storage and logged as a `reports`
   row**, not streamed ephemerally - matching the schema Feature 1
   already defined (`event_id, generated_by, report_type, format,
   storage_path`) and this project's established "generate once, store,
   serve via fresh signed URLs on each later view" pattern (Features
   29a, 11b).
8. **Branded PDF is Feature 34b's job**, per the approved split - this
   feature's two formats need no new dependency.

## In scope

- **New migration:** private Storage bucket `event-reports` (`insert into
  storage.buckets (id, name, public) values ('event-reports',
  'event-reports', false)`), the exact `event-branding`/
  `question-attachments` shape - no Storage RLS, service-role-only
  access.
- **`server/utils/build-event-report-data.ts` (new).** Given an
  `eventId` and `reportType: 'combined' | 'topic_by_topic'`, queries
  (service-role): the event's non-deleted attendee count
  (`participationCount`); every non-deleted question with its submitter
  (for redaction), topic name, vote count, replies (non-deleted,
  `{ text, createdAt, displayName }`), and attachments (non-deleted,
  `{ mimeType, sizeBytes }`); applies the redaction rule from note 1 to
  build each row's `displayName`/`attendeeType`; marks `isTopVoted` per
  note 6. Returns `{ participationCount, generatedAt,
  rows: QuestionReportRow[] }` for `'combined'` (rows sorted by
  `createdAt` ascending) or `{ participationCount, generatedAt,
  topics: { topicName: string, rows: QuestionReportRow[] }[] }` for
  `'topic_by_topic'` (an `"No topic"` group first for `topic_id ===
  null`, then one group per topic in the event's topic `sort_order`).
- **`server/utils/build-report-csv.ts` (new).** Takes the aggregation
  result and produces a CSV string: a short header block (participation
  count, generated-at timestamp, report scope), a blank line, then one
  row per question with columns for every field named in the resolved
  notes above (replies and attachments summarized into single
  semicolon-joined text cells, since CSV has no nested structure). For
  `'topic_by_topic'`, each topic's rows are preceded by a one-cell topic
  name row.
- **`server/utils/build-report-html.ts` (new).** Takes the same
  aggregation result and produces a self-contained, print-friendly HTML
  document (inline `<style>`, no external assets) with a header
  (event/report metadata, participation count) followed by one table per
  topic group (or one table for `'combined'`), each question row showing
  every field named above with replies and attachments as a nested list
  within the row.
- **`server/api/admin/events/[id]/reports.post.ts` (new).**
  `verifyEventAccess`-gated. Body `{ reportType: 'combined' |
  'topic_by_topic', format: 'csv' | 'html' }` (an unrecognized value for
  either returns 400 "Invalid report type." / "Invalid format."). Builds
  the aggregation, builds the requested format's content, uploads it to
  `event-reports` at `${eventId}/${reportId}.${csv|html}` (the report
  row's own id as the deterministic path, matching the branding-logo
  precedent of reusing a natural key rather than a separate random one -
  the row is inserted first specifically to obtain that id), inserts the
  `reports` row (`event_id, generated_by: callerId, report_type, format,
  storage_path`), calls `logAuditAction(callerId, 'report_generated',
  eventId, { reportId, reportType, format })`, and returns a fresh
  signed URL for immediate download.
- **`server/api/admin/events/[id]/reports.get.ts` (new).**
  `verifyEventAccess`-gated. Lists this event's non-deleted `reports`
  rows (`report_type, format, created_at`, joined to `profiles(email)`
  for `generated_by`), newest first, each with a freshly generated
  signed URL for its `storage_path`.
- **`app/pages/admin/events/[id].vue` (edit).** New `'reports'` tab:
  a report-type select (Combined / Topic by topic) and a format select
  (CSV / Printable HTML), a "Generate" button that posts to the new
  route and opens the returned signed URL in a new tab; a list of past
  reports (type, format, generated-by email, timestamp, a "Download"
  link using its signed URL) fetched on tab-select.

## Out of scope

- **Branded PDF export** - Feature 34b's job, per the resolved note
  above.
- **Embedding attachment view links in the report** - descriptive
  references only, per the resolved note above.
- **Any redaction of reply authorship** - none exists anywhere in this
  app for replies; this feature does not invent one.
- **Deleting or expiring old reports** - `reports.deleted_at` exists but
  nothing in this feature soft-deletes a report; that is Feature 44-style
  follow-up territory if ever wanted, not named by this build-plan line.
- **A cross-event or global reports view** - one more tab on the
  existing single-event management page, matching every other tab.
- **Any change to `hide_vote_counts`'s existing attendee-facing
  behavior** - per the resolved note above, this feature only chooses not
  to apply that setting to the report; it does not modify the setting or
  its live-feed effect.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Migration: reports Storage bucket** per the contract above.
      **Done when:** the migration file exists, matching the established
      private-bucket convention; applying it (outside this skill) is
      required before later steps can be verified live.
- [x] 2. **Report data aggregation utility** -
      `server/utils/build-event-report-data.ts` per the contract above.
      **Done when:** code builds; `'combined'` returns a flat
      `rows` array and `'topic_by_topic'` returns topic-grouped `topics`
      (confirmed by code review, since exercising real data requires a
      live database outside this skill); `isTopVoted` is true on every
      row sharing the maximum vote count when that maximum is greater
      than zero, and on none when every question has zero votes.
- [x] 3. **CSV and HTML builders** - `build-report-csv.ts` and
      `build-report-html.ts` per the contract above.
      **Done when:** code builds; both accept the same aggregation
      result shape and produce a string for each report type.
- [x] 4. **Report generation route** -
      `server/api/admin/events/[id]/reports.post.ts` per the contract
      above.
      **Done when:** code builds; an invalid `reportType` or `format`
      returns 400 with its specific message and creates nothing; a valid
      request creates exactly one Storage object and one `reports` row,
      calls `logAuditAction` with `'report_generated'`, and returns a
      signed URL.
- [x] 5. **Report list route** -
      `server/api/admin/events/[id]/reports.get.ts` per the contract
      above.
      **Done when:** code builds; every non-deleted report for the event
      is returned with a fresh signed URL and the generator's email.
- [x] 6. **Reports tab** - the additions to `/admin/events/[id].vue` per
      the contract above.
      **Done when:** code builds; selecting Generate with a chosen type
      and format calls the route and opens the resulting signed URL; the
      past-reports list renders on tab-select with working Download
      links.

## Files / areas

- `supabase/migrations/20260910120000_add_event_reports_storage.sql` (new)
- `server/utils/build-event-report-data.ts` (new)
- `server/utils/build-report-csv.ts` (new)
- `server/utils/build-report-html.ts` (new)
- `server/api/admin/events/[id]/reports.post.ts` (new)
- `server/api/admin/events/[id]/reports.get.ts` (new)
- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

- **Bucket:** `event-reports`, private, service-role-only, no Storage
  RLS - matching every prior bucket in this project.
- **`reports.storage_path`** is always `${eventId}/${reportId}.{csv|html}`
  - deterministic, server-generated, reusing the row's own id (inserted
  before the upload specifically to get that id).
- **`QuestionReportRow` shape:** `{ id, text, createdAt, topicName:
  string | null, displayName: string | null, attendeeType: string |
  null, approvalStatus, visibility, answered, archived, voteCount,
  isTopVoted, replies: { text, createdAt, displayName }[], attachments:
  { mimeType, sizeBytes }[] }` - `text` was missing from the original
  draft of this shape; caught during implementation, since a Q&A report
  without the actual question text asked would not be usable.
- **Signed URLs are generated fresh on every request** (generation and
  list), 3600-second TTL matching every other signed-URL use in this
  project - never cached or stored beyond the plain `storage_path`.
- **Audit log integration:** `'report_generated'` with `{ reportId,
  reportType, format }` as `details`, following `'question_edited'`'s
  established shape.
- **Authorization:** `verifyEventAccess(event, eventId)` on both new
  routes, identical to every other admin/Event-Manager-scoped route.
- **Response envelope:** `{ success, data, error }` throughout.

## Testing

No test runner configured; `npm run build` is the automated check for all
six steps. **Not yet exercised live:** a real report actually generating
correct CSV/HTML content from real data, the Storage upload and signed
URL round trip, and the tab's generate/list/download flow - all require a
dev server and a real Supabase project, the same caveat recorded for
every prior feature that could not start a server from this skill.

`npm run build` was run after all six steps and passed cleanly (only
pre-existing, unrelated dependency deprecation and plugin-timing warnings
appeared); both new routes registered correctly in the build output.

**Two corrections made during implementation, before the check passed:**
the `QuestionReportRow` shape in the original spec draft omitted the
question's `text` field entirely (a Q&A report without the actual
questions asked would not be usable) - added and reflected above; and the
topic-by-topic grouping logic in the first draft of
`build-event-report-data.ts` grouped rows by matching `topicName` string
equality against each topic's name, which could misgroup two topics that
happened to share a name - fixed to group by `topic_id` directly instead.

## Notes for the AI

- Do not show real display names or attendee types for anonymous
  questions - apply the exact `questions.get.ts` redaction rule, not the
  admin/moderator full-visibility convention.
- Do not embed attachment view links - descriptive `{ mimeType,
  sizeBytes }` only, per the resolved note above.
- Do not apply `hide_vote_counts` to the report.
- Do not build branded PDF export here - Feature 34b's job.
- Reuse `verifyEventAccess` and `logAuditAction` exactly as they already
  exist; do not re-implement authorization or audit logging inline.
- Reuse the exact bucket/no-RLS/deterministic-path pattern already
  established for `event-branding`/`question-attachments` - do not add
  Storage RLS policies.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
