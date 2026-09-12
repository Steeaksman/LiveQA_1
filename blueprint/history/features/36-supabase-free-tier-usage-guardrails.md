## Feature 36: Supabase free-tier usage guardrails

**Branch:** `feature/supabase-free-tier-usage-guardrails`
**Status:** verified

## Goal

Give an Administrator one global page showing how close this project is
to Supabase's Free plan limits - active participant count (a Realtime
connection proxy), database size, and Storage usage - each with a
Normal / Approaching Capacity / Consider Upgrading status against
admin-configurable thresholds, never shown to attendees.

**Resolved before writing this spec (each point below is inferred from
repository evidence or verified current documentation, not invented from
nothing):**

1. **Verified current Supabase Free plan limits** (fetched from
   supabase.com/pricing while writing this spec, per this project's
   Supabase-skill instruction to check current docs rather than rely on
   training data, since Supabase's limits change): 500 MB database size,
   1 GB file storage, 200 concurrent peak Realtime connections. Default
   thresholds below are set at 70%/90% of these verified numbers -
   disclosed as sensible starting points the admin can adjust, not
   asserted as permanently fixed values (Supabase can change its plan
   limits at any time).
2. **This is a global, cross-event page, not a per-event one.** Feature
   31's live dashboard already shows one event's own active
   attendee/moderator counts; this feature is fundamentally different -
   whole-project resource consumption against Supabase's account-wide
   Free plan caps, which are not scoped to any single event.
3. **"Realtime connection estimate" and "active count" are the same
   proxy signal, not two separately obtained metrics.** This app's only
   Realtime usage is attendee/moderator Presence-tracking connections
   (Features 25, 26), so a count of currently-active participants
   already approximates concurrent Realtime connections; there is no
   Supabase Management API credential configured anywhere in this
   project (only the public URL, anon key, and service-role key), so a
   true infrastructure-level connection count is not obtainable at all -
   this reading satisfies the plan's own "when obtainable" hedge on
   these metrics.
4. **The active-count proxy is a database count, not a live Presence
   aggregation.** Reading Presence requires an actual open Realtime
   subscription per channel; aggregating it across every currently-live
   event from a stateless server route would mean opening one new
   Realtime connection per live event on every page load - working
   against the very guardrail this feature exists to report on. Instead:
   count of non-deleted `attendees` rows belonging to currently-`live`
   events - an already-obtainable, single SQL count with no new Realtime
   connections of its own.
5. **Database size is obtained via a new, narrowly-scoped SQL function**
   (`public.get_database_size_bytes()`, wrapping Postgres's own
   `pg_database_size(current_database())`), because PostgREST only
   exposes functions that exist in an exposed schema - the built-in
   function itself isn't callable via `.rpc()` directly. `EXECUTE` is
   revoked from `anon`/`authenticated` (only the service-role connection
   this route already uses can call it), matching this project's general
   care around what any non-service-role connection can reach.
6. **Storage usage is approximated from this app's own `attachments.size_bytes`
   column**, summed across every non-deleted attachment for every event -
   not a call to Supabase's Storage usage API (no such simple endpoint
   exists via the credentials this project has), and not counting
   branding logos/sponsor logos or generated reports (Features 11b, 34a),
   which have no tracked byte size in this schema. This is a disclosed
   under-estimate of true Storage usage, not a precise figure.
7. **Thresholds are stored in one new global settings table, not
   per-event `event_settings` or a hardcoded constant.** The build-plan
   line explicitly says "configurable" - this project's established
   pattern for configurable behavior is an admin-editable stored setting,
   not a developer-only code constant; a single global row is the
   simplest fit since these limits are account-wide, not per-event (no
   existing global settings table exists to reuse - Feature 1 reserved
   one for `audit_logs`/`reports`/`question_revisions`/`blocked_terms`'s
   later-shipped features, but none for this one).
8. **Administrator-only, matching every other global admin page this
   project has built** (`event-managers.vue`, `blocked-terms.vue`,
   `audit-log.vue`) - Event Managers, even global-scope ones, have never
   been given access to a cross-event administrative surface.
9. **This is not logged to Feature 32's audit log.** Its named "major
   actions" list does not include usage-threshold configuration; this
   follows the identical, already-established reasoning Feature 35a used
   for data export.

## In scope

- **New migration:** `public.usage_guardrail_thresholds` table - one
  seeded row, columns `active_count_warning_threshold integer not null
  default 140`, `active_count_critical_threshold integer not null
  default 180` (70%/90% of 200), `db_size_warning_bytes bigint not null
  default 367001600`, `db_size_critical_bytes bigint not null default
  471859200` (70%/90% of 500 MB), `storage_warning_bytes bigint not null
  default 751619277`, `storage_critical_bytes bigint not null default
  966367642` (70%/90% of 1 GB), plus `created_at`/`updated_at` with the
  existing `set_updated_at` trigger. RLS enabled, `select`/`update`
  policies gated by `public.is_administrator(auth.uid())` alone,
  mirroring `event_templates`/`blocked_terms`'s exact shape - no insert
  policy, since exactly one row ever exists (seeded by the migration
  itself, never created by the app). Also creates `public
  .get_database_size_bytes() returns bigint language sql stable as
  $$ select pg_database_size(current_database()) $$;` with `revoke
  execute on function public.get_database_size_bytes() from public;`
  (service role bypasses this, matching every other Postgres-permission
  pattern already in this schema).
- **`server/api/admin/usage.get.ts` (new).** `verifyAdministrator`-gated.
  Computes: `activeCount` (count of non-deleted `attendees` whose
  `event_id` is in the set of currently-`live`, non-deleted `events`);
  `dbSizeBytes` (`supabase.rpc('get_database_size_bytes')`);
  `storageBytes` (sum of non-deleted `attachments.size_bytes` across all
  events); reads the single `usage_guardrail_thresholds` row. Computes a
  `'normal' | 'approaching_capacity' | 'consider_upgrading'` status per
  metric (`>= critical` -> `consider_upgrading`, else `>= warning` ->
  `approaching_capacity`, else `normal`). Returns `{ activeCount,
  dbSizeBytes, storageBytes, thresholds: {...}, statuses: { activeCount,
  dbSize, storage } }`.
- **`server/api/admin/usage-settings.post.ts` (new).**
  `verifyAdministrator`-gated. Body: the six threshold fields. Validates
  each is a non-negative integer and that each pair's warning value is
  strictly less than its critical value (else 400 with a specific
  message). Updates the single existing row.
- **`app/pages/admin/usage.vue` (new).**
  `definePageMeta({ middleware: ['admin', 'administrator-only'] })`
  (matching `event-managers.vue`/`blocked-terms.vue`/`audit-log.vue`).
  On mount, fetches the usage route; renders each of the three metrics
  with its raw value, the known Supabase Free plan cap it's measured
  against (from the resolved note above, as descriptive text - not
  re-fetched live), and a colored status label. A form below with the
  six threshold number inputs and a "Save" button posting to the
  settings route.
- **`app/pages/admin/index.vue` (edit).** One new
  `<NuxtLink to="/admin/usage">Usage & Guardrails</NuxtLink>` inside the
  existing `profile?.role === 'administrator'` block.

## Out of scope

- **A true Supabase Management API integration** - no such credential is
  configured anywhere in this project, and adding one is a stack-level
  decision this build-plan line does not ask for; per the resolved note
  above, this feature uses only already-available, already-obtainable
  signals.
- **Counting branding logo, sponsor logo, or generated-report bytes
  toward the storage estimate** - none of those have a tracked size
  column anywhere in this schema; per the resolved note above, this is a
  disclosed under-estimate, not a gap this feature closes.
- **A live Presence-based aggregation across every event** - per the
  resolved note above; the active-count proxy is a plain database count.
- **Any attendee-facing exposure of any of these numbers** - this is an
  Administrator-only page; nothing here is reachable from `/e/<slug>` or
  `/m/<slug>`.
- **Event Manager access to this page** - Administrator-only, matching
  every other global admin page.
- **Logging threshold changes to the audit log** - not one of Feature
  32's named categories, per the resolved note above.
- **Automatically pausing submissions/voting, or any enforcement action**
  when a threshold is crossed - this feature only displays status; it
  never changes any event's behavior.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Migration: thresholds table & database-size function** per the
      contract above.
      **Done when:** the migration file exists, seeding exactly one
      thresholds row and creating the revoked-from-public function;
      applying it (outside this skill) is required before later steps
      can be verified live.
- [x] 2. **Usage metrics route** - `server/api/admin/usage.get.ts` per
      the contract above.
      **Done when:** code builds; a missing/invalid bearer token or a
      non-administrator caller returns 401 "Not authorized."; the
      response includes all three metrics, the threshold row, and a
      status per metric (confirmed by code review, since exercising a
      real Supabase project is outside this skill).
- [x] 3. **Usage settings route** -
      `server/api/admin/usage-settings.post.ts` per the contract above.
      **Done when:** code builds; a negative value or a warning >=
      critical pair is rejected with a specific message and no update;
      a valid submission updates the single existing row.
- [x] 4. **Usage page & nav link** - `app/pages/admin/usage.vue` (new)
      and the `admin/index.vue` link, per the contract above.
      **Done when:** code builds; the page renders all three metrics
      with their status labels and Free-plan context text, and the
      threshold form's Save button calls the settings route.

## Files / areas

- `supabase/migrations/<timestamp>_add_usage_guardrail_thresholds.sql` (new)
- `server/api/admin/usage.get.ts` (new)
- `server/api/admin/usage-settings.post.ts` (new)
- `app/pages/admin/usage.vue` (new)
- `app/pages/admin/index.vue` (edit)

## Data / contracts

- **`usage_guardrail_thresholds`** - one seeded row, six threshold
  columns (see contract above), RLS-gated to Administrators only, no
  insert policy (exactly one row, ever).
- **`get_database_size_bytes()`** - a `stable` SQL function wrapping
  `pg_database_size(current_database())`, `EXECUTE` revoked from
  `anon`/`authenticated` - callable only via the service-role connection
  this feature's own route already uses.
- **Status computation:** `value >= critical -> 'consider_upgrading'`,
  else `value >= warning -> 'approaching_capacity'`, else `'normal'` -
  the same three-tier language the build-plan line names, applied
  identically to all three metrics.
- **Response envelope:** `{ success, data, error }` throughout,
  matching every other server route in this project.
- **Authorization:** `verifyAdministrator(event)` on both new routes,
  identical to `event-managers.post.ts`'s existing precedent.

## Testing

No test runner configured; `npm run build` is the automated check for
all four steps. **Not yet exercised live:** the database-size function
actually returning a real byte count, the storage sum matching real
attachment data, and the threshold save/reload round trip - all require
a dev server and a real Supabase project, the same caveat recorded for
every prior feature that could not start a server from this skill.

## Notes for the AI

- Do not attempt to call any Supabase Management API - no credential for
  it exists in this project's configuration.
- Do not aggregate live Presence state across events for the active
  count - use the database-count proxy, per the resolved note above.
- Do not include branding logos, sponsor logos, or report files in the
  storage estimate - only `attachments.size_bytes`.
- Do not grant `EXECUTE` on `get_database_size_bytes()` to `anon` or
  `authenticated` - service-role-only, per the resolved note above.
- Do not add an insert policy or an admin "create" action for
  `usage_guardrail_thresholds` - exactly one row exists, seeded by the
  migration.
- Do not call `logAuditAction` from either new route - this action is
  not in Feature 32's named category list.
- Do not expose this page or its data to Event Managers or any
  attendee/moderator-facing surface.
