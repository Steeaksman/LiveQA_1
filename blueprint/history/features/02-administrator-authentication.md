## Feature 2: Administrator authentication

**Branch:** `feature/administrator-authentication`
**Status:** verified

## Goal

Let an Administrator log in with Supabase Auth and reach a protected `/admin`
area; keep everyone else out, both in the UI and at the data layer (RLS
already enforces this from Feature 1 - this feature adds the login/session
code that actually uses it).

## In scope

- A way to create the very first Administrator account. There is no
  self-service signup anywhere in this product (by design - see
  `project-plan.md`), and `profiles` INSERT is already RLS-locked to
  existing administrators only (Feature 1). Without a bootstrap path, zero
  administrators could ever exist. `scripts/create-admin.mjs` (service-role,
  operator-run, never exposed in the app UI) fills that gap.
- `/admin/login` - email/password form using Supabase Auth
  (`signInWithPassword`), then a role check against `profiles`.
- A route guard so every other `/admin/*` page requires a valid session
  *and* `profiles.role = 'administrator'`, not just a valid Supabase Auth
  session (an Event Manager or any other authenticated-but-non-admin user
  must be rejected here too).
- Logout.
- A minimal `/admin` placeholder page (shows the logged-in email and a
  logout button) - just enough surface to prove the gate actually works.
  The real dashboard is Feature 31.

## Out of scope

- Event Manager login/access (Feature 3). This feature's role check is
  `= 'administrator'` only; Feature 3 extends the same login page and guard
  rather than replacing them.
- Any admin-only API route beyond auth itself - none exist yet, so there is
  nothing else to authorize server-side in this feature.
- Password reset / "forgot password" flow, MFA, session-length
  configuration - not described anywhere in the plans; add later if asked
  for.
- Disabling public sign-up in the Supabase project's own Auth settings.
  That's a dashboard setting, not app code; even if a stray `auth.users` row
  existed with no matching admin `profiles` row, the role check in this
  feature already denies it. Noted as an operational recommendation only.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps below) and `checkpointCommits: disabled` (no intermediate
commits; `/complete` makes the final commit).

## Build steps

- [x] 1. **Bootstrap script for the first Administrator** -
      `scripts/create-admin.mjs`: reads `NUXT_PUBLIC_SUPABASE_URL` and
      `NUXT_SUPABASE_SERVICE_ROLE_KEY` from `process.env` (run with
      `node --env-file=.env`), takes `--email` and `--password` CLI args,
      creates the Supabase Auth user via `supabase.auth.admin.createUser({
      email, password, email_confirm: true })`, then inserts a `profiles`
      row for that user's id with `role: 'administrator'` (service-role
      bypasses RLS, so this is the one legitimate path around the
      administrator-only INSERT policy). Errors clearly if either arg is
      missing or if a user with that email already exists. Document the
      command in `AGENTS.md`.
      **Done when:** running it against the connected project creates a
      real administrator, confirmed by reading the new `profiles` row back
      (`mcp__supabase__execute_sql`, a read-only `select`).
- [x] 2. **Shared browser Supabase client** - `app/composables/useSupabase.ts`
      returning a memoized client built from `runtimeConfig.public.supabaseUrl`
      / `supabaseAnonKey` (`@supabase/supabase-js`'s `createClient`, default
      session persistence - localStorage, auto-refresh). No new dependency;
      reuses the package Feature 1 already installed.
      **Done when:** `npm run build` succeeds and the composable is
      importable from a page.
- [x] 3. **Login page** - `app/pages/admin/login.vue`: email/password form
      (`@nuxt/ui` components). On submit: `signInWithPassword`; on success,
      query the caller's own `profiles` row (`select('role').eq('id',
      user.id).single()` - allowed by the `profiles_select` policy's
      self-read clause) and require `role = 'administrator'`; on any
      failure - wrong credentials, no session, or a real account that
      isn't an administrator - sign the session out immediately and show
      one generic message ("Invalid email or password.") so a non-admin
      account's existence is never revealed. A genuine unexpected error
      (network/Supabase outage) shows a distinct "Something went wrong.
      Please try again." message. Visiting `/admin/login` while already an
      authenticated administrator redirects straight to `/admin`.
      **Done when:** code builds; manual verification per Testing below
      covers correct login, wrong password, and a non-admin account.
- [x] 4. **Route guard, placeholder admin page, and logout** -
      `app/middleware/admin.ts` (Nuxt route middleware) applied to
      `app/pages/admin/index.vue` (new placeholder: shows the logged-in
      email and a "Log out" button) - redirects to `/admin/login` unless a
      session exists and `profiles.role = 'administrator'`. Add
      `routeRules: { '/admin/**': { ssr: false } }` to `nuxt.config.ts` so
      the guard only ever has to reason about client-side auth state (no
      SSR/cookie session-sync problem to solve, since Feature 1's env
      contract and `@supabase/supabase-js`'s default client only carries a
      browser-side session). Logout calls `signOut()` then redirects to
      `/admin/login`.
      **Done when:** code builds; manual verification confirms an
      unauthenticated visit to `/admin` redirects to `/admin/login`, and
      logout returns there too.

## Files / areas

- `scripts/create-admin.mjs` (new)
- `app/composables/useSupabase.ts` (new)
- `app/composables/useAdminSession.ts` (new - shared session/role check used
  by both the login page and the route guard)
- `app/pages/admin/login.vue` (new)
- `app/pages/admin/index.vue` (new)
- `app/middleware/admin.ts` (new)
- `nuxt.config.ts` (edit - `routeRules`)
- `AGENTS.md` (edit - Commands section: bootstrap script)

## Data / contracts

- **Session strategy (locked for this and later admin/EM work):** client-side
  only, via `@supabase/supabase-js`'s default browser session (localStorage,
  auto-refresh) using the anon key. No server-side cookie session, no new
  `@supabase/ssr` dependency. `/admin/**` is `ssr: false`. Any future
  server API route that needs to know who's calling must have the client
  forward the access token (`Authorization: Bearer <token>`) and verify it
  server-side with `supabase.auth.getUser(token)` - never trust a
  client-supplied role or id.
- **Authorization source of truth:** `profiles.role`, read fresh after
  every sign-in, never cached across sessions and never inferred from
  Supabase Auth metadata alone. A valid Supabase Auth session is necessary
  but not sufficient for `/admin/*` access.
- **Denial messaging:** wrong password, no account, and "account exists but
  isn't an administrator" all produce the identical generic error text, so
  the login form never discloses which case occurred.
- **Bootstrap script is the only INSERT path into `profiles` outside the
  RLS-gated administrator flow**, and it works precisely because it uses
  the service-role key (bypasses RLS by design, per Feature 1). It is never
  called from the running app.

## Testing

No test runner is configured yet, and this is UI/integration behavior
(a login form, a redirect guard) - exactly what `coding-standards.md` says
to verify with the running app and a build, not brittle unit tests.
`npm run build` passed. Live verification (the user, via `npm run dev`)
confirmed: an unauthenticated visit to `/admin` redirects to
`/admin/login`; the bootstrapped administrator's real credentials land on
`/admin` showing the email and a working logout; a wrong password shows
"Invalid email or password." The "real account, not an administrator"
denial path shares the exact same code path and message as the wrong-
password case (`getAdministratorSession` signs out and returns null either
way) but was not separately exercised live with a second account.

## Notes for the AI

- The bootstrapped administrator's password is a real secret the user
  chooses when running the script - never print it back, never log it, and
  never hardcode a default.
- Reuse `runtimeConfig.public.supabaseUrl` / `supabaseAnonKey` (already
  wired in `nuxt.config.ts` from Feature 1) for the browser client; reuse
  `server/utils/supabase.ts` (service-role) only inside
  `scripts/create-admin.mjs`, never from a page or client-reachable code
  path.
- Keep the placeholder `/admin` page genuinely minimal - it exists to prove
  the gate works, not to anticipate Feature 31's dashboard.
