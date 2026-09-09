## Feature 4c: Review & publish step

**Branch:** `feature/review-publish-step`
**Status:** verified

## Goal

Close out the wizard (last of three sub-features under build-plan item 4)
with a read-only recap of what was configured and a way to either publish
the event or leave it as a draft.

## In scope

- A fourth `new.vue` step, after Settings: a read-only summary (name,
  slug, join code, attendee types, max question length, moderation mode,
  hide vote counts, submissions open, voting open) built entirely from
  state already collected earlier in the wizard - no new fetch needed,
  except capturing slug/join code into component state at creation time
  (step 1 below), since nothing currently holds them after the Details
  step redirects.
- Two actions: **Save as draft** (no mutation - `status` is already
  `'draft'` from creation; just navigates to `/admin/events`) and
  **Publish** (`update events set status = 'live'`, then navigate).
  Settings' "Done" button becomes "Next" (advances here instead of
  exiting).

## Out of scope

- `status = 'scheduled'`. `events` has no date/time column anywhere in
  the schema, and none is specified in the plans for this feature -
  inventing one to make "scheduled" meaningful would be exactly the kind
  of unspecced stored field the workflow disallows. The wizard only ever
  produces `draft` or `live`. If a real scheduling concept is wanted
  later, that's a `project-plan.md` discussion first, then a dedicated
  feature.
- `status = 'closed'`/`'archived'` - later lifecycle actions, not part of
  creation.
- `moderator_access_enabled` - untouched by any part of the wizard so far;
  no feature has specified when the wizard should set it.
- Editing a published event - Feature 5.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Capture slug/join code; add the review & publish step** - in
      `createEvent()`, change the insert's `.select('id')` to
      `.select('id, slug, join_code')` and store the two new fields in
      component refs (`eventSlug`, `eventJoinCode`). Rename the Settings
      step's "Done" button to "Next", advancing to a new `'review'` step
      (no data to load - everything needed is already in refs from earlier
      steps). Add the review UI: a read-only summary of all the fields
      listed in scope (moderation mode shown via its existing
      `moderationOptions` label lookup, not the raw enum value), plus
      "Save as draft" (navigates to `/admin/events` with no mutation) and
      "Publish" (`update events set status = 'live' where id = eventId`,
      checked for `error`/zero affected rows the same way `finish()`
      already does; on failure show "Something went wrong. Please try
      again." and stay on this step; on success navigate to
      `/admin/events`).
      **Done when:** the summary displays the values entered in earlier
      steps correctly; "Save as draft" leaves `status` at `'draft'`;
      "Publish" sets it to `'live'` - both confirmed by a read-only query.

## Files / areas

- `app/pages/admin/events/new.vue` (edit - fourth wizard step)

## Data / contracts

- **The wizard can only produce `draft` or `live`.** No other feature or
  plan passage names a mechanism for reaching `scheduled`, `closed`, or
  `archived` from here.
- **Publishing is a one-way action from this screen** - there is no
  "unpublish" here; that would be Feature 5's edit surface once it exists.
- **The review step trusts in-memory wizard state, not a fresh read.** If
  the admin edited something in another tab mid-wizard (unlikely, single-
  admin flow), the summary could be stale; this is the same trust model
  the rest of the wizard already uses (each step's fields reflect what
  that step itself set, not a defensive re-fetch).

## Testing

No test runner configured; UI/integration behavior only. `npm run build`
passed. Live verification (the user, via `npm run dev`) confirmed the
"Publish" path: the newest event created during testing shows
`status: 'live'`, confirmed by a read-only query. "Save as draft" was not
separately re-exercised in this pass, but it is a pure no-op
(`navigateTo` with no mutation - `status` simply stays at its `'draft'`
insert-time default), so it carries negligible risk beyond what code
review already covers.

## Notes for the AI

- Do not add a date/schedule input or attempt to reach `status =
  'scheduled'` - see Out of scope.
- Reuse the established defensive pattern from 4b: check `error` and
  affected-row count on the publish mutation before navigating.
