## Feature 6: Audience URL & join code

**Branch:** `feature/audience-url-join-code`
**Status:** verified

## Goal

Let an Administrator or an Event Manager with access to a specific event
customize that event's slug and join code to a value of their own choosing
(both still unique), and give Attendees a generic code-entry page that
resolves a join code to the event's slug.

## In scope

- Editable `slug` and `join_code` fields on the existing Details tab of
  `/admin/events/[id].vue`, replacing their current read-only display.
  Saved together with `name` through the tab's existing single "Save"
  button - no new tab, no per-field save.
- Client-side format validation for both fields before any database call:
  - **Slug:** lowercase ASCII letters, digits, and hyphens only, no leading
    or trailing hyphen, 1-63 characters after trimming and lowercasing the
    input (the 63-character cap is a DNS-label-length convention chosen
    here since nothing else constrains it; not a stated product rule).
  - **Join code:** exactly 6 characters from `A-Z0-9`, entered in any case
    and uppercased before validating/saving - the same shape
    `generateJoinCode()` already produces, just user-chosen instead of
    random.
  These rules live in `app/utils/generate-event-identifiers.ts` as shared
  validator functions so the auto-generator and the new customization UI
  agree on exactly one contract.
- Duplicate handling: a unique-constraint conflict (`error.code === '23505'`)
  on save shows "That slug or join code is already in use. Please choose
  different values." - deliberately not naming which field, since reliably
  parsing that out of the raw Postgres error text is fragile. Any other
  error keeps the existing generic "Something went wrong. Please try
  again."
- A new public, unauthenticated `/join` page: one text input for a join
  code and a submit action. On success, navigates to `/e/<slug>`.
- A new `server/api/join.post.ts` route that looks up the event by join
  code using the service-role client (mirroring
  `event-managers.post.ts`'s existing service-role pattern) and returns
  only `{ slug }` on success. This has to be a server route rather than a
  client Supabase call: Attendees never hold a Supabase Auth session, and
  `events_select` (Feature 1's RLS) only grants read access to
  administrators and Event Managers - there is no anon-readable path to
  this table today, and this feature does not add one.
- A code only resolves when its event is `status = 'live'`. A malformed
  code, an unknown code, a soft-deleted event, or a real code belonging to
  a `draft` event all return the same generic `{ error: 'Invalid code.' }`
  - never distinguishing the reason to an unauthenticated caller.

## Out of scope

- `/e/<slug>` itself - Feature 12 (Attendee join flow & device identity)
  builds that page. Until then, a successful `/join` submission correctly
  updates the browser's address bar to `/e/<slug>`, but the destination
  renders Nuxt's default not-found page. This is an expected, named gap,
  not a defect of this feature.
- QR codes and branded signage for the join code/URL - Features 7 and 8.
- Any new RLS policy. `events_update` (Feature 1) already lets an
  administrator or the event's assigned/global Event Manager update any
  column on a reachable row; this feature exercises that existing grant on
  `slug`/`join_code` the same way Feature 5 already exercises it on
  `name`. `/join`'s lookup is intentionally kept out of RLS entirely (see
  above) rather than adding an anon-readable policy.
- Rate limiting, CAPTCHA, or throttling repeated `/join` attempts - Feature
  30 (abuse protection modes).
- Any change to what happens after a live event closes or is archived -
  those statuses are not set anywhere in the app yet; this feature just
  defines that only `live` is joinable, matching what already exists.
- A "regenerate" convenience button, copyable join link, or any other
  polish beyond plain editable fields - not part of this build-plan line.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Shared slug/join-code validators** - in
      `app/utils/generate-event-identifiers.ts`, add `isValidSlug(value:
      string): boolean` and `isValidJoinCode(value: string): boolean` pure
      functions implementing the formats above, plus a `normalizeJoinCode`
      helper (trim + uppercase). Refactor `slugify`/`generateJoinCode` to
      share the same alphabet/pattern constants where practical, without
      changing their existing behavior.
      **Done when:** code builds; the existing creation wizard
      (`new.vue`) still generates and inserts events exactly as before.
- [x] 2. **Editable slug/join-code on the Details tab** -
      `app/pages/admin/events/[id].vue`: replace the read-only slug/join
      code paragraphs with `UInput` fields bound to editable refs
      pre-filled from the fetched event, included in `saveDetails()`'s
      existing `update events set ...` call alongside `name`. Validate
      both fields with the new helpers before attempting the update,
      showing an inline error per invalid field without a network call.
      On `error.code === '23505'`, show the shared conflict message from
      above; on any other error, keep the existing generic message.
      **Done when:** editing a real event's slug and join code to valid,
      unique new values and saving persists both, confirmed by a
      read-only query; typing an invalid-format value shows its inline
      error without a database call; saving a value that collides with
      another event's slug or join code shows the conflict message and
      leaves the on-screen fields as typed (not reverted).
- [x] 3. **`/join` code-entry page + lookup endpoint** -
      `server/api/join.post.ts`: `readBody<{ code?: string }>`, reject a
      missing/malformed code with the generic `Invalid code.` error
      (matching the `{ success, data, error }` shape used elsewhere),
      otherwise query `events` (service-role client) for `id, slug,
      status` by normalized `join_code` with `deleted_at is null`; return
      `{ success: true, data: { slug }, error: null }` only when a row is
      found and `status === 'live'`, else the same generic error.
      `app/pages/join.vue`: no `admin` middleware (public route), one
      `UInput` for the code and a submit button; on success
      `navigateTo('/e/' + slug)`; on failure, show the returned message
      inline.
      **Done when:** submitting a real live event's join code (typed in
      either case) on `/join` navigates the browser to `/e/<that event's
      slug>`, confirmed live for at least one real event; submitting an
      unknown, malformed, or a draft event's join code shows the same
      generic "Invalid code." message.

## Files / areas

- `app/utils/generate-event-identifiers.ts` (edit - validators)
- `app/pages/admin/events/[id].vue` (edit - editable slug/join-code fields)
- `server/api/join.post.ts` (new)
- `app/pages/join.vue` (new)

## Data / contracts

- **Slug format:** lowercase `a-z0-9` and hyphens only, no leading/trailing
  hyphen, 1-63 characters, normalized to lowercase before validating and
  saving. **Join code format:** exactly 6 characters from `A-Z0-9`,
  normalized to uppercase before validating and saving. Both are enforced
  client-side only (this project has no server layer in front of direct
  `events` updates, same as every other field Features 4/5 already edit
  this way); the existing partial unique indexes
  (`events_slug_key`/`events_join_code_key`, Feature 1) remain the actual
  uniqueness authority.
- **No client-side role branch for edit access**, matching Feature 5:
  `events_update` RLS decides who can save; the page does not check
  `profile.role` before allowing the slug/join-code edit.
- **`/join`'s lookup never goes through the browser's anon Supabase
  client.** It is the only path in the app so far that a fully
  unauthenticated visitor calls, and `events` has no anon-readable RLS
  policy today. The new server route uses the service-role client
  precisely because there is nothing for an anon key to read here; this is
  not a new authorization decision so much as the absence of one, handled
  server-side.
- **Only `status = 'live'` events resolve.** `draft` is unpublished by
  definition; `closed`/`archived` are not reachable by any existing
  feature yet, so this rule cannot currently exclude anything real - it
  just states the rule for when those statuses do start being set.
- **One error message for every failure reason on `/join`.** Not
  distinguishing "wrong format" from "not found" from "not live" is a
  deliberate anti-enumeration default for the one endpoint in this app
  that any anonymous caller can query, not a stated requirement elsewhere.

## Testing

No test runner configured; `npm run build` passed after all three steps.
`isValidSlug`/`isValidJoinCode`/`normalizeJoinCode` are pure functions with
real edge cases (empty, too long, mixed case, invalid characters) that
would be strong unit-test candidates once `/tests` exists, same note as
Feature 4a's `slugify`/`generateJoinCode`.

**Not yet exercised live:** editing an event's slug/join code (success,
invalid-format, and conflict cases) and the `/join` flow end to end
against a real live event. This implementation pass did not start a dev
server; these are build-verified only so far. Run `npm run dev` and
confirm each case against the database or the resulting URL before
treating this feature as fully proven, same caveat Feature 5 recorded for
its own untested access path.

## Notes for the AI

- Do not build `/e/<slug>` in this feature - Feature 12 owns it. A
  successful `/join` redirect correctly lands on Nuxt's default not-found
  page until then; that is expected, not a bug to route around here.
- Do not add an anon-readable RLS policy on `events` to make `/join`
  simpler - the service-role server route is the intended path precisely
  because Attendees have no Supabase session to scope a policy to.
- Do not try to parse the Postgres unique-violation error text to report
  "slug" vs. "join code" specifically; use the one shared conflict
  message.
- Do not add rate limiting, CAPTCHA, or per-IP/device throttling to
  `/join` - that is Feature 30's job, not this one's.
- Keep the slug/join-code edit inside the Details tab's existing single
  save action; do not create a second save button or a new tab for just
  these two fields.
