## Feature 40: Load testing

**Branch:** `feature/load-testing`
**Status:** verified

## Goal

Give the operator a repeatable script that simulates ~100, then ~150-200,
concurrent attendees issuing rapid question/vote bursts against a real
(non-production) event, measuring HTTP latency, error rates, and Realtime
connection behavior - the exact scenario project-overview.md's own "Load
target" line names, run before launch against a dedicated test event, never
a live one.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **This is a script to build, not a review to run** - unlike Feature 39
   (a review activity satisfied through `/audit`, with no code of its own to
   write), this build-plan line asks for a reusable tool. `/feature` is the
   right skill; the two existing operator scripts
   (`scripts/check-rls.mjs`, `scripts/create-admin.mjs`) already establish
   the pattern this follows: a bare `.mjs` file, run via `node
   --env-file=.env scripts/<name>.mjs`, using `@supabase/supabase-js`
   (already a dependency) and printing results to the console - no new
   dependency needed.
2. **The script drives the app's real HTTP API, not the database directly**
   - each simulated attendee calls the exact same routes a real browser
     calls (`GET /api/events/:slug`, `POST /api/attendees/join`, `POST
   /api/questions`, `POST /api/votes`), so the test measures the actual
     deployed request path, not a database benchmark.
3. **Each simulated attendee also opens a real Supabase Realtime Presence
   channel** (`event:<id>:questions`, tracking `{ role: 'attendee' }`),
   mirroring exactly what `e/[slug].vue` already does, using the anon key
   directly (not through the Node server) - this is what actually produces
   the "Realtime behavior" the build-plan line asks to document; without it,
   the test would never exercise concurrent Realtime connections at all.
4. **The script requires a pre-existing, already-configured test event** -
   creating one requires Administrator authentication (email/password),
   which this script has no safe way to hold; the operator creates a
   dedicated event through the existing admin UI first (matching
   project-overview's own "never against a live event" - here read as
   "never against a real, in-use event," since the event must still be set
   to `status: live` for its join code and API routes to resolve at all),
   sets it live, opens submissions/voting, and passes its slug as a CLI
   argument. **Notes for the AI** below calls out that the operator should
   also set that event's abuse-protection tier to `open` before running the
   script - the app's own rate limiter (Feature 30a) would otherwise
   throttle each simulated attendee after a handful of rapid submissions,
   measuring the rate limiter instead of real request-handling capacity.
5. **Two-phase (~100, then ~150-200) is the operator's job, not the
   script's** - a `--clients` CLI argument controls concurrency per run; the
   operator runs the script twice with different values, matching how
   `create-admin.mjs`'s own CLI-argument pattern already works, rather than
   building a multi-phase orchestrator into the tool itself.
6. **Latency and error measurement uses only Node's built-in `performance.now()`
   and `fetch`** - no new dependency for statistics either; percentiles
   (p50/p95/p99/max) are computed by sorting the recorded per-request
   durations.
7. **Actually running the script against a live target and recording real
   results is outside this skill** - `/feature` and `/implement` never
   start a dev server or hit a live Supabase project, the same constraint
   already disclosed for every UI feature this session. This feature builds
   the tool; using it to produce the actual documented latency/error/
   Realtime numbers the build-plan line asks for is the operator's own
   follow-up step.

## In scope

- **`scripts/load-test.mjs` (new).** CLI arguments: `--url` (the running
  app's base URL, e.g. `http://localhost:3000`), `--slug` (the test event's
  slug), `--clients` (concurrent simulated attendees, default 100),
  `--duration` (seconds each simulated attendee keeps submitting/voting,
  default 60). Reads `NUXT_PUBLIC_SUPABASE_URL` and
  `NUXT_PUBLIC_SUPABASE_ANON_KEY` from the environment (via `--env-file=.env`,
  matching the existing scripts) for the Realtime connection - never the
  service-role key, since this simulates attendees, not an admin/server
  actor.
  For each simulated attendee, concurrently:
  1. `GET {url}/api/events/{slug}` to resolve the real event id and current
     settings (question max length, etc.).
  2. Generate a random device token (`crypto.randomUUID()`) and `POST
     {url}/api/attendees/join`.
  3. Open a Supabase Realtime channel (`event:<id>:questions`), track
     Presence as `{ role: 'attendee' }`, and record whether/how long it took
     to reach `SUBSCRIBED`.
  4. For `--duration` seconds, repeatedly wait a random 200ms-2s pause, then
     either submit a new question (`POST {url}/api/questions`) or vote on a
     question already seen from step 1's/an earlier fetch (`POST
     {url}/api/votes`) - picked at random per iteration.
  5. Record the outcome (success/HTTP status) and latency
     (`performance.now()` before/after) of every HTTP call, tagged by
     endpoint.
  After all simulated attendees finish, print a summary: total
  requests/errors and p50/p95/p99/max latency per endpoint
  (join/questions/votes), and Realtime connect success count plus
  connect-time percentiles.
- **`AGENTS.md` (edit).** Add a "Load test" line to the Commands section,
  matching the existing RLS-smoke-check and create-admin entries, naming the
  exact command and its four flags.

## Out of scope

- **Creating or configuring the test event** - the operator does this
  through the existing admin UI; the script only reads an already-live
  event by slug.
- **A multi-phase orchestrator running both the ~100 and ~150-200 phases
  automatically** - per the resolved note above, the operator runs the
  script twice with different `--clients` values.
- **Any new npm dependency** - per the resolved note above, `fetch`,
  `performance.now()`, and the already-installed `@supabase/supabase-js`
  are sufficient.
- **Actually executing the script against a live target and recording the
  real latency/error/Realtime numbers** - per the resolved note above, this
  requires a running server and a real Supabase project, outside this
  skill's reach.
- **Any change to the app's own rate limiting, abuse protection, or
  Realtime code** - this feature only builds a script that exercises the
  existing behavior; it does not change it.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Core load-test script: HTTP simulation** -
      `scripts/load-test.mjs` per the contract above, covering CLI argument
      parsing, event resolution, join, and the submit/vote loop with
      per-endpoint latency and error tracking.
      **Done when:** the script runs against a real target without a syntax
      or runtime error given valid arguments (confirmed by a dry run this
      skill cannot perform live - see Testing below; confirmed instead by
      code review against the exact API contracts of
      `/api/events/[slug].get.ts`, `/api/attendees/join.post.ts`,
      `/api/questions.post.ts`, and `/api/votes.post.ts`).
- [x] 2. **Realtime Presence tracking and final summary report** - add the
      per-attendee Realtime channel/Presence tracking and the end-of-run
      aggregated summary (per-endpoint counts, error counts, latency
      percentiles, Realtime connect stats) to `scripts/load-test.mjs`;
      update `AGENTS.md`'s Commands section.
      **Done when:** code review confirms the Presence channel setup
      matches `e/[slug].vue`'s existing pattern exactly, the percentile
      calculation is correct for a sorted array, and `AGENTS.md` documents
      the exact command and its flags.

## Files / areas

- `scripts/load-test.mjs` (new)
- `AGENTS.md` (edit)

## Data / contracts

No API or stored-data contract changes - this script only calls existing
routes exactly as a real browser already does. No new fields, routes, or
response shapes.

## Testing

No test runner is configured, and this is an operator script, not
application logic with a done-when a unit test would cover (per
`coding-standards.md`'s own testing scope rule: "What not to test: ...
anything driving a real browser or external service"). `npm run build` is
unaffected by a `scripts/` file (Nuxt does not build the `scripts/`
directory) and is not a meaningful check here. Verification for both steps
is code review against the exact request/response contracts of the four
routes the script calls, plus the existing Realtime Presence pattern in
`e/[slug].vue`. **Not yet exercised live:** every actual latency, error-rate,
and Realtime-connection number - producing those requires the operator to
run the finished script against a running app and a real (non-production)
Supabase project, which is outside this skill's reach, the same caveat
recorded for every prior feature that could not start a server from this
skill.

## Notes for the AI

- Do not use the service-role key anywhere in this script - it simulates
  attendees, who never have it.
- Do not have the script create or modify the test event's settings -
  reading it via the public API route is enough; configuration is the
  operator's job through the existing admin UI.
- Disclose to the user, once the script is built, that they should set the
  test event's abuse-protection tier to `open` before running it, or the
  app's own rate limiter will throttle simulated attendees and the test
  will measure the rate limiter instead of real capacity.
- Do not build a multi-phase (~100 then ~150-200) orchestrator - one
  `--clients` flag, run twice by the operator, per the resolved note above.
- Do not attempt to start a dev server or run the script against a live
  target from this skill.
