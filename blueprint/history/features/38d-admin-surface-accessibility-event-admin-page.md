## Feature 38d: Admin surface accessibility (event admin page)

**Branch:** `feature/admin-surface-accessibility-event-admin-page`
**Status:** verified

## Goal

Bring `app/pages/admin/events/[id].vue` (1623 lines, 11 tabs) to WCAG 2.2
AA, fixing the concrete gaps found by reading the entire file rather than
applying a generic checklist - the last sub-item of build-plan item 38's
per-surface split.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **The entire current file was read in full before scoping this spec**
   (1623 lines, 11 tabs: Dashboard, Questions, Reports, Backup, Readiness,
   Details, Attendee types, Settings, QR codes, Signage, Branding), along
   with the two components it renders (`QrCodeCard.vue`, `SignageExport.vue`
   - the only two files under `app/components/`, both reachable only from
   this page). Every interactive control is already a native or
   `@nuxt/ui` component - no raw click-only `<div>`/`<span>` handlers.
2. **`QrCodeCard.vue` and `SignageExport.vue` have no evidenced gap** and
   are left unchanged: both images already have real, descriptive `alt`
   text, every button has real text content, and every repeated instance
   (Audience/Moderator QR cards) is grouped by its own `UCard` with its own
   heading - the same already-established grounds 38b/38c used to leave
   grouped, repeated controls alone.
3. **The 11 top-level tab-switch buttons convey their selected state only
   through visual styling** (`:variant="activeTab === 'x' ? 'solid' :
   'ghost'"`) - a screen reader has no programmatic way to tell which tab
   is currently active (WCAG 4.1.2, Name/Role/Value: state must be
   programmatically determinable). In scope: add `aria-current="true"` to
   whichever button matches the active tab. **Not in scope:** rewriting
   this into a full ARIA `tablist`/`tab`/`tabpanel` widget with roving
   tabindex and arrow-key navigation - that changes the interaction model
   itself (a materially larger, riskier redesign than every other fix in
   this spec) and WCAG 4.1.2 does not require that specific widget pattern,
   only that current state be programmatically exposed, which
   `aria-current` already satisfies.
4. **The Dashboard tab's summary counts update silently every 15 seconds**
   (`fetchDashboard()`'s poll timer) with no announcement - the same WCAG
   4.1.3 (Status Messages) gap 38a/38b already fixed for their own
   silently-updating status lines. In scope: wrap the summary block in a
   `role="status"` region, the same technique already used twice.
5. **The Questions tab's edit textarea (`editingText`) is a bare
   `<UTextarea>` with no label at all** - the identical gap 38a already
   fixed for the attendee page's own question-edit textarea. In scope: wrap
   it in a labeled `UFormField`, matching that exact precedent. **Not in
   scope:** the tab's Delete/Restore/Permanently-delete/Edit buttons and
   the Reports tab's Download links - each already sits inside its own
   `UCard` grouped with that question's or report's own text, the same
   already-established grounds for leaving grouped, repeated controls
   alone (38b's per-question buttons, 38c's per-EM controls).
6. **The Details tab's `detailsError` is only sometimes field-specific.**
   "Name is required." is genuinely attributable to the name field (client-
   side, early-returning, single-cause) and gets `:error`. "That slug or
   join code is already in use..." is genuinely ambiguous between two
   fields (a single unique-constraint violation covering both, with no
   server-side way to tell which one collided) and correctly stays a
   standalone alert - the same reasoning already applied to
   `event-managers.vue`'s and `usage.vue`'s compound errors in 38c.
7. **The Attendee Types tab has the identical bare-input-plus-ungrouped-
   repeated-Remove-button pattern** already fixed three times now (38a's
   attendee-facing attachment inputs; 38c's Templates, Blocked Terms, and
   Event-wizard Attendee Types steps). In scope: the same fix.
8. **The Settings tab's `settingsError` covers four sequential,
   early-returning, genuinely field-specific validations** (max question
   length, attendee edit window, max attachment count, max attachment
   size) - the same pattern as 38a/38c's name/length checks, just with four
   fields instead of two. In scope: associate each with its own field via
   `:error`. The final catch-all "Something went wrong..." (from the actual
   database update) stays a standalone alert - it is not about any one
   field. The Settings tab's own Moderator Password field **already**
   correctly uses `:error` - not touched, already right.
9. **The Settings tab has seven toggle switches relying on an unassociated
   sibling `<span>` for their label** (hide vote counts, submissions open,
   voting open, moderator access enabled, require attendee name, require
   attendee type, show attendee type publicly) - the identical gap 38b
   already fixed for its own four switches. In scope: `aria-label` on each,
   preserving the existing horizontal layout exactly, per 38b's own
   established constraint against wrapping switches in `UFormField`.
10. **The Branding tab's two logo file inputs already have a visible
    adjacent label** (`<span class="font-medium">Logo</span>` /
    `...Sponsor logo</span>`) but no programmatic association - unlike
    `events/restore.vue`'s single file input (38c), here a visible label
    already exists as text, so `aria-labelledby` referencing that existing
    span is the more precise fix than duplicating the text into a fresh
    `aria-label`. The Branding tab's own accent-color and background-color
    fields **already** correctly use `:error` - not touched. Its
    `logoUploadError` is shared across both independent logo/sponsor-logo
    upload and remove flows with no way to tell which one it is about -
    genuinely ambiguous, correctly stays a standalone alert.
11. **No new contrast measurement is needed** - 38a's `text-gray-500`-vs-
    white measurement (4.836:1) already applies conclusively; this page
    never renders event-branding colors on its own admin chrome (accent/
    background color are edited as plain text values here, not applied to
    this page's own styling).

## In scope

- **Tab switcher.** Add `:aria-current="activeTab === '<tab>' ? 'true' :
  undefined"` to each of the 11 tab-switch buttons.
- **Dashboard tab.** Wrap the summary counts block in a `role="status"`
  region.
- **Questions tab.** Wrap the edit textarea in a labeled `UFormField`.
- **Details tab.** Associate the name-required error with the "Event name"
  field via `:error`.
- **Attendee Types tab.** Wrap the new-label input in a labeled
  `UFormField` connected to `attendeeTypesError` via `:error`; add a
  distinguishing `aria-label` (naming the type) to each "Remove" button.
- **Settings tab.** Associate each of the four field-specific validation
  messages (max question length, attendee edit window, max attachment
  count, max attachment size) with its own field via `:error`. Add
  `aria-label` to each of the seven toggle switches.
- **Branding tab.** Connect each logo file input to its existing visible
  `<span>` label via `id`/`aria-labelledby`.

## Out of scope

- **Every other admin page** - already covered by 38c.
- **`app/pages/join.vue`, `app/pages/e/[slug].vue`, `app/pages/m/[slug].vue`**
  - already covered by 38a/38b.
- **`QrCodeCard.vue`, `SignageExport.vue`** - reviewed, no evidenced gap.
- **Rewriting the tab switcher into a full ARIA `tablist` widget** - per
  the resolved note above; `aria-current` satisfies the actual WCAG
  requirement without changing the interaction model.
- **The Questions tab's per-question action buttons and the Reports tab's
  Download links** - already grouped by their own `UCard`, per the
  resolved note above.
- **The Details tab's unique-constraint error and the Branding tab's
  shared `logoUploadError`** - genuinely ambiguous across two fields each,
  correctly left as standalone alerts.
- **The Settings and Branding tabs' fields that already correctly use
  `:error`** (Moderator Password, Accent color, Background color) - not
  touched, already right.
- **Contrast measurement** - already conclusively established by 38a.
- **Any new devDependency** or **visual redesign** beyond the fixes above -
  matching 38a/38b/38c's own constraints.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Tab switcher and Dashboard tab fixes** per the contract above.
      **Done when:** code builds; each of the 11 tab buttons has
      `aria-current="true"` exactly when it is the active tab; the
      Dashboard summary block is a `role="status"` region (confirmed by
      code review).
- [x] 2. **Questions tab fix** per the contract above.
      **Done when:** code builds; the edit textarea is wrapped in a
      labeled `UFormField` (confirmed by code review).
- [x] 3. **Details tab fix** per the contract above.
      **Done when:** code builds; the name-required error is associated
      with the "Event name" field via `:error`; the unique-constraint
      error is unchanged (confirmed by code review).
- [x] 4. **Attendee Types tab fixes** per the contract above.
      **Done when:** code builds; the new-label input is a labeled
      `UFormField` with its error via `:error`; each Remove button has a
      distinguishing `aria-label` (confirmed by code review).
- [x] 5. **Settings tab fixes** per the contract above.
      **Done when:** code builds; all four field-specific validation
      messages are associated via `:error`; all seven toggle switches have
      an `aria-label` (confirmed by code review).
- [x] 6. **Branding tab fix** per the contract above.
      **Done when:** code builds; both logo file inputs are connected to
      their existing visible label via `id`/`aria-labelledby` (confirmed
      by code review).

## Files / areas

- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

No API or stored-data contract changes - this is a UI-only accessibility
remediation. No new fields, routes, or response shapes.

## Testing

No test runner configured; `npm run build` is the automated check for all
six steps. **Not yet exercised live:** real screen-reader announcement
behavior and keyboard-only navigation in a running browser - the same
caveat recorded for 38a/38b/38c and every prior feature that could not
start a server from this skill. Manual verification via `/check` or `/try`
after this lands is recommended, as with 38a/38b/38c.

## Notes for the AI

- Do not touch any other page - 38a/38b/38c already cover the rest of the
  app.
- Do not rewrite the tab switcher into a full ARIA `tablist` widget - use
  `aria-current` only, per the resolved note above.
- Do not add `:error` to the Details tab's unique-constraint error or the
  Branding tab's shared `logoUploadError` - both are genuinely ambiguous
  across two fields.
- Do not touch the Settings tab's Moderator Password field or the
  Branding tab's Accent/Background color fields - already correct.
- Do not touch the Questions tab's per-question action buttons or the
  Reports tab's Download links - already grouped, per the resolved note
  above.
- Do not add a new devDependency for accessibility linting or testing.
- Do not change any visual design or layout beyond the fixes above.
- Reuse `UFormField`'s existing `:error` prop pattern already used
  throughout this app.
