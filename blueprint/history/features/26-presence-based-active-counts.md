# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 26: Presence-based active counts

**Branch:** `feature/presence-based-active-counts`
**Status:** verified

## Goal

Show a moderator roughly how many attendees and how many fellow
moderators currently have the event open, using Supabase Realtime
Presence - a different Realtime primitive from Feature 25's
`postgres_changes`, and one that sidesteps the RLS/anon-role problem
that feature deliberately left unsolved for moderators.

**Scope note (resolved before writing this spec, not asked to the
user):**

1. **"Admin views" - disclosed, not asked**, the same gap Feature 25
   already recorded: no admin page shows any live Q&A/attendance data
   yet (Feature 31, "Live admin dashboard," is where that will live).
   There is nothing on the admin surface for this feature to wire up.
2. **This does not contradict Feature 25's moderator-stays-on-polling
   decision.** That decision was specifically about `postgres_changes`,
   which is gated by RLS on the connecting Postgres role - and
   moderators and attendees share the same `anon` role, so RLS can't
   tell them apart for *table reads*. **Presence has no such gate**: it
   is an ephemeral, per-connection broadcast of whatever small payload a
   client chooses to track, never a database read, so there is no
   privacy boundary to cross by letting moderators track and observe it
   too.

## In scope

- **`app/pages/e/[slug].vue` (edit).** The existing Realtime channel
  Feature 25 already opens on mount (`event:<id>:questions`) now also
  calls `.track({ role: 'attendee' })` on itself once subscribed -
  reusing that exact channel rather than opening a second one, since a
  single Supabase Realtime channel can carry `postgres_changes`
  listeners and Presence tracking together. This runs regardless of
  whether the device has completed Feature 12's "join" flow - simply
  having the page open is what "active" means here; no UI change on
  this page, it only broadcasts. Untracked automatically on unmount
  (removing the channel already stops presence).
- **`app/pages/m/[slug].vue` (edit).** Once authenticated, opens a
  channel with the **exact same name** (`event:<id>:questions`) via the
  existing `useSupabase()` client, calls `.track({ role: 'moderator'
  })`, and listens for `presence` sync/join/leave events to recompute
  two counts from `channel.presenceState()`: the number of tracked
  presences with `role: 'attendee'` and the number with `role:
  'moderator'` (no deduplication across multiple tabs from the same
  device or browser - "approximate," per the build-plan's own word, not
  precise). Displays both counts in the queue header (e.g., "`N` active
  attendees - `M` active moderators"). The channel is removed on
  unmount and when `authenticated` goes false (mirroring the existing
  poll-timer lifecycle already wired to that same flag).

## Out of scope

- **Any admin-facing presence display** - no admin view exists yet to
  show it; Feature 31's job.
- **Deduplicating multiple tabs/devices, or any precision beyond a raw
  connection count** - "approximate" is the build-plan's own word.
- **Persisting presence anywhere** - it is purely ephemeral Realtime
  channel state; nothing here writes to the database.
- **Showing individual attendee/moderator identity in the presence
  payload** - tracked state is only `{ role: 'attendee' | 'moderator'
  }`, nothing else.
- **A moderator-authorized Realtime channel for anything beyond
  presence** - Feature 25's `postgres_changes` decision for moderators
  is unchanged; this feature only adds Presence, a different primitive.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Attendee presence tracking** - `app/pages/e/[slug].vue` per
      the contract above.
      **Done when:** code builds; the existing Realtime channel tracks
      `{ role: 'attendee' }` once subscribed, with no visible change to
      the page itself.
- [x] 2. **Moderator presence tracking + display** -
      `app/pages/m/[slug].vue` per the contract above.
      **Done when:** code builds; the moderator's own presence is
      tracked as `{ role: 'moderator' }`, the header shows both counts
      computed from `presenceState()`, and the channel is torn down on
      unmount/deauth.

## Files / areas

- `app/pages/e/[slug].vue` (edit)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **No new migration and no new server route.** Presence is a client-only
  Realtime primitive; nothing here touches the database.
- **The two features' channels are the same channel, by name, on
  purpose** - a moderator can only see attendee presence because both
  pages join `event:<id>:questions` specifically, not because of any new
  authorization mechanism.
- **The tracked payload is minimal and non-identifying**: `{ role:
  'attendee' | 'moderator' }` only - never an attendee id, device token,
  or moderator session token.
- **Counts are recomputed locally from `presenceState()` on every sync/
  join/leave event** - there is no server-side aggregation and no
  persisted count anywhere.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue changes (both steps - no migration is needed).

**Not yet exercised live:** the full presence flow end to end (an
attendee tab appearing in the moderator's count, a moderator's own
count incrementing when a second moderator opens the queue, and both
counts decrementing when a tab closes). This implementation pass did
not start a dev server; these are build-verified only (`npm run build`
passed after both steps).

## Notes for the AI

- Do not open a second Realtime channel on the attendee page - reuse
  Feature 25's existing one.
- Do not build any admin-facing presence UI - no admin view exists yet.
- Do not track anything beyond `{ role: 'attendee' | 'moderator' }` in
  the presence payload.
- Do not attempt deduplication across tabs or devices - approximate
  counts are the explicit target.
- Do not treat this as reopening Feature 25's moderator-`postgres_changes`
  decision - Presence is a different primitive with no RLS gate.
