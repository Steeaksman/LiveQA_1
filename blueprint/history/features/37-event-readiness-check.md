## Feature 37: Event Readiness Check

**Branch:** `feature/event-readiness-check`
**Status:** verified

## Goal

Give an Administrator or Event Manager a one-click, per-event diagnostic that
checks everything that would otherwise only be discovered by an attendee
hitting a dead end minutes before an event starts: can the app's own backend
subsystems be reached, will the QR codes and join code actually resolve, will
moderator login actually work, and what state are the event's own
submission/voting toggles in right now.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **This is a per-event tool, not a global admin page.** A readiness check is
   inherently about one specific upcoming event - it lives as a new tab on
   the existing per-event admin page (`app/pages/admin/events/[id].vue`,
   alongside `Dashboard`/`Questions`/`Reports`/etc.), authorized with
   `verifyEventAccess` (Administrator, or the assigned/global Event Manager),
   matching Feature 31's live-dashboard tab precedent - not `verifyAdministrator`
   (which Feature 36 correctly used instead, since usage guardrails are
   genuinely project-wide).
2. **"App reachability" has no dedicated field in the response.** The
   diagnostic call is itself a live round trip through the running app; a
   `app: ok` field would be tautological, since it can only ever be true by
   the time any response arrives. A real app outage instead surfaces as the
   page's own fetch failing outright, which the client already renders as a
   distinct "Could not reach the app" state (mirroring every other route's
   existing try/catch pattern in this project).
3. **"Supabase" and "DB" reachability are two distinct, separately-obtained
   signals**, not the same probe stated twice: `supabase.auth.admin.listUsers({
   perPage: 1 })` proves the Auth subsystem is reachable (using the
   service-role client this project already creates server-side), while a
   plain `select id from events where id = :eventId` proves Postgres/PostgREST
   is reachable - genuinely independent failure domains (Auth can be down
   while the database is fine, or vice versa).
4. **Storage reachability checks all three Storage buckets this project has
   actually created** (`event-branding`, `question-attachments`,
   `event-reports` - confirmed by grepping every `BUCKET` constant in
   `server/api/`), each with a cheap `.storage.from(bucket).list('', { limit:
   1 })` call, reported both as one aggregate status and a per-bucket
   breakdown so a failure names which bucket is unreachable.
5. **Realtime reachability is tested client-side (in the admin's browser), not
   from the Nitro server.** No server route in this project has ever opened a
   Realtime WebSocket connection - every existing Realtime usage
   (Presence, live sync) is a browser-side `useSupabase()` client, and that is
   the exact code path attendees/moderators/admins actually depend on.
   Opening an unproven server-side WebSocket connection here would add a new,
   untested runtime dependency to a feature about production readiness -
   counter to the point of the feature. This is also unlike Feature 36's own
   reasoning against server-side Realtime connections: that dashboard would
   have opened one connection per live event on every page load, while this
   is one bounded, user-triggered probe for one event, run rarely - a
   materially different cost profile.
6. **QR-code and join-code resolution reuses the exact existing gating logic**
   already enforced by `server/api/join.post.ts` and
   `server/api/events/[slug].get.ts`: both require the event's `status` to be
   `'live'` before they resolve at all, regardless of whether the slug/join
   code themselves are well-formed. The check reports this directly - a
   draft event is reported as **not ready** here, not merely "informational,"
   because it is a real, current blocker to every attendee entry point
   (audience QR, moderator QR, and `/join`) working right now. Format
   validity is also checked via the project's own existing
   `isValidSlug`/`isValidJoinCode` validators
   (`app/utils/generate-event-identifiers.ts`), defensively, even though the
   database's unique/format constraints should already guarantee it.
7. **Moderator-auth readiness mirrors the exact existing gating logic in
   `server/api/events/[slug]/moderator-login.post.ts`**: login only ever
   succeeds when the event is `live`, `moderator_access_enabled` is true, and
   `event_settings.moderator_password_hash` is set - a true/enabled event with
   no password set is a real, reportable defect (login will always fail with
   no way for an admin to tell why from the attendee-facing 404/error
   alone). A currently-disabled `moderator_access_enabled` is reported as a
   heads-up, not a failure, since some events legitimately run without
   moderators. A currently-active `moderator_locked_until` lockout (from
   recent failed attempts) is reported as a transient heads-up, since it
   clears on its own.
8. **Event/submission/voting configuration state is a plain informational
   readout, not a pass/fail signal** - `status`, `submissions_open`,
   `voting_open`, and `moderator_access_enabled` are legitimate admin choices
   an operator wants to eyeball right before doors open, not defects to flag.
9. **No new table or migration.** Every signal is computed live from data and
   infrastructure that already exists (`events`, `event_settings`, the three
   Storage buckets, the `supabase_realtime` publication via the browser
   client) - there is nothing here to persist between runs.
10. **Not logged to Feature 32's audit log.** Running a read-only diagnostic
    is not one of Feature 32's named "major actions" categories - identical
    reasoning to Feature 35a's export and Feature 36's usage guardrails.

## In scope

- **`server/api/admin/events/[id]/readiness.get.ts` (new).**
  `verifyEventAccess`-gated. Computes, for the given event:
  - `supabaseAuth: { status: 'ok' | 'fail' }` - from
    `supabase.auth.admin.listUsers({ page: 1, perPage: 1 })` (any error ->
    `fail`).
  - `database: { status: 'ok' | 'fail' }` - from a plain
    `select id from events where id = :eventId` (any error, or no row found,
    -> `fail`).
  - `storage: { status: 'ok' | 'fail', buckets: { branding: 'ok' | 'fail',
    attachments: 'ok' | 'fail', reports: 'ok' | 'fail' } }` - one `.list('', {
    limit: 1 })` call per bucket (`event-branding`, `question-attachments`,
    `event-reports`); the aggregate is `fail` if any bucket call errors.
  - `qrAndJoinCode: { status: 'ok' | 'fail', eventLive: boolean, slugValid:
    boolean, joinCodeValid: boolean }` - `fail` unless the event's `status`
    is `'live'` and both `isValidSlug(slug)` and `isValidJoinCode(join_code)`
    are true.
  - `moderatorAuth: { status: 'ok' | 'warning' | 'fail', accessEnabled:
    boolean, passwordSet: boolean, lockedOut: boolean }` - `warning` when
    `accessEnabled` is false; `fail` when `accessEnabled` is true and
    `passwordSet` is false; `warning` when both are true but currently
    `lockedOut` (an unexpired `moderator_locked_until`); otherwise `ok`.
  - `configuration: { status: string, submissionsOpen: boolean, votingOpen:
    boolean, moderatorAccessEnabled: boolean }` - a plain readout of the
    event's current `status`, `submissions_open`, `voting_open`, and
    `moderator_access_enabled` values, no pass/fail judgment attached.
  Returns `{ supabaseAuth, database, storage, qrAndJoinCode, moderatorAuth,
  configuration }` in the standard envelope.
- **`app/pages/admin/events/[id].vue` (edit).** One new `'readiness'` tab
  alongside the existing tabs. Its panel shows a "Run readiness check" button
  (not auto-run on tab open, matching the build-plan's own "one-click"
  framing); clicking it fetches the readiness route and, in parallel, runs a
  client-side Realtime probe: subscribe to a throwaway channel
  (`readiness-check:${eventId}:${Date.now()}`) with no event bindings, resolve
  `ok` on a `SUBSCRIBED` status callback or `fail` on any other status or a
  5-second timeout, then always call `supabase.removeChannel(...)` to clean up
  regardless of outcome. Once both resolve, renders each check with a colored
  status badge (`ok` -> success, `warning` -> warning, `fail` -> error,
  mirroring Feature 36's `usage.vue` badge pattern), the storage per-bucket
  breakdown, the configuration readout as plain text, and one overall banner
  computed as the worst status across all checks (Realtime included).

## Out of scope

- **A dedicated `app: ok` field** - per the resolved note above; app
  reachability is proven by the response arriving at all, and its absence is
  already handled by the page's existing fetch-failure path.
- **Opening any Realtime connection from the Nitro server** - per the
  resolved note above; the Realtime probe runs client-side only.
- **Persisting readiness check results anywhere** - no new table; every run
  is computed live and shown only for that request.
- **Logging this to the audit log** - not one of Feature 32's named
  categories, per the resolved note above.
- **Any attendee/moderator-facing exposure** - this tab is reachable only
  through the existing `verifyEventAccess`-gated admin event page.
- **A true Supabase Management API health check** (infrastructure-level
  Realtime connection counts, project-wide incident status, etc.) - no such
  credential exists in this project, identical to Feature 36's own
  constraint.
- **Automatically fixing anything the check finds** (e.g., flipping
  `status` to `live`, setting a moderator password) - this feature only
  reports state; the admin still makes every change through the existing
  Details/Settings tabs.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Readiness route** - `server/api/admin/events/[id]/readiness.get.ts`
      per the contract above.
      **Done when:** code builds; a missing/invalid bearer token or a caller
      without access to this event returns 401 "Not authorized."; the
      response includes `supabaseAuth`, `database`, `storage` (with its
      per-bucket breakdown), `qrAndJoinCode`, `moderatorAuth`, and
      `configuration`, each computed per the contract above (confirmed by
      code review, since exercising a real Supabase project is outside this
      skill).
- [x] 2. **Readiness tab & client Realtime probe** - edit
      `app/pages/admin/events/[id].vue` per the contract above.
      **Done when:** code builds; the new "Readiness" tab renders a "Run
      readiness check" button; clicking it calls the readiness route and runs
      the client-side Realtime subscribe/unsubscribe probe in parallel;
      results render as per-check status badges, the storage per-bucket
      breakdown, the configuration readout, and one overall banner reflecting
      the worst status across every check including Realtime.

## Files / areas

- `server/api/admin/events/[id]/readiness.get.ts` (new)
- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

- **Response envelope:** `{ success, data, error }` throughout, matching
  every other server route in this project.
- **Authorization:** `verifyEventAccess(event, eventId)` on the new route,
  identical to `server/api/admin/events/[id]/dashboard.get.ts`'s existing
  precedent.
- **Status vocabulary:** `'ok' | 'warning' | 'fail'` per check - a fresh,
  purpose-specific vocabulary, not reused from Feature 36's
  `normal`/`approaching_capacity`/`consider_upgrading` usage-guardrail
  language, since the two features report fundamentally different things
  (capacity headroom vs. pass/fail readiness).
- **Storage buckets checked:** `event-branding`, `question-attachments`,
  `event-reports` - the exact three bucket names already in use elsewhere in
  this project (`server/api/admin/events/[id]/branding-logo.post.ts`,
  `server/api/attachments.post.ts`, `server/api/admin/events/[id]/reports.get.ts`).
- **Realtime probe channel:** `readiness-check:${eventId}:${Date.now()}` -
  a throwaway, uniquely-named channel with no table or Presence bindings,
  always removed after the probe resolves or times out (5 seconds).

## Testing

No test runner configured; `npm run build` is the automated check for both
steps. **Not yet exercised live:** the Supabase Auth Admin API call, the
per-bucket Storage list calls, the join/QR live-status gating against a real
event, and the browser-side Realtime subscribe/unsubscribe round trip - all
require a dev server and a real Supabase project, the same caveat recorded
for every prior feature that could not start a server from this skill.

## Notes for the AI

- Do not add a dedicated "app reachability" field to the response - per the
  resolved note above.
- Do not open a Realtime connection from the server route - the probe is
  client-side only, per the resolved note above.
- Do not create a new table or persist readiness results anywhere.
- Do not call `logAuditAction` from the new route - this action is not in
  Feature 32's named category list.
- Do not use `verifyAdministrator` for this route - use `verifyEventAccess`,
  since Event Managers with access to this event should see it too, matching
  Feature 31's dashboard precedent.
- Do not auto-run the check when the tab opens - it runs only when the admin
  clicks "Run readiness check," per the build-plan's own "one-click" wording.
- Reuse `isValidSlug`/`isValidJoinCode` from
  `app/utils/generate-event-identifiers.ts` rather than re-implementing
  format validation.
