## Feature 38c: Admin surface accessibility (smaller pages)

**Branch:** `feature/admin-surface-accessibility-smaller-pages`
**Status:** verified

## Goal

Bring the 12 smaller `/admin/*` pages to WCAG 2.2 AA, fixing the concrete
gaps found by reading every one of them rather than applying a generic
checklist - continuing 38's per-surface split. `admin/events/[id].vue` (1623
lines, 10 tabs) is out of scope here; it is Feature 38d, split out because it
alone is as large as these 12 pages combined.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **All 12 in-scope files were read in full before scoping this spec**
   (`login.vue`, `index.vue`, `event-managers.vue`, `templates/index.vue`,
   `templates/new.vue`, `templates/[id].vue`, `blocked-terms.vue`,
   `audit-log.vue`, `events/index.vue`, `events/new.vue`,
   `events/restore.vue`, `usage.vue`). Every interactive control in all of
   them is already a native or `@nuxt/ui` component - no raw click-only
   `<div>`/`<span>` handlers anywhere. This narrows scope to the specific
   gaps below.
2. **`login.vue`, `index.vue`, `templates/index.vue`, `audit-log.vue`,
   `events/index.vue`, and `usage.vue` have no evidenced gap** and are left
   unchanged: `login.vue` uses Nuxt UI's own `UAuthForm` component
   (vendor-owned accessibility, not this project's code to alter);
   `index.vue` is nav links and one button, all with real text labels;
   `templates/index.vue`, `audit-log.vue`, and `events/index.vue` are
   read-only lists with no bare or ambiguous controls; `usage.vue`'s only
   error (`settingsError`) is genuinely about the compound six-field
   threshold submission, not one field, so it correctly stays a standalone
   alert, and its `text-gray-500` usage is already covered by 38a's
   conclusive contrast measurement (Tailwind v4 vs. white, 4.836:1 - this
   page never renders custom event-branding colors either).
3. **The global `lang` attribute, `NuxtRouteAnnouncer`, and the
   `text-gray-500`-vs-white contrast measurement from 38a all already apply
   here** - none are repeated in this spec.
4. **`event-managers.vue`'s per-row scope `USelect` and Revoke/Restore
   button are not touched** - each sits inside a `UCard` that already
   groups it with that Event Manager's own visible email, the same
   already-established grounds 38b used to leave its per-question action
   buttons alone. What IS a real gap on this page: the per-assignment
   inline "Add an event" `USelectMenu` relies on placeholder text alone
   (`"Add an event"`) and repeats identically across every Event Manager
   card simultaneously visible on the page, and each assignment's "Remove"
   button repeats identically within one Event Manager's own nested,
   ungrouped assignment list - both are the same evidenced gap classes
   38a/38b already established (placeholder-only labels; ambiguous repeated
   labels with no grouping). In scope: fix both.
5. **`templates/new.vue` and `templates/[id].vue` are near-identical** and
   share the same two gaps: the name-required and max-length errors are
   each genuinely attributable to one specific field (sequential, early-
   returning validation, exactly like 38a's own submit-question pattern) but
   render as a disconnected `UAlert` instead of using `:error`; and the
   attendee-type-label input is a bare `UInput` with no `UFormField`
   wrapper at all (no label, only a placeholder) whose own "already in the
   list" error has nowhere to attach - both fixed the same way 38a fixed
   its bare edit-question textarea. The per-label "Remove" button also
   repeats identically in a flat, ungrouped list - the same class of gap as
   38b's topic buttons.
6. **`blocked-terms.vue` has the identical bare-input-plus-ungrouped-repeated-
   button pattern** as the templates pages: a bare, unlabeled `UInput` for
   the new term, and a repeated, ungrouped "Remove" button per term.
7. **`events/new.vue`'s creation wizard has the same three already-
   established gap classes across its own steps**: the Details step's
   "Name is required" error is field-specific but disconnected; the
   Attendee Types step repeats `templates/new.vue`'s exact bare-input and
   ungrouped-Remove-button pattern; the Settings step's max-length error is
   field-specific but disconnected. The Review step's `publishError` is
   genuinely about the whole publish action, not one field (the step has no
   input fields at all), so it correctly stays a standalone alert - not
   touched.
8. **`events/restore.vue` has a single, unlabeled `<input type="file">`**
   (no `UFormField` wrapper is possible on a bare HTML file input, unlike
   `UInput`-based fields) - WCAG 4.1.2 requires a real accessible name even
   for a single, non-repeated control. Its `restoreError` messages
   ("Please choose a backup file." / "That file is not valid JSON.") are
   genuinely about this one file input, so in scope: add `aria-label` to
   the input and connect the error via `aria-describedby` (the manual
   equivalent of `UFormField`'s `:error` for a raw, non-Nuxt-UI element).

## In scope

- **`app/pages/admin/event-managers.vue` (edit).** Add a distinguishing
  `aria-label` to each per-assignment "Add an event" `USelectMenu` (naming
  the Event Manager's email) and each "Remove" button (naming the specific
  assigned event).
- **`app/pages/admin/templates/new.vue` and `.../templates/[id].vue`
  (edit, both).** Associate the name-required and max-length errors with
  their respective fields via `:error`. Wrap the attendee-type-label input
  in a `UFormField` with a real label and connect its "already in the list"
  error via `:error`. Add a distinguishing `aria-label` (naming the label)
  to each per-label "Remove" button.
- **`app/pages/admin/blocked-terms.vue` (edit).** Wrap the new-term input in
  a `UFormField` with a real label and connect its error via `:error`. Add
  a distinguishing `aria-label` (naming the term) to each "Remove" button.
- **`app/pages/admin/events/new.vue` (edit).** Associate the Details step's
  name-required error and the Settings step's max-length error with their
  respective fields via `:error`. Apply the same attendee-type-label input
  and per-label Remove-button fixes as the templates pages.
- **`app/pages/admin/events/restore.vue` (edit).** Add `aria-label` to the
  file input and connect `restoreError` via `aria-describedby`.

## Out of scope

- **`admin/events/[id].vue`** - Feature 38d, a separate spec, per the
  resolved note above.
- **`app/pages/join.vue`, `app/pages/e/[slug].vue`, `app/pages/m/[slug].vue`**
  - already covered by 38a and 38b.
- **`login.vue`, `index.vue`, `templates/index.vue`, `audit-log.vue`,
  `events/index.vue`, `usage.vue`** - reviewed, no evidenced gap, per the
  resolved note above.
- **`event-managers.vue`'s per-row scope `USelect` and Revoke/Restore
  button** - already grouped by its own `UCard`, per the resolved note
  above; not the same evidenced gap as the ungrouped assignment controls.
- **`events/new.vue`'s Review-step `publishError`** - genuinely about the
  whole publish action, not one field; correctly stays a standalone alert.
- **Contrast measurement** - already conclusively established by 38a/38b
  for this exact Tailwind v4 palette against a plain white background,
  which every page in this spec renders on.
- **Any new devDependency** or **visual redesign** beyond the fixes above -
  matching 38a/38b's own constraints.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Event Managers fixes** per the contract above.
      **Done when:** code builds; each per-assignment "Add an event"
      selector and "Remove" button has a distinguishing `aria-label`
      (confirmed by code review).
- [x] 2. **Templates fixes** (`new.vue` and `[id].vue`) per the contract
      above.
      **Done when:** code builds; both pages associate their field-specific
      errors via `:error`, wrap the attendee-type input in a labeled
      `UFormField`, and give each per-label Remove button a distinguishing
      `aria-label` (confirmed by code review).
- [x] 3. **Blocked Terms fixes** per the contract above.
      **Done when:** code builds; the new-term input is a labeled
      `UFormField` with its error via `:error`, and each Remove button has
      a distinguishing `aria-label` (confirmed by code review).
- [x] 4. **Event creation wizard fixes** (`events/new.vue`) per the contract
      above.
      **Done when:** code builds; the Details and Settings steps associate
      their field-specific errors via `:error`; the Attendee Types step
      matches the templates-page fixes (confirmed by code review).
- [x] 5. **Restore-from-backup fixes** (`events/restore.vue`) per the
      contract above.
      **Done when:** code builds; the file input has an `aria-label` and
      its error is connected via `aria-describedby` (confirmed by code
      review).

## Files / areas

- `app/pages/admin/event-managers.vue` (edit)
- `app/pages/admin/templates/new.vue` (edit)
- `app/pages/admin/templates/[id].vue` (edit)
- `app/pages/admin/blocked-terms.vue` (edit)
- `app/pages/admin/events/new.vue` (edit)
- `app/pages/admin/events/restore.vue` (edit)

## Data / contracts

No API or stored-data contract changes - this is a UI-only accessibility
remediation. No new fields, routes, or response shapes.

## Testing

No test runner configured; `npm run build` is the automated check for all
five steps. **Not yet exercised live:** real screen-reader announcement
behavior and keyboard-only navigation in a running browser - the same
caveat recorded for 38a/38b and every prior feature that could not start a
server from this skill. Manual verification via `/check` or `/try` after
this lands is recommended, as with 38a/38b.

## Notes for the AI

- Do not touch `admin/events/[id].vue` - that is Feature 38d, a separate
  spec.
- Do not touch `login.vue`, `index.vue`, `templates/index.vue`,
  `audit-log.vue`, `events/index.vue`, or `usage.vue` - reviewed, no
  evidenced gap.
- Do not add an `aria-label` to `event-managers.vue`'s per-row scope
  `USelect` or Revoke/Restore button - already grouped by its own `UCard`,
  per the resolved note above.
- Do not touch `events/new.vue`'s Review-step `publishError` - it is
  genuinely action-level, not field-specific.
- Do not add a new devDependency for accessibility linting or testing.
- Do not change any visual design or layout beyond the accessible-name and
  error-association fixes above.
- Reuse `UFormField`'s existing `:error` prop pattern already used
  throughout this app rather than inventing a new error-association
  mechanism; for the one bare HTML `<input type="file">` in
  `events/restore.vue`, use `aria-describedby` instead, since `UFormField`
  cannot wrap a raw, non-Nuxt-UI element.
