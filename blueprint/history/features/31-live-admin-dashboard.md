## Feature 31: Live admin dashboard

**Branch:** `feature/live-admin-dashboard`
**Status:** verified

## Goal

Give an Administrator or an Event Manager with access to a specific event
one dashboard tab showing that event's active attendee/moderator counts,
question counts by state, the top-voted question, the current topic, and
submission/voting state - the admin-facing surface both Feature 25 and
Feature 26 explicitly deferred to this feature when they shipped.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **Question counts, top-voted question, and current topic need a new
   server route - there is no existing RLS path to read them.** Feature
   1's blanket comment says Q&A tables (`questions`, `votes`, `topics`)
   are RLS-enabled with no general read policy for `anon`/`authenticated`;
   the only exception is Feature 25/28b's narrow Realtime-signal grants
   (`questions_realtime_select`/`votes_realtime_select`/
   `replies_realtime_select`), which expose only `id`/`event_id`/
   `question_id` - never `text`, `approval_status`, or vote counts - and
   only for already-public rows. An admin dashboard needs full-state
   visibility (including pending/rejected), so this feature adds one new
   service-role route rather than a new RLS policy surface.
2. **This stays on polling, not a new authenticated Realtime
   subscription**, for the numeric/content data. The existing public-only
   Realtime grant can't signal a *pending* question arriving anyway (its
   `USING` clause requires `visibility = 'public'`), so it can't drive
   this dashboard's state counts even if reused. Building a second,
   broader RLS-gated Realtime grant for `authenticated` admins would be
   this project's first authenticated-Realtime surface, for a
   low-traffic, admin-only view where the moderator queue's own
   15-second poll already proves "good enough for live" - the same
   complexity-versus-benefit call Feature 25 made for moderators, applied
   here by analogy for a different reason (state visibility, not an RLS
   role conflict).
3. **Active attendee/moderator counts reuse Feature 26's exact Presence
   channel (`event:<id>:questions`)**, joined read-only - the admin
   observes `presenceState()` without calling `.track()` itself. The
   build-plan line names two counts ("active attendees/moderators"), not
   three; an admin viewing the dashboard is not a participant and must
   not inflate either count.
4. **Submission/voting state needs no new fetch.** `/admin/events/[id].vue`
   already loads `submissionsOpen`/`votingOpen` from `events` on mount for
   the existing Settings tab; this feature only displays those same refs
   in the new tab.
5. **"Top-voted question" is `null` when no question has at least one
   vote** - an arbitrary zero-vote pick would not be a meaningful
   "leader." When multiple questions tie for the highest vote count, the
   oldest (by `created_at`) wins, a fixed, disclosed tie-break rather
   than an unspecified one.
6. **Both the poll and the Presence channel are scoped to the Dashboard
   tab being active**, not the whole page's lifetime - joining a Realtime
   channel and polling a new endpoint on every visit to this
   already-multi-tab page (Details, Settings, QR codes, Signage,
   Branding) regardless of which tab is open would be disproportionate;
   both start when the tab is selected and stop when it isn't.

## In scope

- **`server/api/admin/events/[id]/dashboard.get.ts` (new).**
  `verifyEventAccess(event, eventId)`-gated exactly like
  `branding-logo.get.ts`/`moderator-password.post.ts`. On success, runs
  service-role counts scoped to `event_id` and `deleted_at is null`:
  `pendingCount` (`approval_status = 'pending'`), `approvedCount`
  (`approval_status = 'approved'`), `rejectedCount` (`approval_status =
  'rejected'`), `publicCount` (`visibility = 'public'`), `answeredCount`
  (`answered = true`), `archivedCount` (`archived = true`); the
  highest-vote-count non-deleted question for this event (with its
  `votes(count)` embed, ordered by count desc then `created_at` asc,
  `limit(1)`), returned as `{ id, text, voteCount }` or `null` when the
  top result's count is `0` or no questions exist; and the event's
  current topic (`topics` where `is_current = true`, not deleted),
  returned as `{ name }` or `null`.
- **`app/pages/admin/events/[id].vue` (edit).**
  - New `'dashboard'` entry in the `activeTab` union and a tab button
    labeled "Dashboard", positioned first (before Details), matching this
    page's existing plain-button tab pattern.
  - On selecting the tab: fetch the new route once (same
    `session.access_token` Bearer pattern as `saveModeratorPassword`/
    `fetchBrandingLogos`), then start a 15-second polling interval
    (matching the moderator queue's existing cadence) that repeats the
    same fetch; on leaving the tab (or unmounting the page), clear the
    interval.
  - On selecting the tab: also open a Realtime channel named
    `event:<id>:questions` via `useSupabase()`, subscribe to presence
    sync/join/leave, and compute active attendee/moderator counts from
    `channel.presenceState()` exactly as `app/pages/m/[slug].vue` already
    does - without calling `.track()`. Remove the channel on leaving the
    tab or unmounting.
  - Dashboard panel renders: active attendees / active moderators (from
    Presence), the six question-state counts, the top-voted question's
    text and vote count (or "No votes yet." when `null`), the current
    topic's name (or "None set." when `null`), and the already-loaded
    `submissionsOpen`/`votingOpen` values.

## Out of scope

- **Any new RLS policy or a new authenticated Realtime channel for
  content data** - per the resolved note above; this feature adds one
  service-role route instead.
- **Tracking the admin's own presence**, or a third "active admins"
  count - not named by this build-plan line; the admin only observes.
- **Historical charts, trends over time, or any persisted snapshot of
  dashboard state** - every value here is computed live on each poll,
  nothing is stored.
- **A cross-event or global dashboard** - this is one more tab on the
  existing single-event management page, scoped to that event only,
  matching every other tab on this page.
- **Exporting dashboard data** - Feature 34's job (event reporting &
  export), unrelated to this live view.
- **Polling or subscribing while any other tab is active** - per the
  resolved note above, both the poll and the Presence channel are scoped
  to the Dashboard tab specifically.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Dashboard aggregation route** -
      `server/api/admin/events/[id]/dashboard.get.ts` per the contract
      above.
      **Done when:** code builds; a missing/invalid bearer token returns
      401 "Not authorized." (confirmed by code review, since exercising a
      real Supabase project is outside this skill); the six counts,
      top-voted question, and current topic are computed and returned in
      one response.
- [x] 2. **Dashboard tab: counts, top-voted question, current topic,
      submission/voting state** - the `activeTab`/fetch/poll additions in
      `/admin/events/[id].vue` per the contract above (Presence deferred
      to step 3).
      **Done when:** code builds; selecting the Dashboard tab fetches and
      displays the six counts, the top-voted question or "No votes yet.",
      the current topic name or "None set.", and the existing
      submissions/voting state; leaving the tab stops the polling
      interval (confirmed by code review of the interval lifecycle).
- [x] 3. **Dashboard tab: active attendee/moderator counts** - the
      Presence channel addition in `/admin/events/[id].vue` per the
      contract above.
      **Done when:** code builds; selecting the tab joins
      `event:<id>:questions` and computes both counts from
      `presenceState()` without tracking the admin's own presence;
      leaving the tab or unmounting removes the channel.

## Files / areas

- `server/api/admin/events/[id]/dashboard.get.ts` (new)
- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

- **Response shape:** `{ success, data: { pendingCount, approvedCount,
  rejectedCount, publicCount, answeredCount, archivedCount,
  topVotedQuestion: { id, text, voteCount } | null, currentTopic: { name }
  | null }, error }`, matching this project's envelope exactly.
- **Authorization:** `verifyEventAccess(event, eventId)`, identical to
  `branding-logo.get.ts` - re-derives the caller from their bearer token
  and fresh service-role lookups, never a client-supplied id or role.
- **No new migration, no new RLS policy, no new database column** -
  every value is computed live from existing tables by the service role.
- **Presence payload and channel name are unchanged from Feature 26** -
  `event:<id>:questions`, `{ role: 'attendee' | 'moderator' }` - this
  feature only adds a third, non-tracking observer of the same channel.
- **Polling cadence:** 15 seconds while the Dashboard tab is active,
  matching the moderator queue's existing interval exactly - not a new,
  independently-chosen number.

## Testing

No test runner configured; `npm run build` is the automated check for all
three steps. **Not yet exercised live:** the aggregation route's counts
against real data, the poll actually refreshing the panel, and the
Presence-derived counts matching real attendee/moderator tabs - all
require a dev server and a real Supabase project, the same caveat
recorded for every prior feature that could not start a server from this
skill.

`npm run build` was run after all three steps and passed cleanly (only
pre-existing, unrelated dependency deprecation and plugin-timing warnings
appeared); the new `dashboard.get.mjs` route registered correctly in the
build output.

## Notes for the AI

- Do not add a new RLS policy or a new authenticated Realtime
  subscription for question/vote/topic content - reuse the existing
  service-role, `verifyEventAccess`-gated route pattern instead.
- Do not track the admin's own presence on the shared channel - observe
  only, per the resolved note above.
- Do not run the poll or hold the Presence channel open while a
  different tab is active - both are scoped to the Dashboard tab's
  selected lifetime.
- Do not invent a fallback "top-voted" pick when every question has zero
  votes - return `null`, per the resolved note above.
- Do not add charts, history, or export - this is a live snapshot view
  only.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
