## Feature 10: Event duplication

**Branch:** `feature/event-duplication`
**Status:** verified

## Goal

Let an Administrator create a brand-new draft event by copying an existing
event's configuration - its Q&A/moderation settings and attendee types -
with one click, never any of the source event's actual questions, replies,
votes, attendees, reports, or attachments.

## In scope

- A "Duplicate" button on `/admin/events/[id].vue`, visible only when the
  signed-in profile's role is `administrator` (fetched via the existing
  `getAuthenticatedProfile` composable, the same one `/admin/index.vue`
  already uses). This mirrors Feature 4a's precedent, not a new pattern:
  `events_insert` RLS (Feature 1) is administrator-only, exactly like
  event creation, so this is the same class of client-side gate already
  used to hide "Create Event" from Event Managers - not a new exception to
  the project's "RLS decides, no role branch" rule for shared read/update
  access, since duplication is an insert, not an operation both roles
  already share on this row.
- One click performs the whole duplication, no confirmation dialog and no
  intermediate form - consistent with this app's existing minimal-UX
  pattern (event creation and attendee-type add have none either), and
  duplication never touches the source event, so there is nothing
  destructive to confirm.
- The new event: `name` = `"<source name> (Copy)"`; `slug`/`join_code`
  freshly auto-generated the same way the creation wizard already does
  (`slugify`/`generateJoinCode`, retrying on a `23505` unique-constraint
  conflict); `status` always `'draft'` regardless of the source event's
  status (a duplicate is never silently published); `submissions_open`/
  `voting_open` left at their schema defaults (`false`), matching Feature
  9's identical decision that these are live per-event toggles, not
  configuration to copy; `created_by` the current session's own user id.
- Copied configuration: the source event's `event_settings`
  (`question_max_length`, `moderation_mode`, `hide_vote_counts`) written
  into a new `event_settings` row for the new event, and one new
  `attendee_types` row per the source event's current (non-deleted)
  attendee-type labels.
- On success, navigate to the new event's management page
  (`/admin/events/{newId}`), landing on its Details tab exactly like a
  normal event page load.

## Out of scope

- Any of the source event's actual Q&A/session data - questions, replies,
  votes, attendees, reports, or attachments - per the build-plan line
  itself. Nothing in this feature reads or writes those tables.
- Copying `status`, `submissions_open`, or `voting_open` from the source -
  see In scope; a duplicate always starts as a fresh, closed draft.
- Any branding fields - Feature 11 hasn't added them to the schema yet, so
  there's nothing there to copy.
- A confirmation dialog, a "choose what to copy" form, or letting the
  admin edit the new name before creation - the admin can rename via the
  Details tab immediately after, on the page duplication already
  navigates to.
- Any new RLS policy - `events_insert`, `event_settings_insert`, and
  `attendee_types_insert` (Feature 1) already permit exactly what this
  feature needs for an administrator.
- Duplicating a template, or creating a template from a duplicated event -
  unrelated to Feature 9; this feature only ever duplicates a real event
  into another real event.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Duplicate action** - in `/admin/events/[id].vue`: fetch the
      current profile via `getAuthenticatedProfile` alongside the existing
      `onMounted` event fetch; render a "Duplicate" button (administrator-
      only) near the page title, outside the tab panels. On click:
      fetch the source event's `event_settings` (`question_max_length,
      moderation_mode, hide_vote_counts`) and non-deleted `attendee_types`
      (`label`) for this event; then run the same retry-on-`23505` insert
      loop as `new.vue`'s `createEvent()` to insert a new `events` row
      (`name: `${name} (Copy)`, slug/join_code auto-generated, status:
      'draft', created_by: session user`); on success, insert one
      `event_settings` row with the copied values and one `attendee_types`
      row per copied label for the new event id; on any failure, show the
      existing generic "Something went wrong. Please try again." message
      (same defensive style as the rest of this page); on full success,
      `navigateTo('/admin/events/{newId}')`.
      **Done when:** duplicating a real event (that has non-default
      settings and at least one attendee type) produces a new `events` row
      named `"<source> (Copy)"` with its own fresh slug/join code and
      `status: 'draft'`, a matching `event_settings` row, and matching
      `attendee_types` rows, confirmed by a read-only query; the button is
      not rendered for a signed-in Event Manager, confirmed by comparison.

## Files / areas

- `app/pages/admin/events/[id].vue` (edit - Duplicate action)

## Data / contracts

- **The new event is a fully independent row** - no foreign key or other
  link back to the source event; "duplicate" describes the one-time copy
  action, not an ongoing relationship (nothing in the schema has a column
  for one, and none is added here).
- **Partial-failure risk is accepted, matching existing precedent.** Like
  the creation wizard's own `createEvent()`, this is not wrapped in a
  database transaction - if the `events` insert succeeds but a later
  `event_settings`/`attendee_types` insert fails, the new event row is
  left without full configuration. This is the same risk the wizard
  already carries today, not a new gap this feature introduces; fixing it
  for both would mean introducing a Postgres function/transaction pattern
  this project doesn't use anywhere yet, which is beyond this feature's
  scope.
- **Client-side administrator gate, justified exception to "RLS decides":**
  this is the same category as Feature 4a's "Create Event" nav link, not a
  new precedent - both hide a control that performs an insert RLS would
  reject for an Event Manager, as distinct from the read/update actions on
  an already-reachable event that Features 5/6/7/8/9 correctly leave
  ungated client-side.

## Testing

No test runner configured; `npm run build` passed. UI/integration behavior.

**Not yet exercised live:** duplicating a real event with non-default
settings and attendee types, confirming the new row's data by read-only
query, and confirming the button's administrator-only visibility. This
implementation pass did not start a dev server; these are build-verified
only so far, the same caveat recorded for Features 6-9.

## Notes for the AI

- Do not add a confirmation dialog or a pre-duplication edit form - one
  click, immediate navigation to the new event's own editable page.
- Do not copy `status`, `submissions_open`, or `voting_open` from the
  source event - the new event always starts `draft` with both `false`.
- Do not touch any Q&A/session table (questions, replies, votes,
  attendees, content_reports, attachments) - this feature has no reason to
  read or write any of them.
- Do not add transaction/rollback handling for the multi-insert sequence -
  match the wizard's existing non-transactional pattern rather than
  inventing new infrastructure for this one feature.
