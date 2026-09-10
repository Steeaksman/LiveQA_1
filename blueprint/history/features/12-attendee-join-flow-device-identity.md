## Feature 12: Attendee join flow & device identity

**Branch:** `feature/attendee-join-flow-device-identity`
**Status:** verified

## Goal

Let an anonymous Attendee reach a live event at `/e/<slug>`, optionally enter
a name and pick an attendee type (each independently admin-configurable as
required or optional), and be identified afterward by an opaque per-device
token - the foundation Features 13+ build the actual Q&A feed on top of.

## In scope

- Two new `event_settings` columns (migration): `require_attendee_name
  boolean not null default false`, `require_attendee_type boolean not null
  default false`.
- Two new switches on the existing Settings tab of
  `/admin/events/[id].vue` ("Require attendee name", "Require attendee
  type"), fetched/saved alongside the tab's existing fields.
- **Why this must go through new server routes, not the anon Supabase
  client:** `events`, `event_settings`, and `attendee_types` all deny
  anon read entirely (administrator/Event-Manager-only RLS, Feature 1),
  and `attendees` was left with RLS enabled and *no* policies at all,
  with an explicit schema comment naming this feature as the one that
  defines real access: *"Attendee/moderator/Q&A tables: RLS enabled, no
  policies. Default-deny for anon/authenticated... until Features 12, 19,
  and 25 define real access rules."* This feature defines that access as
  two service-role server routes, the same pattern Feature 6 already
  established for `/join`.
- `server/api/events/[slug].get.ts`: given a slug, returns the live
  event's public join-page context - `{ id, name, welcomeText,
  accentColor, backgroundColor, themeMode, requireAttendeeName,
  requireAttendeeType, attendeeTypes: [{ id, label }] }` - only when
  `status = 'live'` and not soft-deleted; otherwise the generic `{
  success: false, error: 'Event not found.' }` (no distinction between
  malformed slug, unknown slug, deleted event, or a real but non-live
  event, matching `/join`'s established anti-enumeration convention for
  the only other anonymous-facing endpoints in this app).
- `server/api/attendees/join.post.ts`: body `{ eventId, token,
  displayName?, attendeeTypeId? }`. Re-verifies the event is live by
  `eventId` (never trusts the client's cached context - a fresh check at
  the point of mutation). Get-or-create by `(event_id, token)`: if an
  attendee row already exists for that pair, returns it unchanged
  (ignoring any newly supplied `displayName`/`attendeeTypeId` - identity
  is set once, at first join); otherwise validates `displayName`
  (required and non-empty when `require_attendee_name` is true, trimmed,
  capped at 100 characters) and `attendeeTypeId` (required when
  `require_attendee_type` is true **and** the event currently has at
  least one non-deleted attendee type - an admin requiring a type on an
  event with zero types configured cannot lock out every attendee; when
  provided, must reference a real, non-deleted attendee type belonging to
  *this* event, never trusted blindly), then inserts and returns the new
  row (`{ attendeeId }`).
- `app/utils/device-identity.ts`: `getDeviceIdentity(eventId: string): {
  token: string, joined: boolean }` (reads `localStorage`, generating and
  persisting a fresh `crypto.randomUUID()` token keyed by the event's
  immutable `id` - never by `slug`, which Feature 6 already made editable
  - on first read for that event) and `markDeviceJoined(eventId: string):
  void`. Both wrap their `localStorage` calls in `try/catch`: when storage
  is unavailable (private browsing, disabled storage), fall back to an
  in-memory token for the current page load only - a known, expected
  degraded case, not a crash.
- `app/pages/e/[slug].vue` (no `admin` middleware - fully public): loads
  the join context via `useFetch('/api/events/' + slug)`; a `notFound`
  state renders "Event not found." and stops. Otherwise: if this device
  already has `joined: true` locally for this event's `id`, skip straight
  to a placeholder confirmation ("You're in!"). Otherwise render a join
  form - a Name field (always shown, `required` only when
  `requireAttendeeName`), an attendee-type `USelect` (shown only when
  `attendeeTypes.length > 0`, `required` only when `requireAttendeeType`),
  and a "Join" button. Submitting posts to `/api/attendees/join` with the
  device's token; on success, marks the device joined locally and shows
  the same placeholder confirmation; on failure, shows the returned
  message inline.

## Out of scope

- **The actual Q&A feed, submitting a question, or voting** - Feature 13
  (Public Q&A feed) and Feature 14 (Voting). After a successful join, this
  feature shows a plain placeholder ("You're in! Check back soon.") - the
  same expected, named forward-reference gap Features 6-8 already
  established for pages/routes a later feature completes.
- **Applying `accentColor`/`backgroundColor`/`themeMode` visually to this
  page.** Feature 11a stored these values for a later attendee-facing
  feature to apply; this feature is that consumer only for the
  *mechanism* (fetching and returning them), not for a full visual
  treatment - no design reference or color/typography system for the
  attendee UI exists anywhere in this project yet, and inventing one here
  would be guessing at an undefined visual contract. This page renders
  with the same plain, unstyled-beyond-Nuxt-UI-defaults look every other
  page in this app already uses.
- **Rate limiting, duplicate-submission throttling, or per-browser abuse
  protection** on `/api/attendees/join` - Feature 30 (Abuse protection
  modes) owns all of that.
- **Bans.** `attendees.banned_until` exists in the schema but nothing sets
  it yet (Feature 30); this feature's get-or-create logic does not check
  or branch on it.
- **Editing identity after joining** (changing name/attendee type) -
  Feature 17 (My Questions & attendee edit/delete) is the natural home for
  attendee-facing profile changes, not this one.
- Any change to `submissions_open`/`voting_open` gating - joining an event
  is independent of whether submissions or voting are currently open;
  nothing here reads or enforces those flags.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Join-requirement settings migration** - new migration adding
      `require_attendee_name boolean not null default false` and
      `require_attendee_type boolean not null default false` to
      `event_settings`.
      **Done when:** the migration file exists, matching this project's
      plain `alter table` convention; applying it (outside this skill) is
      required before later steps can be verified live.
- [x] 2. **Admin settings toggles** - in `/admin/events/[id].vue`'s
      Settings tab: add "Require attendee name" and "Require attendee
      type" `USwitch` fields, fetched in the existing `event_settings`
      query and saved in the existing `saveSettings()` update.
      **Done when:** code builds; toggling and saving both switches
      persists them, confirmed by a read-only query once the migration is
      applied.
- [x] 3. **Event join-context endpoint** - `server/api/events/[slug].get.ts`
      per the contract above, using the service-role client (mirroring
      `join.post.ts`'s pattern).
      **Done when:** requesting a real live event's slug returns its
      context including current attendee types; requesting a draft
      event's slug, a deleted event's slug, or an unknown slug all return
      the same generic "Event not found." response.
- [x] 4. **Attendee join endpoint** - `server/api/attendees/join.post.ts`
      per the contract above.
      **Done when:** joining a live event with a fresh token creates one
      `attendees` row with the submitted name/type, confirmed by a
      read-only query; joining again with the same token returns the same
      row unchanged even if different name/type values are sent; omitting
      a required name or type returns a clear validation error without
      creating a row; submitting an attendee-type id from a different
      event is rejected.
- [x] 5. **Device identity utility** - `app/utils/device-identity.ts` per
      the contract above.
      **Done when:** code builds; calling `getDeviceIdentity` twice for
      the same event id in the same browser returns the same token both
      times.
- [x] 6. **`/e/<slug>` join page** - `app/pages/e/[slug].vue` per the
      contract above.
      **Done when:** visiting a real live event's `/e/<slug>` shows the
      join form with the correct required/optional fields per that
      event's settings; submitting it joins successfully and shows the
      placeholder confirmation; reloading the page afterward skips
      straight to the confirmation without resubmitting; visiting a
      draft event's slug, or a nonexistent slug, shows "Event not found."

## Files / areas

- `supabase/migrations/<timestamp>_add_attendee_join_requirements.sql` (new)
- `app/pages/admin/events/[id].vue` (edit - two Settings toggles)
- `server/api/events/[slug].get.ts` (new)
- `server/api/attendees/join.post.ts` (new)
- `app/utils/device-identity.ts` (new)
- `app/pages/e/[slug].vue` (new)

## Data / contracts

- **This is the feature the schema itself names as owning `attendees`
  access.** Both new server routes use the service-role client precisely
  because anon has no legitimate RLS-scoped path to `events`,
  `event_settings`, `attendee_types`, or `attendees` - this is not a
  workaround, it is the planned architecture recorded in Feature 1's own
  migration comments.
- **The device token is keyed by the event's immutable `id`, never its
  `slug`.** Feature 6 made `slug` admin-editable; keying local storage by
  it would silently orphan a returning attendee's identity if an admin
  ever renamed the event.
- **Identity is set once, at first join, and never overwritten by a later
  call with different values.** The join endpoint's get-or-create always
  returns the first-created row for a given `(event_id, token)` pair -
  changing a name or attendee type after joining is a different feature's
  job (see Out of scope).
- **An attendee-type id is only ever trusted after checking it belongs to
  the target event's current, non-deleted `attendee_types`** - this is
  the one place this feature validates a client-supplied foreign key
  against server-fetched truth rather than the request body.
- **One shared "Event not found." message covers every reason a slug
  might not resolve** on the context endpoint, matching `/join`'s
  precedent - malformed, unknown, draft, and deleted are indistinguishable
  to an anonymous caller.
- **`localStorage` failures are an expected, handled case, not an
  unexpected error** - both device-identity functions degrade to an
  in-memory token rather than throwing.

## Testing

No test runner configured; `npm run build` is the automated check for the
TypeScript/Vue/server-route changes (steps 2-6). The migration (step 1)
is not executed by any build or test command in this project, matching
Features 1, 4b, and 11a. `getDeviceIdentity` is a good future unit-test
candidate (given a fresh vs. an existing `localStorage` entry, does it
return a stable token) once `/tests` exists.

**Not yet exercised live:** the full join flow end to end (required and
optional name/type combinations, the "already joined" skip-the-form path,
the not-found path for a draft/unknown slug, and the cross-event
attendee-type rejection), which requires the migration to be applied
first. This implementation pass did not start a dev server or apply the
migration; these are build-verified only so far (`npm run build` passed
after all six steps), the same caveat recorded for Features 6-11a.

**Implementation note beyond the spec's literal wording:** `/e/<slug>` is
the first page in this codebase that is actually server-rendered (every
other page lives under `/admin/**`, which `nuxt.config.ts` already opts
out of SSR). Reading `localStorage` synchronously during component setup
- as originally written - would have produced a hydration mismatch
(the server always renders "not joined," while a second client-side setup
pass could read a real `joined: true` before the DOM mounts). The
join-status check was moved into `onMounted` so the server and the
client's first render agree, and the "already joined" swap happens as a
normal post-mount reactive update instead.

## Notes for the AI

- Do not build the Q&A feed, question submission, or voting here - render
  only the plain placeholder confirmation after a successful join.
- Do not apply `accentColor`/`backgroundColor`/`themeMode` to this page's
  visual styling - fetch and return them (the mechanism), but leave actual
  theming to a later, explicitly designed pass.
- Do not add rate limiting, throttling, or ban-checking to the join
  endpoint - Feature 30's job, not this one's.
- Do not key device identity by `slug` - use the event's `id`, returned by
  the context endpoint.
- Do not let the join endpoint trust a client-supplied `displayName`
  or `attendeeTypeId` on an already-joined device - once a row exists for
  `(event_id, token)`, return it as-is.
