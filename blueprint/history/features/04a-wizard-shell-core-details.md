## Feature 4a: Wizard shell + core details

**Branch:** `feature/wizard-shell-core-details`
**Status:** verified

## Goal

Give an Administrator a minimal working path to create a real event (name,
a valid unique slug/join code, attendee types) and see it exist. This is
the first of three sub-features under build-plan item 4; it produces a
real `draft` event row other features can build on, not a finished wizard.

## In scope

- `/admin/events` - minimal list of existing events (name, slug, status).
  Not interactive per-row yet; Feature 5 (tabbed management) owns editing.
- `/admin/events/new` - a two-step wizard: **Details** (event name only -
  no other descriptive field exists in the `events` schema) then
  **Attendee types** (add/remove labels for this event). Finishing creates
  a real `events` row (`status: 'draft'`) immediately after the Details
  step - attendee types are added to that already-created draft, not held
  in memory until a final submit. A "Done" action returns to
  `/admin/events`.
- Client-side slug/join-code generation: derive a URL-safe slug from the
  name, generate a random join code, retry with a fresh random suffix on a
  unique-constraint conflict. Both are auto-generated only - not
  editable in this feature. Feature 6 adds the customization UI for both.
- Both new pages guarded by `admin` + `administrator-only` (Feature
  1/2/3's existing RLS already limits `events` INSERT to administrators
  only - an Event Manager, even global-scope, cannot create events. This
  feature is what first surfaces that existing rule in the UI, not a new
  decision).
- Nav links "Events" and "Create Event" from `/admin`, administrator-only,
  matching the nav list in `project-overview.md`.

## Out of scope

- Everything else the full wizard eventually covers - question/moderation/
  voting settings (4b), review & publish (4c), branding (Feature 11),
  replies (28), attachments (29), anonymity (18), abuse tiers (30),
  slug/join-code customization and QR codes (Features 6-7). None of those
  columns or UI get built here.
- Editing an event after creation, or a real events dashboard - Feature 5.
- Attendee-type reordering (drag-and-drop) - insertion order only for now;
  `sort_order` exists in the schema for a later feature to use.
- Deleting an event or an attendee type - soft delete/restore generally
  isn't exposed yet outside Feature 3's Event Manager page; adding it here
  for a brand-new, likely-still-being-configured draft is premature scope.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Slug/join-code generation + events list page** -
      `app/utils/generate-event-identifiers.ts`: `slugify(name)` (lowercase,
      ASCII letters/digits/hyphens only, collapse repeats, trim edges) plus
      a random suffix; `generateJoinCode()` returns 6 uppercase
      alphanumeric characters. `app/pages/admin/events/index.vue` (guarded
      by `admin` + `administrator-only`): lists `events` (`select id, name,
      slug, status`, RLS already permits administrators to see all),
      ordered newest first; empty state when there are none yet.
      **Done when:** code builds; the list renders (empty state, since no
      events exist yet).
- [x] 2. **Creation wizard: details step** - `app/pages/admin/events/new.vue`
      (guarded by `admin` + `administrator-only`): a name field and a
      "Create" button. On submit: generate a slug and join code, attempt
      `supabase.from('events').insert({ name, slug, join_code, created_by:
      <current user id from the session, never a form field> })`; on a
      unique-constraint error (`23505`), regenerate and retry up to 5
      times before showing "Something went wrong. Please try again."; any
      other error shows the same generic message. `status`,
      `submissions_open`, `voting_open`, and `moderator_access_enabled` are
      left at their schema defaults (`'draft'`, `false`, `false`,
      `false`) - this feature does not set them. On success, also insert
      the event's `event_settings` identity row, then advance to the
      attendee-types step for the newly created event (its id carried in
      component state, not yet a route param - the event isn't
      independently reachable by URL until Feature 5).
      **Done when:** submitting a name creates a real `events` row and its
      `event_settings` row, confirmed by a read-only query; the list from
      step 1 shows it.
- [x] 3. **Creation wizard: attendee types step** - within the same
      `new.vue` flow: add a label (text input + "Add"), list current
      labels for this event with a "Remove" button each (soft delete -
      `update ... set deleted_at = now()`, consistent with the project-wide
      convention and Feature 1's schema - never a hard delete), a "Done"
      button navigating to `/admin/events`. Empty attendee types is a
      valid end state (nothing requires at least one).
      **Done when:** adding and removing a label updates
      `attendee_types` rows, confirmed by a read-only query; "Done"
      returns to the events list showing the new event.
      **Caught during verification:** the first version of `addAttendeeType`/
      `removeAttendeeType` never checked the mutation's `error`, so the UI
      updated local state (making the row disappear) regardless of whether
      the database write actually succeeded - live testing showed two
      "removed" rows that were never actually soft-deleted. Fixed by
      checking `error` on both calls and surfacing a message on failure;
      re-tested live and confirmed against a read-only query that
      `deleted_at` is now set correctly.
- [x] 4. **Nav links** - add "Events" (`/admin/events`) and "Create Event"
      (`/admin/events/new`) links to `app/pages/admin/index.vue`, visible
      only when `role === 'administrator'` (same condition already used
      for the Feature 3 Event Managers link).
      **Done when:** code builds; both links are present and administrator-
      only per the existing pattern.

## Files / areas

- `app/utils/generate-event-identifiers.ts` (new)
- `app/pages/admin/events/index.vue` (new)
- `app/pages/admin/events/new.vue` (new)
- `app/pages/admin/index.vue` (edit - nav links)

## Data / contracts

- **`created_by` is always the current session's own user id,** read from
  `supabase.auth.getSession()` server-side-equivalent client state, never
  accepted as a form value - prevents an admin's client from attributing a
  new event to someone else.
- **Slug/join-code are auto-generated and immutable in this feature.**
  Uniqueness is enforced by the existing partial unique indexes (Feature
  1); this feature's retry-on-conflict loop is the only thing standing
  between a collision and a failed request until Feature 6 adds real
  customization.
- **A draft event is created at the end of the Details step, not at the
  end of the whole wizard.** Attendee types are added to a real, already-
  persisted event row. There is no in-memory "not yet saved" wizard state
  to lose on refresh once Details is submitted (though refreshing mid-
  attendee-types-step does lose the wizard's UI position - the event and
  any attendee types already added are unaffected, since each add/remove
  is its own persisted mutation, not a batch commit at the end).
- **No RLS changes.** `events_insert` and `attendee_types_insert`/`_update`
  are already administrator-permitting from Feature 1; this feature is the
  first UI to actually exercise them.

## Testing

No test runner configured; UI/integration behavior plus two small pure
functions (`slugify`, `generateJoinCode`) that could reasonably get unit
tests once `/tests` exists, but there's no runner to add them to right
now - `npm run build` passed throughout. Live verification (the user, via
`npm run dev`) confirmed: creating an event end to end (two events
created, each with a valid unique slug/join-code and its own
`event_settings` row, confirmed by read-only query), adding an attendee
type, and the events list/nav links. Removing an attendee type initially
looked like it worked in the UI but silently failed to persist (see step
3's note) - caught by checking the database directly rather than trusting
the UI, fixed, and re-confirmed live plus by read-only query.

## Notes for the AI

- Do not add a description, schedule, or any other "details" field beyond
  `name` - the `events` table has no such column, and inventing one here
  would be exactly the kind of unspecced stored field the workflow
  disallows.
- Do not build a review/publish step or touch `status` beyond its schema
  default - that's 4c.
- Do not add question/moderation/voting settings UI - that's 4b, and
  `event_settings` has no columns for them yet.
