# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 27: Reconnect & polling fallback

**Branch:** `feature/reconnect-polling-fallback`
**Status:** verified

## Goal

Make the Realtime work from Features 25-26 resilient to a dropped
connection: react correctly when it reconnects, show the attendee and
moderator a plain indicator of connection state, and fall back to
polling on the attendee page when Realtime isn't currently connected -
closing out the "Realtime & resilience" milestone.

**Two of the six things this build-plan line names turned out to
already be satisfied by existing code (verified by reading it, not
assumed) - disclosed here rather than turned into no-op build steps:**

1. **"Preserved unsent input."** `submitQuestion()` in `/e/[slug].vue`
   only clears `questionText` after `result.success` is confirmed true;
   a failed request (including one that fails because the connection
   dropped mid-request) falls into the `catch` block, which never
   touches `questionText` - the typed text is already preserved today.
2. **"Duplicate-submission avoidance."** The submit button is already
   `:loading="submitting"`, which Nuxt UI already disables while true,
   preventing a double-click from firing two requests. This feature
   deliberately does **not** add automatic retry of a failed submission
   - retrying a mutating POST automatically, without an idempotency key
   this schema doesn't have, is exactly how a dropped-response (not
   dropped-request) scenario turns into a real duplicate question. The
   existing behavior - show the error, keep the text, let the person
   decide to click Submit again once they see they're reconnected - is
   the safer design already in place.

Both are called out explicitly so no future reader mistakes their
absence from the build steps for an oversight.

## In scope

- **`app/pages/e/[slug].vue` (edit).** The existing Realtime channel's
  `.subscribe()` callback (Features 25-26) becomes the single place
  connection state is tracked:
  - A `connectionStatus` ref (`'connected' | 'reconnecting'`), starting
    `'reconnecting'` (matches the pre-first-connect state safely for
    SSR/hydration, the same pattern `checkingSession` already uses
    elsewhere in this app).
  - On `'SUBSCRIBED'`: set `'connected'`, call `channel.track({ role:
    'attendee' })` (unchanged), **and** - only when this is a
    *reconnect*, not the first connect (tracked with a plain boolean
    flag) - call `refreshQuestions()`, since any `postgres_changes`
    events that fired while disconnected were missed entirely and
    won't be redelivered.
  - On `'CLOSED'`, `'CHANNEL_ERROR'`, or `'TIMED_OUT'`: set
    `'reconnecting'` and start a 15-second fallback poll (matching the
    moderator queue's existing interval) that calls `refreshQuestions()`
    on every tick while still not connected. Supabase's Realtime client
    already retries the underlying socket connection itself with its
    own backoff - this feature reacts to the resulting status changes,
    it does not reimplement reconnection.
  - The fallback poll stops the moment `'SUBSCRIBED'` fires again.
  - A plain text indicator near the top of the question list: "Live"
    when connected, "Reconnecting..." otherwise - no new UI dependency,
    matching this project's plain-text precedent.
- **`app/pages/m/[slug].vue` (edit).** The same connection-status
  tracking and indicator, applied to the Presence channel Feature 26
  already opens. On reconnecting to `'SUBSCRIBED'` after a drop,
  re-track presence (`channel.track({ role: 'moderator' })`) - presence
  state is cleared server-side on disconnect, so it must be resent, and
  doing so also naturally re-syncs the active counts. **No fallback poll
  is added here**: the moderator queue's 15-second poll (Features
  23/25) already runs unconditionally regardless of Realtime connection
  state, so there is nothing additional to fall back to.

## Out of scope

- **Reimplementing WebSocket reconnection itself** - Supabase's
  `realtime-js` client already retries the socket with its own backoff;
  this feature only reacts to the status transitions it produces.
- **Any automatic retry of a failed question/vote/action submission** -
  see the resolved note above; retrying a mutation without an
  idempotency key risks a real duplicate, so this is deliberately not
  built.
- **A fallback poll on the moderator queue** - it already polls
  unconditionally; there is no "fallback" state to add.
- **"Preserved unsent input" or a connection indicator for any other
  form** (topic rename, moderator password, admin settings) - the
  build-plan's own examples (re-fetch, duplicate-submission,
  connection) are all about the live public-facing surfaces; this
  feature does not extend the pattern to admin-only forms - nothing here
  asked for it.
- **A "permanently offline" or "give up reconnecting" state** - Supabase's
  client retries indefinitely; this feature does not add a distinct
  terminal failure state beyond "reconnecting."

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Attendee connection status, reconnect handling, fallback
      poll** - `app/pages/e/[slug].vue` per the contract above.
      **Done when:** code builds; the indicator reflects `'connected'`/
      `'reconnecting'`; a reconnect (`'SUBSCRIBED'` firing after a prior
      disconnect) triggers exactly one `refreshQuestions()` call and
      re-tracks presence; a disconnect starts the 15-second fallback
      poll, which stops on reconnect.
- [x] 2. **Moderator connection status + presence re-track on
      reconnect** - `app/pages/m/[slug].vue` per the contract above.
      **Done when:** code builds; the indicator reflects the presence
      channel's state; a reconnect re-tracks `{ role: 'moderator' }`;
      the existing 15-second data poll is unchanged.

## Files / areas

- `app/pages/e/[slug].vue` (edit)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **No new migration and no new server route.** Every change here is
  client-side reconnection handling and a plain status indicator.
- **"First connect" and "reconnect" are distinguished by a plain
  boolean flag**, not by inspecting Realtime internals - the first time
  `'SUBSCRIBED'` fires, no refetch happens (the page's own `useFetch`
  already loaded fresh data); every later `'SUBSCRIBED'` after a drop
  does refetch.
- **The fallback poll on the attendee page is gated strictly by
  connection state**, not a fixed timer running alongside Realtime -
  it only exists while `connectionStatus !== 'connected'`, and is torn
  down the moment the channel resubscribes.
- **Presence must be re-tracked, not assumed to persist, across a
  reconnect** - the server clears a channel's presence entries when a
  client disconnects; only re-calling `.track()` after resubscribing
  restores it.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue changes (both steps - no migration is needed).

**Not yet exercised live:** the full reconnect flow end to end (forcing
a disconnect, e.g., via dev tools network throttling or toggling
Wi-Fi, and confirming the indicator changes, the fallback poll starts
on the attendee page, and both pages recover and refetch/re-track on
reconnect). This implementation pass did not start a dev server; these
are build-verified only (`npm run build` passed after both steps).

## Notes for the AI

- Do not touch `submitQuestion()`'s existing clear-on-success-only
  behavior, or the `:loading="submitting"` guard - both already satisfy
  this feature's "preserved unsent input" and "duplicate-submission
  avoidance" requirements without any change.
- Do not add automatic retry of any failed mutation.
- Do not add a fallback poll to the moderator queue - it already polls
  unconditionally.
- Do not skip re-tracking presence after a reconnect on either page -
  it does not persist across a disconnect on its own.
- Do not refetch on the very first `'SUBSCRIBED'` event, only on a
  reconnect after a prior disconnect.
