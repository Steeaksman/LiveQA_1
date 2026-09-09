## Feature 1: Supabase project & schema

**Branch:** `feature/supabase-project-schema`
**Status:** verified

## Goal

Give the project a version-controlled Postgres schema (all core tables, enums,
indexes, constraints, and RLS policies) applied to the real connected Supabase
project, so a fresh Supabase project can be reproduced from the repo and every
later feature has the tables it needs.

## In scope

- Repo scaffolding for Supabase migrations (`supabase/` directory, migration
  files, `.env.example`) and a minimal server-side Supabase client helper.
- One migration file per logical table group, run by the user in the
  Supabase Dashboard SQL Editor against the connected project (ref
  `mhisikyrthnqflkmyrot`) and committed to the repo. The Supabase MCP
  tools available in this session are read-only, so `execute_sql` cannot
  apply DDL - it verifies the result instead (`list_tables`, `get_advisors`).
- All 17 core tables from `project-overview.md`'s data model, with columns,
  enums, FKs, indexes, and uniqueness constraints that are already
  unambiguous from `project-overview.md` / `project-plan.md`.
- RLS enabled on every table. Full `auth.uid()`-based policies for the
  Administrator/Event Manager-facing tables (identity and event
  administration). Enabled-but-default-deny RLS (no policies, service role
  only) on attendee/moderator/Q&A tables whose real access rules depend on
  identity mechanisms that don't exist yet (device tokens, moderator
  password sessions) - those land with Features 12, 19, and 25.
- A small smoke script that proves connectivity and proves RLS actually
  denies an unauthorized anon-key read against an admin-only table.

## Out of scope

- Any UI (event wizard, login screens, attendee/moderator/admin pages).
- Administrator/Event Manager authentication flows (Feature 2/3) - `profiles`
  exists as a table, but no signup/login/session code.
- Per-event settings toggle columns not yet named by a speced feature
  (moderation mode, voting, anonymity mode, attachment limits, abuse tiers,
  retention, notifications). `event_settings` is created as a 1:1 identity
  row now; each feature that defines a toggle adds its own column via its
  own migration when it ships.
- The exact attendee-token / moderator-session RLS policies themselves
  (only the deny-by-default posture, so nothing is silently open before
  those features exist).
- Supabase CLI linking (`supabase link` / `db push`) for local/CI use -
  migrations are applied by the user pasting SQL into the Supabase
  Dashboard SQL Editor this time. CLI linking is a documented follow-up,
  not required here.
- Local Supabase dev stack - this environment has no Docker, so migrations
  are authored as plain SQL files and applied straight to the real project,
  not `supabase start`.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps below, not a pause after each one) and `checkpointCommits:
disabled` (no intermediate commits; `/complete` makes the final commit).

## Build steps

- [x] 1. **Scaffold Supabase project files and env contract** - add
      `supabase/config.toml` (CLI project scaffold, project ref
      `mhisikyrthnqflkmyrot`) and empty `supabase/migrations/`; add
      `@supabase/supabase-js` to `package.json`; add `.env.example` with
      `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY` (client-safe,
      used for direct-to-Supabase Realtime subscriptions later), and
      `NUXT_SUPABASE_SERVICE_ROLE_KEY` (server-only secret, never exposed to
      the client); wire `runtimeConfig` / `runtimeConfig.public` in
      `nuxt.config.ts` for those three vars; add `server/utils/supabase.ts`
      exporting a server-side client built from the service-role key. Update
      the Commands section of `AGENTS.md` to note the required env vars.
      **Done when:** `npm install` succeeds, `npm run build` succeeds, and
      the three env vars are documented in `.env.example` and read through
      `runtimeConfig`.
- [x] 2. **Migration: identity & event administration tables** -
      `supabase/migrations/<ts>_identity_and_events.sql` creating enums
      `profile_role` (`administrator`, `event_manager`), `em_scope`
      (`global`, `restricted`), `event_status` (`draft`, `scheduled`,
      `live`, `closed`, `archived`); tables `profiles` (`id` = FK to
      `auth.users`, `role`, `em_scope` nullable/only meaningful when
      `role = 'event_manager'`), `events` (`slug` unique, `join_code`
      unique, `name`, `status`, `submissions_open`, `voting_open`,
      `moderator_access_enabled`, `created_by` FK `profiles`),
      `event_settings` (`event_id` unique FK `events`, identity row only),
      `event_manager_assignments` (`event_manager_id` FK `profiles`,
      `event_id` FK `events` not null, `granted_by` FK `profiles`, unique
      on `(event_manager_id, event_id)`), `event_templates` (`name`,
      `created_by` FK `profiles`, `config jsonb`), `attendee_types`
      (`event_id` FK, `label`, `sort_order`, partial-unique
      `(event_id, label)` where not deleted). Every table gets `deleted_at
      timestamptz null`, `created_at`, `updated_at` (maintained by a shared
      `set_updated_at()` trigger function created in this migration).
      Hand the SQL to the user to run in the Supabase Dashboard SQL
      Editor, then verify. **Done when:** `mcp__supabase__list_tables` (verbose) shows all
      6 tables with the expected columns and FKs.
- [x] 3. **Migration: attendee & Q&A tables** -
      `supabase/migrations/<ts>_attendee_qa.sql` creating enums
      `approval_status` (`pending`, `approved`, `rejected`), `visibility_state`
      (`hidden`, `public`); tables `topics` (`event_id` FK, `name`,
      `sort_order`, `is_current boolean default false` with a partial unique
      index enforcing at most one current topic per event), `attendees`
      (`event_id` FK, `token` unique not null - the opaque value the client
      holds, `display_name` nullable, `attendee_type_id` FK nullable,
      `banned_until` nullable), `questions` (`event_id` FK, `topic_id` FK
      nullable, `attendee_id` FK not null, `text`, `anonymous boolean
      default false`, `approval_status` default `pending`, `visibility`
      default `hidden`, `answered boolean default false`, `archived boolean
      default false` - approval, visibility, answered, and archived are
      independent columns per `project-overview.md`'s question state-machine
      note, not one combined state), `question_revisions` (`question_id`
      FK, `original_text`, `revised_text`, `edited_by` FK `profiles`,
      `created_at` only - append-only, no `deleted_at`/`updated_at`),
      `votes` (`question_id` FK, `attendee_id` FK, unique
      `(question_id, attendee_id)`, `created_at` only - immutable, no
      un-vote path exists yet so no delete/update columns), `replies`
      (`question_id` FK, `attendee_id` FK nullable, `text`,
      `approval_status`, `visibility`, independently moderated per the
      overview), `attachments` (`question_id` FK, `storage_path`,
      `mime_type`, `size_bytes`), `content_reports` (`attendee_id` FK,
      `question_id` FK nullable, `reply_id` FK nullable, `reason` nullable,
      a CHECK that exactly one of `question_id`/`reply_id` is set, and two
      partial unique indexes - `(attendee_id, question_id)` where
      `question_id is not null` and `(attendee_id, reply_id)` where
      `reply_id is not null` - for the per-attendee dedupe). All tables
      except `question_revisions` and `votes` get the standard
      `deleted_at`/`created_at`/`updated_at`. Hand the SQL to the user to
      run in the Supabase Dashboard SQL Editor, then verify.
      **Done when:** `list_tables` (verbose) shows all 7 tables with the
      documented FKs and the two partial unique indexes exist (confirm via
      `execute_sql` against `pg_indexes`).
- [x] 4. **Migration: moderation, reporting & audit tables** -
      `supabase/migrations/<ts>_moderation_and_audit.sql` creating
      `moderator_sessions` (`event_id` FK, `session_token` unique,
      `expires_at`, `revoked_at` nullable, `created_at`), `reports`
      (`event_id` FK, `generated_by` FK `profiles`, `report_type`,
      `format`, `storage_path` nullable, `created_at`), `audit_logs`
      (`actor_id` FK `profiles`, `event_id` FK nullable, `action text`,
      `details jsonb` nullable, `created_at` only - append-only, no
      `deleted_at`/`updated_at`). Hand the SQL to the user to run in the
      Supabase Dashboard SQL Editor, then verify.
      **Done when:** `list_tables` shows all 3 tables with the documented
      columns.
- [x] 5. **Migration: RLS policies on every table** -
      `supabase/migrations/<ts>_rls_policies.sql` running `ALTER TABLE ...
      ENABLE ROW LEVEL SECURITY` on all 17 application tables (not
      `auth.*`), then: full policies for `profiles`, `events`,
      `event_settings`, `event_manager_assignments`, `event_templates`,
      `attendee_types`, `topics` - an Administrator (`profiles.role =
      'administrator'` for `auth.uid()`) gets full read/write on all rows;
      an Event Manager gets read/write only on rows for events where either
      their `profiles.em_scope = 'global'` or an
      `event_manager_assignments` row grants that specific `event_id`;
      every authenticated user can read their own `profiles` row. RLS
      enabled with **no policies** (default-deny for `anon`/`authenticated`,
      full access preserved for the service role, which bypasses RLS by
      design) on `attendees`, `questions`, `question_revisions`, `votes`,
      `replies`, `attachments`, `content_reports`, `moderator_sessions`.
      `audit_logs` and `reports`: Administrator read-only policy, no
      client-side write policy for any role (writes only ever come from
      server routes using the service-role key). Hand the SQL to the user
      to run in the Supabase Dashboard SQL Editor, then verify.
      **Done when:** `mcp__supabase__get_advisors`
      (`security`) shows no "RLS disabled" lint for any of the 17 tables.
- [x] 6. **Verification smoke check** - added `scripts/check-rls.mjs` using
      `@supabase/supabase-js` that: connects with the anon key and confirms
      a `select` against `profiles` is denied, confirms an `insert` into
      `event_templates` is denied, then connects with the service-role key
      (read from `process.env`, never printed or committed) and confirms a
      `select` against `profiles` succeeds. In practice the anon `select`
      comes back as a hard `42501 permission denied for function
      is_administrator` rather than an empty result set, because Postgres
      checks EXECUTE on every function named in a policy's `OR` expression
      at plan time, regardless of which branch would apply - a stronger
      denial than originally expected, not a weaker one. Documented the
      command in `AGENTS.md`. Ran `mcp__supabase__get_advisors` for both
      `security` and `performance`, iterating three corrective migrations
      until every fixable finding was resolved.
      **Done when:** all three smoke-script checks pass, `get_advisors`
      security/performance show no unresolved fixable lint (residual:
      `authenticated` can still call the two helper functions directly via
      RPC - required for RLS to evaluate at all, returns only a boolean,
      documented as accepted), and `npm run build` still succeeds.

## Files / areas

- `supabase/config.toml`, `supabase/migrations/*.sql` (new)
- `.env.example` (new)
- `nuxt.config.ts` (edit - `runtimeConfig`)
- `server/utils/supabase.ts` (new)
- `scripts/check-rls.mjs` (new)
- `package.json` (edit - `@supabase/supabase-js` dependency)
- `AGENTS.md` (edit - Commands section: env vars, smoke-check command)

## Data / contracts

- **Soft delete:** a nullable `deleted_at timestamptz` column; `NULL` means
  active. Applied to every table except the three append-only/immutable
  ones (`question_revisions`, `votes`, `audit_logs`) which have no update
  or delete path in this feature and so carry no `deleted_at`/`updated_at`.
  `moderator_sessions` and `reports` do get `deleted_at`/`updated_at`, same
  as every other mutable table.
- **Timestamps:** `created_at timestamptz not null default now()` on every
  table; `updated_at timestamptz not null default now()` maintained by a
  shared trigger, on every table that also has `deleted_at`.
- **IDs:** UUID primary keys (`gen_random_uuid()`) everywhere except
  `profiles.id`, which is the `auth.users.id` FK directly.
- **Attendee identity:** the attendee-facing identifier is `attendees.token`
  (opaque, unique, indexed) - `attendees.id` is never exposed to a client.
- **Question ownership redaction:** `questions.attendee_id` is a required,
  non-null FK at the database level. Any query or view that serves public
  (attendee-facing) reads must null out the resolved owner
  identity/attendee info when `questions.anonymous = true`. This feature
  only creates the column; enforcing the redaction in a query is Feature 13.
- **Question state:** `approval_status` (`pending|approved|rejected`),
  `visibility` (`hidden|public`), `answered`, `archived` are four
  independent fields, matching `project-overview.md`'s note that approval
  and visibility are tracked independently. There is no single combined
  `state` enum.
- **Event Manager scope:** modeled as `profiles.em_scope`
  (`global|restricted`), meaningful only when `role = 'event_manager'`.
  `event_manager_assignments.event_id` is always non-null and only used to
  enumerate grants when scope is `restricted`.
- **RLS bypass:** the service-role key bypasses RLS entirely by Postgres/
  Supabase design; every table with default-deny RLS is only ever written
  through server code (`server/utils/supabase.ts` service-role client),
  never directly from the browser.
- **Env vars (new contract for later features):** `NUXT_PUBLIC_SUPABASE_URL`
  and `NUXT_PUBLIC_SUPABASE_ANON_KEY` are client-exposed (used by the
  browser for direct Realtime subscriptions in Feature 25);
  `NUXT_SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be read
  from client-side code or logged.

## Testing

No test runner is configured yet (`/tests` hasn't run), so this feature has
no pure logic to unit test - it is schema and SQL. Verification instead
relies on: `mcp__supabase__list_tables` (structural confirmation after each
migration step), `mcp__supabase__get_advisors` `security` (RLS coverage) and
`performance` (missing-index warnings) run at the end, `npm run build`
(the only currently-declared build-level check), and the `scripts/check-
rls.mjs` smoke script proving RLS actually denies/allows as designed. This
is real evidence against the live connected project, not a local/Docker
stack (none is available in this environment).

## Notes for the AI

- The Supabase MCP server in this session is connected to the target
  project (`https://mhisikyrthnqflkmyrot.supabase.co`) but is **read-only**:
  `execute_sql` refuses DDL ("cannot execute CREATE TABLE in a read-only
  transaction") and no `apply_migration` write tool is exposed here. Author
  each migration as `supabase/migrations/<timestamp>_<name>.sql` (the repo
  stays the reproducible source of truth), then hand its exact SQL to the
  user to paste and run in the Supabase Dashboard SQL Editor. After the
  user confirms it ran, verify structurally with `mcp__supabase__
  list_tables` (and `get_advisors` where relevant) - never assume success
  without that read-back. Use real UTC timestamps for filenames, strictly
  increasing across the migration files in step order.
- Never fetch, print, log, or write the service-role key anywhere in the
  repo or a tool call; it belongs only in the user's local `.env` (already
  gitignored) and SiteGround's env-var manager later. `.env.example` lists
  the variable name with a placeholder only.
- Run `mcp__supabase__get_advisors` after step 2 and step 3 too, not only
  at the end - expect (and don't fix yet) "RLS disabled" warnings on tables
  created before step 5; that's expected mid-feature, not a regression.
- Keep each migration additive and forward-only; don't edit an already-
  applied migration file - if a mistake is found after a file has been
  applied via `execute_sql`, add a new corrective migration instead.
- `event_settings` is intentionally near-empty. Do not add moderation mode,
  voting, anonymity, attachment, retention, or notification columns here -
  each of those belongs to the feature that actually defines its exact
  values (Features 4, 18, 29, 30, and others not yet speced).
