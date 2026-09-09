## Feature 3: Event Manager accounts & permissions

**Branch:** `feature/event-manager-accounts-permissions`
**Status:** verified

## Goal

Let an Administrator create and manage Event Manager accounts with either
global (all events) or restricted (specific events only) access, and let an
Event Manager log in through the same gate Feature 2 built. The RLS side of
this (`is_event_manager_for`, `profiles.em_scope`, `event_manager_assignments`)
already exists from Feature 1 - this feature adds the account lifecycle and
the UI/server logic that uses it.

## In scope

- Extend the Feature 2 login/guard so a valid `event_manager` profile (not
  just `administrator`) can authenticate and reach `/admin`. Authorization
  stays per-role: this doesn't grant Event Managers anything beyond what
  RLS already permits them.
- A corrective RLS fix: `profiles_select`'s self-read clause
  (`id = auth.uid()`) doesn't currently exclude soft-deleted rows, so a
  revoked account could still read its own profile and appear "logged in"
  at the UI layer even though every other table already correctly denies
  it (Feature 1's `is_administrator`/`is_event_manager_for` do filter
  `deleted_at is null`). This feature is what makes revocation a real,
  user-facing action, so the gap has to close now.
- `server/api/admin/event-managers.post.ts` - the one operation that
  genuinely needs the service-role key (creating the Supabase Auth user).
  Independently verifies the caller is a current administrator server-side;
  never trusts a client-supplied role.
- `/admin/event-managers` (Administrator-only): list Event Managers with
  their scope and assigned events; create one (email, password, global or
  restricted, optional initial event picks); change scope; add/remove
  individual event assignments; revoke and restore access.
- A visible nav link to that page from `/admin`, shown to administrators
  only.

## Out of scope

- Anything Event-Manager-facing beyond the shared `/admin` placeholder
  reaching login successfully - a real scoped dashboard/event list for
  Event Managers doesn't exist as a concept yet (events themselves don't
  exist until Feature 4). The placeholder page just needs to say who's
  logged in and with what scope.
- Inviting an Event Manager by email / self-service password setup. No
  email-sending capability is built or verified in this project; the
  Administrator sets the initial password directly, the same pattern
  Feature 2's bootstrap script already uses, communicated out-of-band.
- Permanent (hard) delete of an Event Manager account - only soft
  delete/restore, per the project-wide soft-delete convention. Permanent
  delete with confirmation is Feature 33's job for all entities at once.
- Any change to `events`, `event_settings`, or the wizard - Feature 4.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **RLS fix + generalized session helper** -
      `supabase/migrations/<ts>_fix_profiles_select_soft_delete.sql`: drop
      and recreate `profiles_select`. First pass applied `deleted_at is
      null` to the whole policy, which also hid revoked profiles from
      administrators - breaking the restore workflow step 4 needs - so a
      second corrective migration
      (`<ts>_fix_profiles_select_admin_visibility.sql`) narrowed it to only
      gate the self-read branch: `using (is_administrator((select
      auth.uid())) or (deleted_at is null and id = (select auth.uid())))`.
      Hand the SQL to the user to run in the Supabase Dashboard SQL Editor,
      then verify via `mcp__supabase__execute_sql` reading `pg_policies`.
      Replace
      `app/composables/useAdminSession.ts` with
      `app/composables/useAuthSession.ts`, exporting
      `getAuthenticatedProfile(supabase)` returning `{ userId, email, role:
      'administrator' | 'event_manager', emScope: 'global' | 'restricted'
      | null }` or `null` (no session, no profile row, or a role outside
      those two - still signs out on denial, same as before). Update
      `app/middleware/admin.ts`, `app/pages/admin/login.vue`, and
      `app/pages/admin/index.vue` to use it and accept both roles; the
      placeholder page's text becomes role/scope-aware (for example
      "Administrator" or "Event Manager (Global)" / "Event Manager
      (Restricted)").
      **Done when:** `pg_policies` shows the corrected `profiles_select`
      qual; `npm run build` succeeds.
- [x] 2. **Administrator-only guard** - `app/middleware/administrator-only.ts`:
      redirects to `/admin` (not `/admin/login`, since the caller may
      already be a legitimately authenticated Event Manager) unless
      `getAuthenticatedProfile(...).role === 'administrator'`.
      **Done when:** code builds; applied to the page added in step 4.
- [x] 3. **Create-Event-Manager server route** -
      `server/utils/verify-administrator.ts`: reads the `Authorization:
      Bearer <token>` header, calls `supabase.auth.getUser(token)` (via the
      existing service-role client - validating a token doesn't need
      elevated privilege, and reusing the one client avoids a second
      Supabase client construction), then re-checks `profiles.role =
      'administrator' and deleted_at is null` for that user id using the
      service-role client (bypasses RLS - the route must verify this
      itself, never trust the caller). Returns the administrator's id or
      `null`. `server/api/admin/event-managers.post.ts`: requires a valid
      administrator (401 otherwise); validates `email`, `password`, `scope`
      (`'global' | 'restricted'`), optional `eventIds: string[]` (ignored
      unless `scope === 'restricted'`); creates the Supabase Auth user
      (`auth.admin.createUser({ email, password, email_confirm: true })`),
      then the `profiles` row (`role: 'event_manager'`, chosen `em_scope`),
      then one `event_manager_assignments` row per `eventIds` entry
      (`granted_by` = the verified administrator's id) when restricted. On
      any failure after the auth user was created (profile or assignment
      insert), the response still reports the error clearly - no automatic
      user deletion, since resolving a half-created account through the
      same admin UI (retry, or revoke it) is simpler and safer than an
      auto-rollback that could itself fail silently. Duplicate email
      produces a clear "an account with this email already exists" error.
      Returns `{ success, data, error }` per `coding-standards.md`.
      **Done when:** calling it (during manual verification below) with a
      new email creates a real Supabase Auth user, a matching `profiles`
      row, and the expected `event_manager_assignments` rows, confirmed by
      a read-only query.
- [x] 4. **Event Managers admin page** - discovered while implementing:
      listing Event Managers needs their email, but PostgREST never exposes
      the `auth` schema to the client (even for administrators), so a
      `profiles` ⋈ `auth.users` join isn't possible client-side as
      originally planned. Fix: add a denormalized `profiles.email text`
      column (`supabase/migrations/<ts>_add_profiles_email.sql`, backfilled
      from `auth.users` for the existing administrator in the same
      migration, since only that one-time migration context can read
      `auth.users`); set it going forward from `scripts/create-admin.mjs`
      and the step-3 route, both of which already have the email in hand
      at creation time. This keeps "reads are direct client queries" true
      with no second server route. `app/pages/admin/event-managers.vue`
      (guarded by `administrator-only`): lists Event Managers (email,
      scope, assigned event names, active/revoked) via direct client
      queries against `profiles` and `event_manager_assignments` joined to
      `events.name` - already RLS-permitted for an administrator. A create form (email, password, scope,
      optional event multiselect sourced from `events` - empty until
      Feature 4 ships, which is a valid state, not an error) posts to the
      step-3 route, forwarding the caller's access token as the bearer
      token. Per-row actions, all direct client mutations under existing
      RLS (`profiles_update`, `event_manager_assignments_insert`/`_update`,
      both already administrator-only from Feature 1): change scope,
      add/remove one event assignment at a time (removal is `update ...
      set deleted_at = now()`, never a hard delete - there is no delete
      policy for `event_manager_assignments`, by design), revoke access
      (`profiles.deleted_at = now()`), restore (`deleted_at = null`). Add a
      "Event Managers" link from `/admin/index.vue`, visible only when
      `role === 'administrator'`.
      **Done when:** code builds; manual verification (below) covers
      create, scope change, assignment add/remove, revoke, and restore.

## Files / areas

- `supabase/migrations/<ts>_fix_profiles_select_soft_delete.sql` (new)
- `supabase/migrations/<ts>_fix_profiles_select_admin_visibility.sql` (new)
- `supabase/migrations/<ts>_add_profiles_email.sql` (new)
- `scripts/create-admin.mjs` (edit - set `profiles.email`)
- `app/composables/useAuthSession.ts` (new, replaces `useAdminSession.ts`)
- `app/middleware/admin.ts` (edit - accept both roles)
- `app/middleware/administrator-only.ts` (new)
- `app/pages/admin/login.vue` (edit - use the renamed helper)
- `app/pages/admin/index.vue` (edit - role/scope-aware text, nav link)
- `app/pages/admin/event-managers.vue` (new)
- `server/utils/verify-administrator.ts` (new)
- `server/api/admin/event-managers.post.ts` (new)

## Data / contracts

- **`profiles.email` is a denormalized copy of `auth.users.email`,** set
  once at account creation (bootstrap script, or the step-3 route). It
  exists solely so an administrator's browser session can list accounts
  without a server round-trip - `auth` is never an exposed PostgREST
  schema. Nothing in this feature updates it after creation (no
  change-email flow exists yet); if one is ever added, it must keep both
  copies in sync.
- **Bearer-token pattern (first real use of Feature 2's locked contract):**
  the client sends `Authorization: Bearer <access_token>` (from
  `supabase.auth.getSession()`) on the create-Event-Manager request; the
  server independently re-verifies the token and the caller's current
  `administrator` role before doing anything privileged. A client-supplied
  role or id is never trusted.
- **Scope/assignment invariant:** `event_manager_assignments` rows are only
  meaningful (and only created) when the owning profile's `em_scope =
  'restricted'`. Switching an existing Event Manager from restricted to
  global does not delete their assignment rows (cheap to keep, becomes
  relevant again if switched back); switching from global to restricted
  starts with zero assignments until the administrator adds some - a valid,
  intentionally powerless state, not an error.
- **Revocation is soft delete on `profiles.deleted_at`,** consistent with
  the project-wide soft-delete convention, reversible via restore. A
  revoked account's Supabase Auth user still exists (sessions already
  issued before revocation are cut off by the `profiles_select` fix in
  step 1 - the next authenticated request that re-derives the profile
  finds `deleted_at` set and denies).
- **Unassigning an event is a soft update, not a delete** -
  `event_manager_assignments` has no delete RLS policy for anyone but the
  service role, by design from Feature 1.

## Testing

No test runner is configured yet; this is RLS/SQL plus UI/integration
behavior. What actually ran: `npm run build` (passes), and read-only
database checks after every migration (`pg_policies` for both
`profiles_select` corrections, a `profiles` select confirming the email
backfill). **Not exercised live:** creating an Event Manager (global or
restricted), changing scope, adding/removing an event assignment, revoking
access, and restoring it - the user chose to skip the `npm run dev` manual
pass offered at the end of implementation. Event assignment specifically
also can't be fully tested yet regardless, since `events` is still empty
(Feature 4). This feature should not be treated as behaviorally verified
until at least the create/revoke/restore path is exercised once, live.

## Notes for the AI

- Never construct the `Authorization` header value from anything other than
  the current session's real access token; never accept a role or user id
  passed in the request body as authoritative.
- The Event Manager's password is a real secret the administrator chooses
  in the form - never log it, never echo it back in a response body beyond
  what's needed to confirm success.
- `is_administrator` / `is_event_manager_for` already filter
  `deleted_at is null` internally (Feature 1); only the plain
  `profiles_select` self-read clause needed the fix in step 1.
