# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 23: Moderator notifications

**Branch:** `feature/moderator-notifications`
**Status:** verified

## Goal

Give a moderator watching `/m/<slug>` an always-visible sense of how much
triage work is waiting, plus optional sound and browser-notification
alerts when a genuinely new question arrives while they're on the page.

**Scope note (resolved before writing this spec, not asked to the
user):** this build-plan item sits before Features 25-27 (Realtime sync,
presence, and the reconnect/polling fallback), so no live-push mechanism
exists yet to detect "a new question just arrived." Building one is a
reversible internal implementation detail, not a product decision - the
observable contract ("a notification fires within roughly N seconds of a
new pending question") is identical whether it's driven by a client-side
polling timer today or by a Realtime subscription once Feature 25 ships.
This feature adds a small, self-contained polling timer scoped to
notification detection only; Feature 25 is expected to replace or
supplement it later, and Feature 27's "polling fallback" is a different,
larger concern (recovering from a dropped Realtime connection across the
whole queue), not this feature's job.

## In scope

- **`app/utils/moderator-notify-prefs.ts` (new)**, mirroring
  `moderator-session.ts`'s shape: `getNotifyPrefs(): { sound: boolean,
  browser: boolean }` and `setNotifyPrefs(prefs): void`, `localStorage`-
  backed under one fixed key (`liveqa:moderator-notify-prefs` - a device
  preference, not scoped to any one event, unlike the session store)
  with the same in-memory-fallback `try/catch` pattern as every other
  client-storage util in this project. Both default to `false` (opt-in).
- **Always-on visual badge** in `/m/<slug>`'s header: "`N` pending" (or
  "No pending questions"), computed from the already-loaded queue as the
  count of questions with `approvalStatus === 'pending' && !archived` -
  no new endpoint; this is a plain re-render of state Feature 20 already
  fetches.
- **Two opt-in toggles**, below the badge: "Sound alert for new
  questions" and "Browser notification for new questions". Both persist
  through `moderator-notify-prefs.ts` immediately on change.
  - Turning on the sound toggle needs no permission and works
    everywhere Feature 19-22's UI already runs; it uses the Web Audio
    API to synthesize a short beep (`AudioContext` + an oscillator) -
    **no new dependency and no new audio asset file**, consistent with
    this project's existing zero-extra-library footprint.
  - Turning on the browser-notification toggle calls
    `Notification.requestPermission()` at that moment (a user gesture,
    as the API requires). `granted` persists the preference as on;
    `denied` or `default` reverts the toggle to off and shows an inline
    message ("Browser notifications were blocked. Enable them in your
    browser's site settings to use this.").
  - **When the `Notification` API doesn't exist at all in the current
    browser** (notably iOS Safari, which never implemented it, despite
    this project's own "moderator = tablet-first" device priority) - the
    browser-notification toggle is disabled with an inline note ("Not
    supported in this browser.") instead of silently failing later. The
    sound toggle is unaffected, since Web Audio has no such gap.
- **A 15-second polling timer**, running only while `authenticated` is
  true and cleared on unmount, that calls the existing
  `loadQueue()`/`moderation/questions.get.ts` on each tick. After the
  *first* successful load (whether from login or the initial stored-
  session check), the set of currently pending, non-archived question
  ids becomes the baseline; every tick after that diffs the freshly
  fetched set against the baseline. Any newly appeared id triggers, at
  most once per tick regardless of how many arrived that tick: a beep
  when the sound preference is on, and a browser notification (e.g.,
  "3 new questions" or "1 new question") when the browser preference is
  on and permission is currently granted. The baseline then advances to
  the new set. **The very first load never notifies** - only genuinely
  new arrivals during an open session do.

## Out of scope

- **Realtime/Supabase Realtime subscriptions** - Feature 25's job. This
  feature's polling is a deliberately temporary, narrow substitute for
  detecting new arrivals, not the app's live-sync architecture.
- **The "reconnect + polling fallback" behavior for the whole queue** -
  Feature 27's job; that is about recovering the entire moderator/
  attendee/admin view after a dropped Realtime connection, a materially
  larger concern than this feature's one narrow notification timer.
- **Presence-based active counts** - Feature 26's job.
- **Notifying about anything other than new pending questions** - not
  content reports (Feature 24), not votes, not answered/archived state
  changes, not topic changes.
- **Any notification on the attendee or admin surfaces** - this feature
  is `/m/<slug>` only.
- **Configuring the poll interval, or a "test notification" button** -
  not asked for; 15 seconds is a fixed, documented choice.
- **Persisting notification preferences server-side or per-event** - a
  device-local preference only, matching every other client-storage
  util in this project.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Notification preferences utility** -
      `app/utils/moderator-notify-prefs.ts` per the contract above.
      **Done when:** code builds; storing and re-reading preferences in
      the same browser returns the same values both times, and a fresh
      browser with no stored value returns both `false`.
- [x] 2. **Always-on pending-count badge** - `/m/<slug>` per the contract
      above.
      **Done when:** the badge reflects the current count of pending,
      non-archived questions immediately after each queue load, with no
      new network request.
- [x] 3. **Opt-in sound/browser toggles** - `/m/<slug>` per the contract
      above.
      **Done when:** toggling sound on/off persists via the prefs
      utility and survives a reload; toggling browser notifications on
      requests permission, reverts to off with the inline message on
      denial, and persists as on when granted; the browser-notification
      toggle is disabled with its inline note when `Notification` is
      undefined; the sound toggle is unaffected in that case.
- [x] 4. **Polling + new-arrival detection** - `/m/<slug>` per the
      contract above.
      **Done when:** the first load after authenticating sets the
      baseline without notifying; a subsequent poll that finds a new
      pending, non-archived question id plays the beep when sound is on
      and fires exactly one browser notification with the correct count
      when browser notifications are on and granted; a poll with no new
      ids does neither; the timer stops when the page unmounts.

## Files / areas

- `app/utils/moderator-notify-prefs.ts` (new)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **No new migration and no new server route.** This feature is entirely
  client-side, reusing the existing `moderation/questions.get.ts`
  response Feature 20 already built.
- **The notification baseline is a purely in-memory, per-page-load
  concept** - it is never persisted, never shared across browser tabs or
  moderators, and resets to "no notifications yet" every time `/m/<slug>`
  is loaded or reloaded.
- **At most one sound and one browser notification fire per poll tick**,
  regardless of how many questions arrived in that interval - this
  avoids a barrage of individual alerts when several attendees submit in
  the same 15-second window.
- **Notification preferences are a device/browser setting, not an event
  or session setting** - stored under one fixed key, unlike
  `moderator-session.ts`'s per-event keys.
- **This feature's polling is explicitly provisional**, documented so
  Feature 25 does not have to reverse-engineer why a timer exists before
  Realtime does.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue changes (all four steps - no server code or migration
is touched).

**Not yet exercised live:** the full notification flow end to end (the
badge updating across real queue changes, both permission outcomes for
browser notifications, the `Notification`-undefined fallback on a
browser that lacks it, and an actual new-question arrival being detected
within one poll interval). This implementation pass did not start a dev
server; these are build-verified only (`npm run build` passed after all
four steps).

## Notes for the AI

- Do not build Supabase Realtime, presence, or the reconnect/polling
  fallback here - this is a narrow, temporary polling timer for
  notification detection only, explicitly superseded by Feature 25.
- Do not notify on the first load after authenticating - only on
  genuinely new arrivals detected on a later poll.
- Do not fire more than one sound and one browser notification per poll
  tick, even when multiple questions arrived.
- Do not let the browser-notification toggle silently do nothing when
  `Notification` is unsupported or permission is denied - disable it
  with an inline note, or revert it to off with an inline message,
  respectively.
- Do not add a new audio asset file or dependency for the sound alert -
  synthesize it with the Web Audio API.
- Do not persist notification preferences server-side or scope them to
  an event.
