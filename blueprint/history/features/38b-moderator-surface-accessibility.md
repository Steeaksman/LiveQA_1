## Feature 38b: Moderator surface accessibility

**Branch:** `feature/moderator-surface-accessibility`
**Status:** verified

## Goal

Bring the moderator-facing surface (`app/pages/m/[slug].vue`) to WCAG 2.2 AA,
fixing the concrete gaps found by reading the file rather than applying a
generic checklist - continuing 38a's per-surface split of build-plan item 38.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **The file was read in full before scoping this spec.** Every interactive
   control is already a native or `@nuxt/ui` component (`UButton`, `UInput`,
   `USwitch`, `UCheckbox`) - there are no raw `<div>`/`<span>` click handlers
   anywhere in this file, so basic keyboard operability is already sound.
   This narrows real scope to the specific gaps below.
2. **The global `lang` attribute and `NuxtRouteAnnouncer` fixes from 38a
   already apply here too** - both are app-wide (`nuxt.config.ts`,
   `app/app.vue`), not per-page, so nothing is repeated in this spec.
3. **This page never reads or applies any per-event branding color.** Its
   `EventContext` interface is only `{ id, name }` - no `accentColor`,
   `backgroundColor`, or `themeMode` anywhere in this file, unlike the
   attendee surface. This means 38a's carved-out "arbitrary admin-configured
   background contrast" concern does not apply here at all: this surface
   always renders on the plain default background, so 38a's own measured
   contrast ratio for Tailwind v4's `text-gray-500` against white
   (**4.836:1**, clearing WCAG 1.4.3's 4.5:1 minimum) applies directly and
   conclusively - no new measurement or carve-out is needed for this surface.
4. **The login form's error is a disconnected `UAlert` below the password
   field**, not associated via `UFormField`'s `:error` prop (already used
   elsewhere, including 38a's own fixes) - WCAG 3.3.1/4.1.2. In scope:
   reconnect it.
5. **Two checkboxes have no accessible name at all**: the per-question select
   checkbox (`UCheckbox` next to each question, no adjacent text and no
   `aria-label`) and the "Select all" checkbox (relies on an unassociated
   sibling `<span>Select all</span>` for context) - both fail WCAG 4.1.2. In
   scope: add a distinguishing `aria-label` to each.
6. **Four toggle switches rely on an unassociated sibling `<span>` for their
   label** (sound alert, browser notification, submissions open, voting
   open) rather than a programmatic association - WCAG 1.3.1/4.1.2. In
   scope: add `aria-label` to each `USwitch` directly, preserving the
   existing horizontal layout exactly (a `UFormField` wrapper would restack
   label-above-control and change the visual design, which is out of scope
   per 38a's own established constraint).
7. **The per-topic Up/Down/Rename/Delete buttons are genuinely ambiguous
   when several topics exist**: unlike the per-question action buttons
   (which sit inside a `UCard` that groups them with that question's own
   text, giving assistive tech a programmatic grouping context), each topic
   row is a bare, ungrouped `<div>` with no heading or landmark - a screen
   reader tabbing through hears "Up button", "Down button", "Rename button"
   repeated identically with no way to tell which topic each belongs to.
   This is a real structural gap, not the same case as the already-grouped
   per-question buttons - **the per-question/reply/attachment action buttons
   are explicitly not touched here**, since their `UCard` grouping already
   gives them a programmatic context and inventing extra scope there isn't
   supported by evidence. In scope: add a distinguishing `aria-label`
   (naming the topic) to each of the four per-topic buttons only.
8. **The topic rename input and the new-topic-name input have no accessible
   name** - the rename input has no label or placeholder at all, and the
   new-topic input relies on placeholder text alone (`"New topic name"`) -
   WCAG 1.3.1/4.1.2/3.3.2. In scope: add `aria-label` to both.
9. **The moderator reply input relies on placeholder text alone**
   (`"Reply as moderator"`) and gives no per-question distinguishing name
   when multiple questions have an open reply box at once - the same class
   of gap 38a already fixed for the attendee reply input. In scope: add a
   distinguishing `aria-label`.
10. **The connection-status/presence-count line and the pending-question
    count both change silently** with every Realtime/poll update - WCAG
    4.1.3 (Status Messages), the same gap 38a already fixed for its own
    connection-status text. In scope: make both `role="status"` regions.
    The pending count is, if anything, the single most important status
    message on this entire page for a moderator, so it is explicitly
    included even though 38a's own connection-status fix only covered one
    such line.
11. **The `checkingSession` loading state renders a completely empty
    `<div />`** - every user, not only screen-reader users, sees a blank
    page with zero content while the stored session is verified. In scope:
    replace it with a minimal `role="status"` "Loading..." message,
    matching the loading-state text pattern already used elsewhere in this
    app (e.g. the admin event page's `Loading...` state).

## In scope

- **`app/pages/m/[slug].vue` (edit).**
  - Associate the login form's error with the password field via
    `UFormField`'s `:error` prop instead of a disconnected alert.
  - Add a distinguishing `aria-label` to the "Select all" checkbox and to
    each per-question select checkbox (naming the question's text).
  - Add an `aria-label` to each of the four toggle switches (sound alert,
    browser notification, submissions open, voting open).
  - Add a distinguishing `aria-label` (naming the topic) to each of the four
    per-topic buttons (Up, Down, Rename, Delete).
  - Add an `aria-label` to the topic rename input and the new-topic-name
    input.
  - Add a distinguishing `aria-label` to the moderator reply input, naming
    the question it replies to.
  - Wrap the connection-status/presence-count line and the pending-question
    count line each in a `role="status"` region.
  - Replace the empty `checkingSession` loading `<div />` with a minimal
    `role="status"` "Loading..." message.

## Out of scope

- **`app/pages/join.vue` and `app/pages/e/[slug].vue`** - already covered by
  Feature 38a.
- **Every `/admin/*` page** - Feature 38c, a separate spec.
- **The per-question, per-reply, and per-attachment action buttons inside
  each `UCard`** - per the resolved note above, their existing `UCard`
  grouping already gives assistive tech a programmatic context; this is not
  the same evidenced gap as the ungrouped per-topic buttons.
- **Contrast measurement** - already conclusively established by 38a for
  this exact Tailwind v4 default palette against a plain white background,
  which is the only background this surface ever renders (per the resolved
  note above); no new measurement needed.
- **Any new devDependency** (an accessibility linter, etc.) - not authorized
  by this spec, matching 38a's own constraint.
- **Any visual redesign** beyond the accessible-name and live-region fixes
  above.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Login form and loading-state fixes** per the contract above.
      **Done when:** code builds; the login error is associated with the
      password field via `:error`; the `checkingSession` state renders a
      `role="status"` "Loading..." message instead of an empty `<div>`
      (confirmed by code review).
- [x] 2. **Checkbox and switch accessible names** (select-all, per-question
      select, and the four toggle switches) per the contract above.
      **Done when:** code builds; each of the six controls has a real,
      distinguishing accessible name via `aria-label` (confirmed by code
      review).
- [x] 3. **Topic controls accessible names** (per-topic Up/Down/Rename/Delete
      buttons, rename input, new-topic input) per the contract above.
      **Done when:** code builds; each of the four per-topic buttons has an
      `aria-label` naming its topic; both topic-related inputs have an
      `aria-label` (confirmed by code review).
      **Also fixed:** the "Set current" button was the same ambiguous,
      ungrouped, repeated-label case as the other four per-topic buttons but
      was missed when the spec enumerated "four" - given an `aria-label`
      too, since it's the identical already-approved fix category rather
      than a new scope decision.
- [x] 4. **Status regions and moderator reply label** (connection status,
      pending count, moderator reply input) per the contract above.
      **Done when:** code builds; the connection-status/presence line and
      the pending-count line are each a `role="status"` region; the
      moderator reply input has a distinguishing `aria-label` naming the
      question it replies to (confirmed by code review).

## Files / areas

- `app/pages/m/[slug].vue` (edit)

## Data / contracts

No API or stored-data contract changes - this is a UI-only accessibility
remediation. No new fields, routes, or response shapes.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** real screen-reader announcement
behavior and keyboard-only navigation in a running browser - the same
caveat recorded for 38a and every prior feature that could not start a
server from this skill. Manual verification via `/check` or `/try` after
this lands is recommended, as with 38a.

## Notes for the AI

- Do not touch `app/pages/join.vue`, `app/pages/e/[slug].vue`, or any
  `/admin/*` page - those are 38a (already done) and 38c (separate spec).
- Do not add `aria-label`s to the per-question/reply/attachment action
  buttons inside each `UCard` - per the resolved note above, that is not the
  same evidenced gap as the ungrouped per-topic buttons.
- Do not wrap the four toggle switches in `UFormField` - use `aria-label`
  directly to avoid changing the existing horizontal layout.
- Do not add a new devDependency for accessibility linting or testing.
- Do not re-measure contrast - 38a's measurement already applies
  conclusively here, per the resolved note above.
