# Event admin page: tab nav layout

**Type:** Fix
**Status:** verified
**Branch:** `fix/event-admin-page-tab-nav-layout`

### The problem

`app/pages/admin/events/[id].vue` (the per-event admin page - 11 tabs:
Dashboard, Questions, Reports, Backup, Readiness, Details, Attendee types,
Settings, QR codes, Signage, Branding) wraps its entire content, including
the tab switcher, in one narrow `mx-auto max-w-lg p-6` column. The 11 tab
buttons sit in a single horizontal `flex gap-2` row above the tab content,
which wraps awkwardly across several lines inside that narrow column. The
user wants this reworked to match the interaction pattern of
https://dashboard-template.nuxt.dev/settings/notifications (the same
reference used for Feature 47's admin sidebar): navigation elements
aligned to the left, with the corresponding content centered.

### The fix

Restructure only the page's outer layout - the tab-switcher buttons and
the tab-content chain are otherwise unchanged (same 11 buttons, same
`activeTab` ref, same `@click`/`:variant`/`:aria-current` bindings, same
`v-if`/`v-else-if` chain of tab content):

- Widen the page's root wrapper from `max-w-lg` to `max-w-6xl` so the
  centered content block below has visibly more room to show against.
- Keep the 11 tab buttons as a horizontal row (`flex flex-wrap gap-2`),
  left-aligned above the content - not a vertical side column.
- Wrap the existing tab-content `v-if`/`v-else-if` chain (`UCard
  v-if="activeTab === 'dashboard'"` through the closing `branding` block)
  in its own `mx-auto w-full max-w-lg` block below the tab row, keeping it
  at its original width but centered rather than spanning the full page.

Must not break:

- Any tab's own content, logic, or data fetching - this is a layout-only
  change to the surrounding wrapper and the button row's `class`/layout
  attributes, not the buttons' behavior or any tab's internal markup.
- The existing role-based visibility already governing content inside
  individual tabs (unaffected - not part of this change).
- `admin/events/[id].vue`'s own page-level heading (event name +
  Duplicate button) and the `duplicateError` alert, which stay above the
  tab row, exactly as they sit above it today.

### Build steps

- [x] 1. Restructure the template as described above: widen the root
  wrapper and wrap the existing tab-content chain in a centered block
  below the horizontal, left-aligned tab row.
  **Done when:** the 11 tab buttons appear as a horizontal, left-aligned
  row; the active tab's content renders centered below it, at its current
  width; every tab still switches and renders its existing content
  correctly on click; `npm run build` passes.
  **Done:** `npm run build` passes - the Vue compiler validates template
  tag nesting at build time, confirming the new wrapper closes correctly
  around the untouched 580-line tab-content chain. Only the outer wrapper
  class and the button row's container changed; every individual tab's
  internal markup, the `activeTab` ref, and all
  `@click`/`:variant`/`:aria-current` bindings are byte-for-byte the same
  as before.

  This step went through two passes in the same session: the first draft
  built a vertical left-side nav column (misreading "aligned to the left"
  as a sidebar-style column); the user corrected it to a horizontal,
  left-aligned tab row with only the content centered, which is what
  shipped and was live-confirmed.

### Verify

- Visit `/admin/events/<id>` as an Administrator: confirm the tab list runs
  horizontally, left-aligned, above the content; clicking each of the 11
  tabs still shows the correct content, now centered below the tab row.
  **Live-confirmed by the user.**
- `npm run build` passes.
