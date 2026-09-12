## Feature 35b: Event data restore/import

**Branch:** `feature/event-data-restore-import`
**Status:** verified

## Goal

Let an Administrator restore a 35a export back into the system as a brand
new event, completing the "restorable format" half of Feature 35's
build-plan line.

**Resolved before writing this spec (split already approved separately;
each point below is inferred from repository evidence, not invented from
nothing):**

1. **Restore always creates a new event; it never overwrites an existing
   one.** No plan document defines overwrite semantics (which event would
   it target? what happens to data created since the backup?), and this
   project's consistent posture is safe-by-default (soft delete
   everywhere, confirmed permanent delete, best-effort side effects that
   never block the primary action). Always-additive restore is strictly
   safer, needs no destructive-action confirmation UX, and does not
   preclude a future "overwrite" mode being added separately later.
2. **Administrator-only, not Event Manager.** `events_insert`'s existing
   RLS policy (Feature 1) already restricts event creation to
   `is_administrator(auth.uid())` alone - Event Managers, even
   global-scope ones, cannot create events today. Restore creates a new
   event, so it follows the identical boundary, checked with
   `verifyAdministrator` (the same helper `event-managers.post.ts`
   already uses), not `verifyEventAccess`.
3. **Every id-bearing row gets a fresh id, and every foreign key is
   remapped to match.** The export carries the original database's exact
   ids; a restore that reused them into the *same* project would collide
   with the still-existing source event's rows the moment that event
   hasn't been permanently deleted, and `attendees.token` has a *global*
   unique index (not scoped per event) - so even the ids that wouldn't
   collide outright still can't safely reuse attendee tokens. This
   feature builds one old-id -> new-id map per entity type (events,
   attendee_types, topics, attendees, questions, replies, votes) and
   rewrites every reference accordingly.
4. **Attendee tokens are always regenerated, never reused from the
   export.** Beyond the uniqueness constraint in note 3, a restored
   attendee row is a historical recreation, not the same device
   continuing a live session - reusing the original token would let
   whoever still holds that old opaque value authenticate as a
   "different" (restored) attendee they have no relationship to.
5. **A restored event always starts in `draft` status with submissions
   and voting closed**, regardless of the exported event's state at
   export time - an admin should deliberately review and republish
   restored content, not have it silently reappear live.
6. **`reports` rows are not restored.** 35a's own export explicitly
   carries only report *metadata*, never the underlying file bytes
   (Storage was never involved) - recreating `reports` rows that point at
   Storage objects which were never exported (and likely don't exist any
   more) would only produce dead references with no way to ever resolve
   them.
7. **Failure anywhere in the sequence deletes the newly-created event and
   rolls everything back**, relying on the schema's own existing
   `event_id ... on delete cascade` rules on every dependent table - the
   same "delete the parent, let cascades clean up the rest" mechanism
   Feature 33b's permanent-delete route already established, applied
   here as a rollback instead of a user-facing delete.
8. **Validation is shape-level, not exhaustive per-column.** The only
   realistic input to this route is 35a's own export (`exportVersion`
   checked, and each of the eight expected keys checked for the right
   JS type - object or array); this feature does not hand-validate every
   column of every one of eight tables against a schema, which would be
   large, low-value work for a tool whose one intended input already has
   a known shape.
9. **This is logged to Feature 32's audit log as an "event CRUD"-shaped
   action**, unlike Feature 32/43's deferred *existing* event-creation
   path (which is blocked specifically because that flow is still a
   direct client write with no server route to hook a log into). This
   feature *is* a brand-new server route being built now, so that
   blocker does not apply here - `logAuditAction('event_restored_from_backup',
   newEventId, { sourceEventName })` runs on success.
10. **Slug and join code reuse the exact existing generators**
    (`slugify`, `generateJoinCode` from `app/utils/generate-event-identifiers.ts`),
    imported directly into this server route the same way
    `server/api/join.post.ts` already imports from `app/utils/` -
    an established, existing cross-boundary precedent, not a new one.

## In scope

- **`server/utils/restore-event-from-backup.ts` (new).**
  `restoreEventFromBackup(backup: unknown): Promise<{ ok: true, eventId:
  string, slug: string } | { ok: false, error: string }>`. Validates
  `backup.exportVersion === 1` and that `event`, `eventSettings` are
  objects and `attendeeTypes`, `topics`, `attendees`, `questions`,
  `replies`, `votes` are arrays (else `{ ok: false, error: 'Invalid
  backup file.' }`). Then, using the service-role client: inserts a new
  `events` row (`slugify(backup.event.name)`, `generateJoinCode()`,
  `status: 'draft'`, `submissions_open: false`, `voting_open: false`,
  `moderator_access_enabled: false`, `name` copied from the export,
  `created_by` set to the restoring administrator's id); inserts
  `event_settings` for the new event id, copying every other field from
  the export as-is (including `moderator_password_hash`); inserts
  `attendee_types`, then `topics` (both with fresh ids, `event_id`
  remapped, building their own old->new maps); inserts `attendees` with
  fresh ids, `event_id` remapped, `attendee_type_id` remapped through the
  attendee-types map, and a fresh `crypto.randomUUID()` token per row
  (building an attendee old->new map); inserts `questions` with fresh
  ids, `event_id`/`topic_id`/`attendee_id` remapped (building a question
  old->new map); inserts `replies` with fresh ids,
  `event_id`/`question_id`/`attendee_id` remapped; inserts `votes` with
  fresh ids, `event_id`/`question_id`/`attendee_id` remapped. On any
  insert failure, deletes the new `events` row (cascading cleanup per the
  resolved note above) and returns `{ ok: false, error: 'Something went
  wrong. Please try again.' }`. On success, returns `{ ok: true, eventId,
  slug }`.
- **`server/api/admin/events/restore.post.ts` (new).**
  `verifyAdministrator`-gated. Body `{ backup: unknown }`. Calls
  `restoreEventFromBackup`; on failure, returns 400 with its error; on
  success, calls `logAuditAction(administratorId,
  'event_restored_from_backup', eventId, { sourceEventName:
  backup.event?.name })` and returns `{ eventId, slug }`.
- **`app/pages/admin/events/restore.vue` (new).**
  `definePageMeta({ middleware: ['admin', 'administrator-only'] })`
  (matching `event-managers.vue`/`blocked-terms.vue`). A file input
  (`accept="application/json"`) that reads the selected file's text
  client-side, `JSON.parse`s it, and a "Restore" button that posts
  `{ backup: <parsed> }` to the new route (same Bearer-token pattern as
  every other admin-authenticated action) and, on success, navigates to
  `/admin/events/<eventId>`; a parse failure or route error shows a
  generic inline message.
- **`app/pages/admin/index.vue` (edit).** One new
  `<NuxtLink to="/admin/events/restore">Restore from Backup</NuxtLink>`
  inside the existing `profile?.role === 'administrator'` block.

## Out of scope

- **Overwriting an existing event, or any "merge" semantics** - per the
  resolved note above, restore is always additive.
- **Restoring `reports` rows** - per the resolved note above.
- **Preserving attendee tokens, or the original event's status/
  submissions/voting state** - both deliberately reset, per the resolved
  notes above.
- **Exhaustive per-column validation of the uploaded file** - shape-level
  checks only, per the resolved note above.
- **Any change to 35a's export route or format** - this feature only
  consumes that existing, unchanged shape.
- **A history list of past restores** - no schema exists for it; the
  audit log entry is the only record kept.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Restore utility** -
      `server/utils/restore-event-from-backup.ts` per the contract above.
      **Done when:** code builds; an `exportVersion` other than `1`, or a
      missing/wrong-typed top-level field, returns `{ ok: false, error:
      'Invalid backup file.' }` without any insert; a simulated
      mid-sequence insert failure (confirmed by code review, since
      exercising a real Supabase project is outside this skill) deletes
      the new event row before returning failure.
- [x] 2. **Restore route** - `server/api/admin/events/restore.post.ts`
      per the contract above.
      **Done when:** code builds; a missing/invalid bearer token or a
      non-administrator caller returns 401 "Not authorized."; a
      successful restore calls `logAuditAction` with
      `'event_restored_from_backup'` and returns the new event's id and
      slug.
- [x] 3. **Restore page** - `app/pages/admin/events/restore.vue` per the
      contract above.
      **Done when:** code builds; selecting a valid export file and
      clicking Restore calls the route and navigates to the new event's
      admin page on success; an invalid JSON file or a route error shows
      an inline message instead.
- [x] 4. **Nav link** - the `admin/index.vue` addition per the contract
      above.
      **Done when:** code builds; "Restore from Backup" appears for an
      Administrator and links to the new page.

## Files / areas

- `server/utils/restore-event-from-backup.ts` (new)
- `server/api/admin/events/restore.post.ts` (new)
- `app/pages/admin/events/restore.vue` (new)
- `app/pages/admin/index.vue` (edit)

## Data / contracts

- **Input contract is 35a's exact export shape** - `{ exportVersion,
  event, eventSettings, attendeeTypes, topics, attendees, questions,
  replies, votes, reports }`; `reports` is accepted but ignored.
- **Every restored row gets a freshly generated id** - never a reused id
  from the export - with every foreign key across all seven remapped
  entity types rewritten to match, per the resolved note above.
- **A restored event is always `draft`, closed for submissions/voting**,
  with a freshly generated slug and join code - never the exported
  values.
- **Attendee tokens are always freshly generated** (`crypto.randomUUID()`)
  - never carried over from the export.
- **Rollback on any failure is a single `DELETE` on the new `events` row**,
  relying entirely on existing `on delete cascade` rules - no manual
  multi-table cleanup code.
- **Authorization:** `verifyAdministrator(event)` - Administrator only,
  matching `events_insert`'s existing RLS boundary and
  `event-managers.post.ts`'s identical precedent.
- **Audit log integration:** `'event_restored_from_backup'` with `{
  sourceEventName }` as `details`, on the new event's id.
- **Response envelope:** `{ success, data, error }` throughout; the
  restore route returns `{ eventId, slug }` on success.
- **Child-row timestamps are preserved from the export via object
  spread** (`created_at`/`updated_at`/`deleted_at` on
  `attendee_types`/`topics`/`attendees`/`questions`/`replies`/`votes`,
  including soft-deleted rows) - a corollary of "spread the row and only
  override remapped fields" that was not called out as its own point in
  the original resolved notes but follows directly from them and matches
  35a's own "faithful snapshot" framing; only the new `events` row itself
  deliberately discards every original field except `name`.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** a real round trip (export an
event with 35a, then restore it with this feature) actually reproducing
a working new event with correct data and remapped references, and a
simulated mid-restore failure actually cleaning up via cascade - all
require a dev server and a real Supabase project, the same caveat
recorded for every prior feature that could not start a server from this
skill.

`npm run build` was run after all four steps and passed cleanly (only
pre-existing, unrelated dependency deprecation warnings appeared); both
the new route and the new page compiled into separate build chunks.
Given this feature's meaningfully higher risk profile (a new-event-
creating route with cross-table id remapping), one additional read-only
self-review pass of the full `restore-event-from-backup.ts` diff was done
before marking the spec verified, beyond the standard build check - no
issues were found.

## Notes for the AI

- Do not reuse any id, token, slug, or join code from the export - every
  one is freshly generated, per the resolved notes above.
- Do not restore `reports` rows.
- Do not set the restored event to `live`, or open its submissions/
  voting - always `draft` and closed.
- Do not use `verifyEventAccess` for this route - there is no target
  event yet; use `verifyAdministrator`, matching `events_insert`'s RLS
  boundary.
- Do not hand-validate every column of every table - shape-level checks
  only, per the resolved note above.
- Do not write manual cleanup queries for each dependent table on
  failure - deleting the new `events` row is sufficient; the schema's
  own cascades do the rest.
- Reuse `slugify`/`generateJoinCode` from
  `app/utils/generate-event-identifiers.ts` exactly as
  `server/api/join.post.ts` already imports them; do not duplicate that
  logic into a new server-side copy.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
