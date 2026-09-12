## Feature 35a: Event data export

**Branch:** `feature/event-data-export`
**Status:** verified

## Goal

Let an Administrator or an Event Manager with access to a specific event
download one JSON file containing that event's full configuration and
Q&A data - a structured backup, in a format a future restore feature
(35b) can consume.

**Resolved before writing this spec (split already approved separately;
each point below is inferred from repository evidence, not invented from
nothing):**

1. **Attendees are included even though the build-plan line doesn't name
   them.** `questions`/`replies`/`votes` all carry `attendee_id` foreign
   keys; a "structured, restorable format" cannot restore any of them
   without the attendee rows they reference. This is a prerequisite the
   format logically requires, not an invented scope addition.
2. **Attachments, content reports, question revisions, moderator
   sessions, and audit logs are excluded.** The build-plan line names
   exactly "event configuration, attendee types, topics, questions,
   replies, votes, and reports" - a specific enumeration that
   conspicuously does not include attachments (which Feature 29/29b
   already shipped and would be a natural thing to name if intended,
   since it uniquely also involves Storage file bytes, not just rows).
   The other four are audit/history tables never mentioned anywhere in
   this build-plan line either.
3. **This export uses `select('*')` per table, not hand-picked
   columns** - a deliberate, disclosed departure from this project's
   otherwise-universal "select only named columns" convention. That
   convention exists to redact attendee-facing/moderator-facing reads;
   this is a full-fidelity admin backup for the same trusted actor who
   already has unrestricted access to every one of these rows through
   existing admin/moderator surfaces, and hand-maintaining a column list
   here would silently go stale every time a future feature adds a
   column to any of these tables (as `event_settings` already has
   repeatedly this session).
4. **`reports` rows carry only their metadata, not the underlying
   exported file's bytes.** The build-plan names "reports" - the table -
   not "report files"; embedding a potentially large PDF/CSV/HTML body as
   base64 in every export would be disproportionate, and 34a's own
   `reports` rows already record everything needed to identify what was
   generated and when.
5. **Soft-deleted rows are included, with their `deleted_at` value
   intact.** A backup is a faithful snapshot, not a filtered live view -
   restoring should be able to reproduce the exact same soft-delete
   state, not silently resurrect content an admin had removed.
6. **`event_settings.moderator_password_hash` and `attendees.token` are
   included as-is.** Both are already fully visible to the requesting
   actor through other existing routes (the moderator-password route
   sets the hash; every admin/moderator surface already reads attendee
   rows) - this feature aggregates already-accessible data into one
   file, it does not grant new access. A hash is not a usable
   credential on its own, and a device token is exactly the value a
   faithful restore would need to preserve attendee continuity.
7. **This is not one of Feature 32's audit-logged "major actions."**
   That feature's own enumerated list (event CRUD, settings changes,
   moderator password rotation, admin question edits, permanent
   deletion, duplication, report generation, retention purge, Event
   Manager permission changes) does not include data export/backup;
   this feature does not call `logAuditAction`.
8. **No Storage persistence, no history list.** Unlike `audit_logs`,
   `reports`, and `question_revisions`, Feature 1's schema reserved no
   table for this feature - the export streams directly to the browser
   as a download, with nothing server-side to list or re-download later.
9. **Restore/import is Feature 35b's job**, per the approved split -
   this feature only produces the export.

## In scope

- **`server/api/admin/events/[id]/export.get.ts` (new).**
  `verifyEventAccess`-gated. Queries (service-role, `select('*')` on
  each): the `events` row; `event_settings` row; `attendee_types`,
  `topics`, `attendees`, `questions`, `replies`, `votes`, and `reports`
  rows for this event (all non-deleted and soft-deleted rows alike, per
  the resolved note above). Returns `{ exportVersion: 1, exportedAt,
  event, eventSettings, attendeeTypes, topics, attendees, questions,
  replies, votes, reports }` as the response `data`.
- **`app/pages/admin/events/[id].vue` (edit).** New `'backup'` tab: a
  "Download backup" button that fetches the export route (same
  Bearer-token pattern as every other admin-authenticated route on this
  page), converts the returned JSON to a `data:application/json` URL,
  and calls the existing `downloadDataUrl` helper with a filename like
  `<slug>-backup-<date>.json`.

## Out of scope

- **Restore/import** - Feature 35b's job entirely; nothing here can read
  this format back in.
- **Attachments (rows or files), content reports, question revisions,
  moderator sessions, or audit logs** - none named by this build-plan
  line, per the resolved note above.
- **Embedding report file bytes** - metadata only, per the resolved note
  above.
- **Persisting the export anywhere, or a history list of past exports**
  - no schema exists for it and none is added; the export is a direct,
  one-time download.
- **Logging this action to the audit log** - not one of Feature 32's
  named "major action" categories, per the resolved note above.
- **Redacting or hashing attendee tokens, moderator password hashes, or
  any other field for this export** - per the resolved note above, this
  is a full-fidelity backup for an actor who already has unrestricted
  access to all of it.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Export route** - `server/api/admin/events/[id]/export.get.ts`
      per the contract above.
      **Done when:** code builds; a missing/invalid bearer token returns
      401 "Not authorized." (confirmed by code review, since exercising a
      real Supabase project is outside this skill); the response includes
      all nine named collections plus `exportVersion` and `exportedAt`.
- [x] 2. **Backup tab** - the `activeTab`/download addition in
      `/admin/events/[id].vue` per the contract above.
      **Done when:** code builds; clicking "Download backup" fetches the
      route and triggers a `.json` file download via the existing
      `downloadDataUrl` helper.

## Files / areas

- `server/api/admin/events/[id]/export.get.ts` (new)
- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

- **Response shape:** `{ success, data: { exportVersion: 1, exportedAt,
  event, eventSettings, attendeeTypes: [], topics: [], attendees: [],
  questions: [], replies: [], votes: [], reports: [] }, error }` -
  `exportVersion` exists specifically so a future restore feature can
  detect and reject an incompatible or unrecognized format.
- **Every collection is a raw `select('*')` row array** (or single row
  for `event`/`eventSettings`) - no column redaction, no renaming, no
  camelCase conversion; the exported shape mirrors the database schema
  directly, which is also the simplest possible contract for a future
  importer to map back onto the same tables.
- **Authorization:** `verifyEventAccess(event, eventId)`, identical to
  every other admin/Event-Manager-scoped route in this project.
- **No new migration, no new table, no new RLS policy, no new Storage
  bucket.**

## Testing

No test runner configured; `npm run build` is the automated check for
both steps. **Not yet exercised live:** a real export actually producing
a complete, valid JSON file from real data and the browser download
triggering correctly - both require a dev server and a real Supabase
project, the same caveat recorded for every prior feature that could not
start a server from this skill.

`npm run build` was run after both steps and passed cleanly (only
pre-existing, unrelated dependency deprecation warnings appeared); the
new `export.get.mjs` route registered correctly in the build output.

**One correction made during implementation, before the check passed:**
the `replies` query in the first draft used the embedded-join filter
shape (`questions!inner(event_id)`) carried over from 28a's original
precedent, but 28b had already added `replies.event_id` directly (for
Realtime filtering) - simplified to a plain `.eq('event_id', eventId)`
once that was confirmed, avoiding an unnecessary join for a column that
already exists.

## Notes for the AI

- Do not hand-pick columns for any of the nine collections - `select('*')`
  is the deliberate, disclosed choice for this feature specifically, per
  the resolved note above.
- Do not include attachments, content reports, question revisions,
  moderator sessions, or audit logs.
- Do not embed report file bytes - metadata rows only.
- Do not filter out soft-deleted rows.
- Do not call `logAuditAction` - this action is not in Feature 32's
  named category list.
- Do not persist the export to Storage or add a `reports`-style history
  table - this feature streams a direct download only.
- Do not build any part of restore/import - Feature 35b's job.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
