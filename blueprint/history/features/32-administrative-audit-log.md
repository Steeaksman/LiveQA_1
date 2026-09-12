## Feature 32: Administrative audit log

**Branch:** `feature/administrative-audit-log`
**Status:** verified

## Goal

Let an Administrator see a log of major admin/Event Manager actions - the
first feature to actually write to the `audit_logs` table Feature 1's
schema already created (RLS-enabled, Administrator-read-only, no client
write policy for any role, and never once written to since).

**Resolved before writing this spec (scope approved separately; each
point below is inferred from repository evidence, not invented from
nothing):**

1. **This feature covers only actions that already flow through a server
   route.** `project-plan.md`'s own "major actions" list names event CRUD,
   settings changes, moderator password rotation, admin question edits,
   permanent deletion, duplication, report generation, retention purge,
   and Event Manager permission changes. An audit log must reflect a
   verified server-side action - `audit_logs` deliberately has no
   client-write RLS policy (Feature 1's own migration comment: "writes
   only ever come from server routes using the service-role key"). Of
   the named categories, only **moderator password rotation**
   (`moderator-password.post.ts`), **branding logo upload/remove**
   (`branding-logo.post.ts`/`branding-logo.delete.ts`), and **Event
   Manager creation** (`event-managers.post.ts`) already go through a
   server route today. Event details/settings/branding-color saves,
   event duplication, and the rest of Event Manager permission changes
   (scope changes, revocation, assignments) are direct client-side
   Supabase calls gated by RLS - converting each to a server route first
   is real, separate infrastructure work, split out to a new build-plan
   item (43) rather than pulled into this feature.
2. **Admin question edits, permanent deletion, report generation, and
   retention purge have no producing feature yet** (Features 33, 34, and
   an unplanned retention mechanism - `build-plan.md`'s own note on
   Feature 4 says retention is "not yet decided anywhere in the plans").
   Nothing here invents logging for actions that don't exist.
3. **Logging is best-effort and never blocks the action it describes.**
   If the audit-log insert itself fails, the underlying administrative
   action (already committed) must still succeed and return its normal
   response - the log is a side effect, not a precondition.
4. **The viewer page needs no new server route either.** `audit_logs_select`
   already grants Administrators direct read access via RLS; the new
   page reads it the same way `event-managers.vue`/`blocked-terms.vue`
   read their own tables, embedding `profiles(email)` and `events(name)`
   exactly as `event-managers.vue` already embeds `events(name)` on
   `event_manager_assignments`.

## In scope

- **`server/utils/log-audit-action.ts` (new).** One export:
  `logAuditAction(actorId: string, action: string, eventId: string | null,
  details?: Record<string, unknown>): Promise<void>` - inserts `{
  actor_id: actorId, event_id: eventId, action, details: details ?? null
  }` into `audit_logs` via the service-role client. Catches and swallows
  any insert error (logged nowhere further; this project has no logging
  infrastructure beyond the table itself) - never throws, per the
  resolved note above.
- **Wire `logAuditAction` into the four existing routes that already
  perform a loggable action**, called after each action's own database
  write succeeds and before its response returns:
  - `server/api/admin/events/[id]/moderator-password.post.ts` -
    `'moderator_password_rotated'`, this event's id, `{}`.
  - `server/api/admin/events/[id]/branding-logo.post.ts` -
    `'branding_logo_uploaded'`, this event's id, `{ slot }`.
  - `server/api/admin/events/[id]/branding-logo.delete.ts` -
    `'branding_logo_removed'`, this event's id, `{ slot }` - only on the
    branch that actually removed an existing logo, not the already-unset
    no-op success path.
  - `server/api/admin/event-managers.post.ts` -
    `'event_manager_created'`, `null` (not event-scoped), `{
    eventManagerId: created.user.id, email, scope }`.
- **`app/pages/admin/audit-log.vue` (new).** Administrator-only
  (`definePageMeta({ middleware: ['admin', 'administrator-only'] })`,
  matching `event-managers.vue`/`blocked-terms.vue`). On mount, direct
  client `supabase.from('audit_logs').select('id, action, details,
  created_at, actor:profiles(email), event:events(name)').order
  ('created_at', { ascending: false }).limit(200)`. Renders one row per
  entry: actor email, a human-readable label for `action` (a small fixed
  map, e.g. `moderator_password_rotated` -> "Moderator password
  rotated"), the event name or "—" when `event_id` is null, a compact
  rendering of `details`, and the timestamp. "No audit log entries yet."
  when empty.
- **`app/pages/admin/index.vue` (edit).** One new
  `<NuxtLink to="/admin/audit-log">Audit Log</NuxtLink>` inside the
  existing `profile?.role === 'administrator'` block.

## Out of scope

- **Logging event details/settings/branding-color saves, event
  duplication, or Event Manager scope/revocation/assignment changes** -
  all direct client-side writes today; converting them to server routes
  is Feature 43's job, per the resolved note above.
- **Logging admin question edits, permanent deletion, report generation,
  or retention purge** - none of these have a producing feature yet
  (33, 34, and an unplanned retention mechanism).
- **Any new RLS policy** - `audit_logs_select` (Feature 1) already grants
  Administrator read access; no Event Manager or attendee/moderator
  policy exists or is implied, and this feature adds none.
- **Pagination, filtering, or search on the audit log viewer** - a fixed
  200-row cap, newest first, matching this project's preference for
  simple first passes on new admin list surfaces (`blocked-terms.vue`,
  `event-managers.vue`).
- **Any change to what each of the four wired actions actually does** -
  this feature only adds a side-effect log call after each action's
  existing behavior, never altering it.
- **Retrying or queueing a failed audit-log write** - a best-effort,
  fire-and-forget insert per the resolved note above; a failure is simply
  a missing log entry, never a blocked action.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Audit-log helper** - `server/utils/log-audit-action.ts` per the
      contract above.
      **Done when:** code builds; a simulated insert failure (confirmed
      by code review, since exercising a real Supabase project is
      outside this skill) does not throw or propagate to the caller.
- [x] 2. **Wire logging into the four existing routes** -
      `moderator-password.post.ts`, `branding-logo.post.ts`,
      `branding-logo.delete.ts`, `event-managers.post.ts` per the
      contract above.
      **Done when:** code builds; each route calls `logAuditAction` only
      after its own write already succeeded, with the exact action name
      and details shape specified above; `branding-logo.delete.ts`'s
      already-unset no-op path does not log anything.
- [x] 3. **Audit log viewer & nav link** - `app/pages/admin/audit-log.vue`
      (new) and the `admin/index.vue` link, per the contract above.
      **Done when:** code builds; the page renders the actor, action
      label, event name (or "—"), details, and timestamp for each row,
      newest first, and "No audit log entries yet." when empty (confirmed
      by a read-only query once at least one of the four wired actions
      has run against a real Supabase project - outside this skill).

## Files / areas

- `server/utils/log-audit-action.ts` (new)
- `server/api/admin/events/[id]/moderator-password.post.ts` (edit)
- `server/api/admin/events/[id]/branding-logo.post.ts` (edit)
- `server/api/admin/events/[id]/branding-logo.delete.ts` (edit)
- `server/api/admin/event-managers.post.ts` (edit)
- `app/pages/admin/audit-log.vue` (new)
- `app/pages/admin/index.vue` (edit)

## Data / contracts

- **No new migration, no new column, no new RLS policy** - `audit_logs`
  and its Administrator-only select policy already exist from Feature 1.
- **`action` values are a fixed, growing set of string constants**, not a
  Postgres enum - `audit_logs.action` is plain `text` (Feature 1's
  schema), so no migration is needed to add a new action name later, the
  same reasoning that keeps a Feature 30-style tier a Postgres enum but a
  free-form action taxonomy a plain string.
- **`details` is whatever JSON-serializable object each call site passes**,
  stored as-is in the existing `jsonb` column; never a client-supplied
  value - always constructed server-side from data the route already
  trusts (e.g., the `slot` value the upload route already validated).
- **`event_id` is `null` for actions with no single event** (Event
  Manager creation), matching the column's existing nullable FK.
- **Response shape is unchanged for all four wired routes** - logging is
  additive and never alters an existing success/error response.

## Testing

No test runner configured; `npm run build` is the automated check for all
three steps. **Not yet exercised live:** a real action actually producing
a row, the viewer page rendering it with the joined actor email and event
name, and a simulated insert failure not blocking the underlying action -
all require a dev server and a real Supabase project, the same caveat
recorded for every prior feature that could not start a server from this
skill.

`npm run build` was run after all three steps and passed cleanly (only
pre-existing, unrelated dependency deprecation and plugin-timing warnings
appeared); the new `audit-log.vue` page compiled correctly in the build
output.

## Notes for the AI

- Do not convert any direct-client admin/Event Manager mutation to a
  server route to log it - that is Feature 43's job, not this one's.
- Do not log admin question edits, permanent deletion, report
  generation, or retention purge - none of those have a producing
  feature yet.
- Do not let a `logAuditAction` failure throw or affect the calling
  route's response - catch and swallow, per the resolved note above.
- Do not add a new RLS policy for `audit_logs` - the existing
  Administrator-only select policy is sufficient for this feature's
  viewer page.
- Do not build pagination, filtering, or search into the viewer - a
  fixed 200-row cap is this feature's entire scope for the list.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
