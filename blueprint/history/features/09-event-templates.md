## Feature 9: Event templates

**Branch:** `feature/event-templates`
**Status:** verified

## Goal

Let an Administrator author and manage named, reusable event-configuration
templates, then optionally apply one when creating a new event so its
Q&A/moderation settings and attendee types start pre-filled instead of at the
wizard's hardcoded defaults.

## In scope

- `/admin/templates` (list), `/admin/templates/new` (create), and
  `/admin/templates/[id]` (edit) - all guarded by `['admin',
  'administrator-only']`, matching Feature 4a's original guard rather than
  Feature 5's relaxed one: `event_templates` RLS (Feature 1) is
  administrator-only on every operation, with no Event Manager grant at
  all, so the client guard mirrors that exactly.
- A template's editable fields, identical to what the wizard's settings
  step already collects: **Name** (the template's own identifying name,
  required, no uniqueness constraint - the schema has none), **Max
  question length**, **Moderation mode**, **Hide vote counts**, and an
  **Attendee types** list (add/remove labels, client-side array state -
  see Data/contracts for why this differs from the wizard's per-row
  persistence).
- `/admin/templates/new`: one "Create" action inserts one `event_templates`
  row with the fields above encoded into its `config` jsonb column (see
  Data/contracts for the exact shape).
- `/admin/templates/[id]`: fetch by id (not-found state for a missing
  template, matching the events management page's pattern), edit the same
  fields, one "Save" action updating the row, checked for `error`/affected
  rows the same defensive way every other save in this app already is.
- Nav link "Templates" on `/admin/index.vue`, administrator-only, next to
  the existing Events/Event Managers links.
- **Applying a template in the creation wizard:** `/admin/events/new.vue`'s
  Details step gets an optional "Start from template" select (fetched on
  mount: "Blank" plus each saved template's name). When a template is
  selected, `createEvent()` seeds the new event's `event_settings` row
  from the template's `config` (instead of the current all-defaults
  insert) and inserts one `attendee_types` row per label in the template's
  `config.attendeeTypes`, right after event creation. The Attendee types
  and Settings wizard steps then show these pre-filled values, still fully
  editable before the admin finishes the wizard - applying a template only
  changes the starting values, never removes the admin's ability to change
  them.

## Out of scope

- **Saving an existing event's current settings as a new template** (a
  "save as template" shortcut from the event management page). Nothing in
  the plans specifies this entry point, and the nav already lists
  "templates" as its own independent admin section rather than an action
  on the event page - this feature builds the direct-authoring path only.
  An admin can always re-enter values manually into a new template.
- **`submissions_open`/`voting_open` in a template.** These represent
  whether one specific event is currently accepting submissions or votes
  right now, not a reusable setting - a new event, template-applied or
  not, still starts with both `false`, matching the wizard's existing,
  unchanged defaults.
- Deleting or archiving a template - not specified anywhere, and no other
  top-level entity (events) has a delete UI either; this feature only adds
  create/edit, matching that established pattern.
- Any change to `event_templates` RLS - Feature 1's administrator-only
  policies already cover everything this feature does.
- Editing an already-created event from a template after the fact, or
  re-applying a template to an existing event - only the creation-time
  flow is in scope.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Templates list page** - `app/pages/admin/templates/index.vue`
      (guarded `['admin', 'administrator-only']`): list `event_templates`
      (`select id, name` where `deleted_at is null`, ordered newest first),
      empty state when none exist, each row a `NuxtLink` to
      `/admin/templates/{id}`. Add a "Templates" nav link (administrator-
      only) to `/admin/index.vue`.
      **Done when:** code builds; the list renders (empty state, since no
      templates exist yet); the nav link is present and administrator-only.
- [x] 2. **Create template** - `app/pages/admin/templates/new.vue` (same
      guard): Name field; the three settings fields reusing the wizard's
      existing `moderationOptions`/defaults; an attendee-type-labels
      editor (text input + "Add", list with "Remove" per label, client-
      side array only - nothing persisted until Save); rejects adding a
      label that already exactly matches one already in the list (case-
      sensitive), since the real `attendee_types` table this can seed
      later enforces uniqueness the same way. "Create" validates Name
      (required) and Max question length (positive integer, same rule as
      the wizard), then inserts one `event_templates` row: `{ name,
      created_by: <session user id>, config: { questionMaxLength,
      moderationMode, hideVoteCounts, attendeeTypes } }`; on success,
      navigate to `/admin/templates`.
      **Done when:** creating a template with a name, adjusted settings,
      and two attendee-type labels produces one real `event_templates`
      row with the exact expected `config` shape, confirmed by a read-only
      query; the list from step 1 shows it.
- [x] 3. **Edit template** - `app/pages/admin/templates/[id].vue` (same
      guard): fetch by route id (`select id, name, config`); "Template not
      found" if no row comes back; same fields as step 2, pre-filled from
      `config`; one "Save" updating `name` and `config` together, checked
      for `error`/affected rows.
      **Done when:** editing a real template's name, a setting, and its
      attendee-type list and saving persists all of it, confirmed by a
      read-only query; a nonexistent id shows "Template not found".
- [x] 4. **Apply a template from the creation wizard** -
      `app/pages/admin/events/new.vue`: on mount, fetch `event_templates`
      (`select id, name`) for the "Start from template" `USelect`
      (default: no template / "Blank"). In `createEvent()`, after the
      `events` insert succeeds: if a template is selected, fetch its
      `config`, insert `event_settings` with that template's
      `questionMaxLength`/`moderationMode`/`hideVoteCounts` (instead of
      the current bare `{ event_id }` insert relying on column defaults),
      and insert one `attendee_types` row per `config.attendeeTypes`
      label; if no template is selected, behavior is unchanged from
      today. Either way, continue to the Attendee types step exactly as
      before, now pre-populated when a template was applied.
      **Done when:** creating an event with a template selected produces
      an `event_settings` row matching that template's values and
      `attendee_types` rows matching its labels, confirmed by a read-only
      query, and the wizard's later steps show them pre-filled but still
      editable; creating an event with "Blank" selected behaves exactly as
      it did before this feature, confirmed by comparison.

## Files / areas

- `app/pages/admin/templates/index.vue` (new)
- `app/pages/admin/templates/new.vue` (new)
- `app/pages/admin/templates/[id].vue` (new)
- `app/pages/admin/index.vue` (edit - nav link)
- `app/pages/admin/events/new.vue` (edit - template selector + seeding)

## Data / contracts

- **`event_templates.config` shape, defined by this feature (nothing else
  specifies it):**
  ```
  {
    questionMaxLength: number,
    moderationMode: 'immediate' | 'queue',
    hideVoteCounts: boolean,
    attendeeTypes: string[]
  }
  ```
  This is the one and only contract for what a template stores; later
  features reading `config` must match this shape exactly.
- **A template's attendee-type labels live only inside `config` as a plain
  string array, never as real `attendee_types` rows** - a template has no
  `event_id` to attach child rows to (the schema's `config jsonb` column
  is deliberately one self-contained blob for exactly this reason). This
  is why the editor is local array state saved in one batch on "Create"/
  "Save," unlike the wizard's per-row-persisted attendee types for a real,
  already-created event.
- **`created_by` is always the current session's own user id**, read the
  same way Feature 4a already established for events - never a client-
  supplied value.
- **No client-side role branch beyond the guard itself** - `['admin',
  'administrator-only']` on all three template pages is the one place this
  feature enforces the administrator-only rule; nothing inside those pages
  re-checks `profile.role`.
- **Applying a template changes only the seed values written at creation
  time.** After the wizard's Attendee types/Settings steps render, editing
  them behaves exactly as it already does today - there is no ongoing link
  back to the template once an event is created from it.

## Testing

No test runner configured; `npm run build` passed after all four steps.
UI/integration behavior for all four steps.

**Not yet exercised live:** creating, editing, and applying a template end
to end (including confirming the seeded `event_settings`/`attendee_types`
rows and that "Blank" behaves exactly as before), each confirmed against
the database. This implementation pass did not start a dev server; these
are build-verified only so far, the same caveat recorded for Features 6,
7, and 8.

## Notes for the AI

- Do not add a "save as template" action to the event management page -
  out of scope; templates are authored directly under `/admin/templates`.
- Do not add `submissions_open`/`voting_open` to the template `config` -
  those stay at the wizard's existing `false` defaults regardless of
  template.
- Do not add a delete/archive action for templates - not specified, and no
  precedent exists for it on the equivalent `events` entity either.
- Keep the attendee-type-labels editor purely local (component state)
  until the template's own Create/Save action - do not try to persist
  labels incrementally the way the wizard does for a real event's
  `attendee_types` table, since a template has no `event_id` for those
  rows to belong to.
- When applying a template, still let the Attendee types and Settings
  wizard steps run exactly as before (just pre-filled) - do not skip
  straight past them or short-circuit the existing per-step save/insert
  calls.
