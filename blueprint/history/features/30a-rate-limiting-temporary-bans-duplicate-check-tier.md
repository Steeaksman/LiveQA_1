## Feature 30a: Rate limiting, temporary bans & duplicate-check tier

**Branch:** `feature/rate-limiting-temporary-bans-duplicate-check-tier`
**Status:** verified

## Goal

Give each event a single Open/Standard/Strict abuse-protection tier that
throttles how fast an attendee can submit questions/replies, automatically
and temporarily bans an attendee who keeps exceeding that limit, and blocks
every write action (question, reply, vote) from an attendee already under a
ban - using only infrastructure that already exists in this project
(`event_settings`, `attendees.banned_until`).

**Resolved before writing this spec (split already approved separately;
each point below is inferred from repository evidence, not invented from
nothing):**

1. **"Browser-token throttling" and "rate limiting" are the same
   mechanism.** This project has no IP tracking anywhere - the opaque
   per-device `attendees.token` is the only identity signal it has ever
   used (Feature 12). There is nothing else a rate limit could key on.
2. **The rate limit and the ban-escalation trigger both key on combined
   question+reply submission counts per attendee**, not per-event totals
   and not separate counters per content type - an attendee alternating
   between questions and replies to dodge a per-type limit would defeat a
   split counter, and both content types share the same abuse concern
   (flooding the feed).
3. **Voting is not rate-limited and does not count toward the ban
   trigger.** Votes already have a hard per-(attendee, question) unique
   constraint (Feature 14) preventing the obvious spam vector, and rapid
   voting across many distinct real questions during a live event is the
   normal, intended use of the feature, not abuse - throttling it would
   break Feature 14's own core loop. A ban from another trigger still
   blocks voting entirely (point 5 below).
4. **"Duplicate protection" needs no new code.** Feature 15 already ships
   a fully independent, admin-configurable `duplicate_check_strictness`
   setting. Nothing here couples the new tier setting to it (silently
   overwriting an admin's independent strictness choice whenever they
   changed the abuse tier would be a surprising, unrequested side effect,
   not a feature) - the two settings simply coexist, each doing its own
   job.
5. **A ban is a full write restriction, not just a submission throttle.**
   Once `attendees.banned_until` is in the future, that attendee is
   blocked from submitting a question, submitting a reply, *and* voting -
   "temporary ban" reads as "you cannot participate," not "you cannot
   post text."
6. **The tier is a single per-event setting, not per-user-visible
   numbers.** Matching `moderation_mode`/`anonymity_mode`/
   `duplicate_check_strictness`'s exact precedent (a Postgres enum,
   admin-selected from a fixed set), the concrete thresholds behind each
   tier are fixed constants in code, not additional admin-configurable
   fields - the build-plan line names three tiers, not a numeric-limits
   admin panel.
7. **Tier thresholds (fixed, disclosed defaults - not sourced from any
   plan document, since none exists):**

   | Tier | Reject after (per 30s) | Auto-ban after (per 10 min) | Ban duration |
   |---|---|---|---|
   | `open` | no limit | never | - |
   | `standard` | 5 submissions | 20 submissions | 15 minutes |
   | `strict` | 3 submissions | 10 submissions | 30 minutes |

   Default tier for new/existing events: `standard` - matching this
   project's general "secure by default, admin can loosen" posture
   (compare `require_attendee_name`/`require_attendee_type` defaulting to
   requiring input, not skipping it).

## In scope

- **New migration:** `create type public.abuse_protection_tier as enum
  ('open', 'standard', 'strict'); alter table public.event_settings add
  column abuse_protection_tier public.abuse_protection_tier not null
  default 'standard';` - the enum-plus-`alter table` shape every prior
  fixed-set setting in this project already uses.
- **`server/utils/enforce-abuse-protection.ts` (new).** Two exports:
  - `isAttendeeBanned(attendeeId): Promise<boolean>` - true when
    `attendees.banned_until` is set and in the future.
  - `enforceSubmissionRateLimit(attendeeId, tier):
    Promise<{ allowed: true } | { allowed: false, error: string }>` -
    calls `isAttendeeBanned` first (same restricted-message result if
    already banned); for `'open'`, returns `{ allowed: true }`
    immediately; otherwise counts this attendee's `questions` +
    `replies` rows created in the tier's ban window - meeting or
    exceeding the ban threshold sets `banned_until` to now plus the
    tier's ban duration and returns the restricted-attendee error;
    otherwise counts the same combined total in the tier's shorter
    rate-limit window - meeting or exceeding that count returns the
    "submitting too quickly" error; otherwise `{ allowed: true }`. Both
    functions create their own `useSupabaseServiceRole()` client
    internally rather than taking one as a parameter - matching
    `verify-moderator-session.ts`'s exact precedent for a shared server
    util, found during implementation and followed instead of the
    parameterized signature originally drafted in this spec.
- **`server/api/questions.post.ts` (edit).** Add
  `abuse_protection_tier` to the existing `event_settings` select; call
  `enforceSubmissionRateLimit` right after resolving `attendee` and
  before the text-length check; on `allowed: false`, respond 429 with
  the returned error and insert nothing.
- **`server/api/replies.post.ts` (edit).** Same addition, same
  insertion point (after resolving `attendee`, before the text-length
  check).
- **`server/api/votes.post.ts` (edit).** Call `isAttendeeBanned` right
  after resolving `attendee`; on `true`, respond 429 with the
  restricted-attendee error and insert nothing. No rate-limit call here
  per the resolved note above.
- **Admin Settings tab (`/admin/events/[id].vue`, edit).** One new
  `USelect` ("Abuse protection": Open / Standard / Strict, mapping to
  `open`/`standard`/`strict`) fetched and saved alongside the tab's
  existing settings, same pattern as every other single-select setting
  on that tab.

## Out of scope

- **CAPTCHA.** No provider is named anywhere in the plans; split out to
  a new build-plan item (42) rather than guessing a vendor here.
- **Blocked-term filtering.** Global, Administrator-scoped, and needs a
  new table and a new admin page - Feature 30b's job entirely.
- **Any change to `duplicate_check_strictness`** - per the resolved note
  above, this feature does not read, write, or otherwise couple to it.
- **A manual moderator/admin "ban this attendee" action.** Nothing in
  Features 19-24's moderation build-plan items names one, and this
  feature only wires the *automatic*, tier-driven ban this build-plan
  line describes. A manual ban control is a separate, unspecified
  feature if ever wanted.
- **Exposing the tier, ban state, or rate-limit thresholds to the
  attendee-facing context endpoint** - nothing in the attendee UI needs
  to branch on this event's tier or the current attendee's standing; the
  rejection error message is the only attendee-visible signal.
- **Rate-limiting or ban-gating attachment uploads or content reports**
  - not named in this build-plan line; `attachments.post.ts` and the
  `report.post.ts` routes are unchanged.
- **Un-banning early, or any admin visibility into who is currently
  banned** - `banned_until` simply expires on its own; no admin UI reads
  or clears it in this feature.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Migration: abuse protection tier** per the contract above.
      **Done when:** the migration file exists, matching this project's
      enum-plus-`alter table` convention; applying it (outside this
      skill) is required before later steps can be verified live.
- [x] 2. **Shared enforcement helper** -
      `server/utils/enforce-abuse-protection.ts` per the contract above.
      **Done when:** code builds; for `'open'`, `enforceSubmissionRateLimit`
      always returns `{ allowed: true }` without querying counts; for
      `'standard'`/`'strict'`, the ban check runs before the rate-limit
      check and a ban sets `banned_until` before returning (confirmed by
      code review, since exercising real data requires a live database
      outside this skill).
- [x] 3. **Wire into question and reply submission** -
      `questions.post.ts` and `replies.post.ts` per the contract above.
      **Done when:** code builds; both routes call the helper before any
      text validation and return 429 with its error on rejection,
      inserting nothing.
- [x] 4. **Wire the ban check into voting** - `votes.post.ts` per the
      contract above.
      **Done when:** code builds; the route calls `isAttendeeBanned`
      before the vote insert and returns 429 with the restricted-attendee
      error when true, inserting nothing.
- [x] 5. **Admin tier setting** - the Settings tab addition in
      `/admin/events/[id].vue` per the contract above.
      **Done when:** code builds; setting and saving the tier persists it,
      confirmed by a read-only query once the migration is applied.

## Files / areas

- `supabase/migrations/20260910100000_add_abuse_protection_tier.sql` (new)
- `server/utils/enforce-abuse-protection.ts` (new)
- `server/api/questions.post.ts` (edit)
- `server/api/replies.post.ts` (edit)
- `server/api/votes.post.ts` (edit)
- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

- **`event_settings.abuse_protection_tier`** - Postgres enum `'open' |
  'standard' | 'strict'`, `not null default 'standard'`.
- **Tier thresholds are fixed constants in
  `enforce-abuse-protection.ts`**, per the table in the resolved notes
  above - not stored, not admin-configurable beyond the tier choice
  itself.
- **Ban state reuses `attendees.banned_until`** (already present since
  Feature 1, unused until now) - a future timestamp means banned; this
  feature never reads or writes any other column to represent ban state.
- **Rate-limit and ban-window counts are computed live on every
  submission** (`count`-only queries against `questions`/`replies`
  filtered by `attendee_id` and `created_at`), never cached or stored -
  identical in spirit to every other live-computed count in this project
  (vote counts, report counts).
- **Response shape on rejection:** `{ success: false, data: null, error:
  string }` with HTTP 429, matching this project's existing envelope
  exactly; only the status code (429, not 400/404) is new to this
  project, chosen because it is the standard HTTP code for
  rate-limiting and this project has never needed it before.
- **Authorization/tenant scope:** unchanged from the routes' existing
  checks - the helper takes an already-resolved, already-event-scoped
  `attendeeId` (an `attendees` row only ever belongs to one event per
  Feature 12), so no additional `event_id` filter is needed in the
  helper's own queries.

## Testing

No test runner configured; `npm run build` is the automated check for all
five steps. **Not yet exercised live:** a real burst of submissions
actually triggering the reject threshold, a real escalation to an
automatic ban, and a banned attendee actually being blocked from voting -
all require a dev server and real timestamped rows, the same caveat
recorded for every prior feature that could not start a server from this
skill.

`npm run build` was run after all five steps and passed cleanly (only
pre-existing, unrelated dependency deprecation warnings appeared);
`questions.post.mjs`, `replies.post.mjs`, and `votes.post.mjs` all grew in
the build output, confirming the new imports compiled correctly.

## Notes for the AI

- Do not add any admin-configurable numeric fields for the rate-limit or
  ban thresholds - the tier selection is the only exposed control, per
  the resolved note above.
- Do not touch `duplicate_check_strictness` anywhere in this feature.
- Do not rate-limit or ban-gate votes beyond the ban check itself - no
  count-based throttle on `votes.post.ts`.
- Do not build a manual ban/unban admin or moderator action - out of
  scope, per the note above.
- Do not integrate a CAPTCHA provider or reference one by name - deferred
  to build-plan item 42.
- Reuse `attendees.banned_until` exactly as it already exists; do not add
  a new ban-state column.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
