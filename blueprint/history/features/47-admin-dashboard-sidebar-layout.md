## Feature 47: Admin dashboard sidebar layout

**Branch:** `feature/admin-dashboard-sidebar-layout`
**Status:** verified

### Goal

Replace `app/layouts/admin.vue`'s flat top-nav header with a sidebar +
navbar shell built from Nuxt UI's Dashboard component kit
(`UDashboardGroup`/`UDashboardSidebar`/`UDashboardPanel`/`UDashboardNavbar`,
already shipped with the installed `@nuxt/ui@4.11.0` - no new dependency),
matching the reference template's structure. This is a chrome-only change:
every `/admin/*` page keeps its exact current content, routes, and
authorization; only the surrounding navigation shell changes.

### Design reference

Two pages from https://dashboard-template.nuxt.dev/ (the official Nuxt UI
Dashboard template - the same component kit this project already has
installed) were given as a rough guide, fetched and confirmed during
scoping:

- **Home page** (`/`): a persistent left sidebar (logo/brand at top, a
  vertical nav link list, in this app's case no bottom "Feedback/Help"
  links since that's not a concept here) and a top navbar whose right side
  shows a user-profile section (avatar/name). The demo's main content below
  the navbar has stat cards, a chart, and a table - **explicitly out of
  scope here** (see below); this project's own `/admin` page keeps its
  current content unchanged, just rendered inside the new shell.
- **Nested settings page** (`/settings/notifications`): confirms the
  sidebar stays put and only the main content area changes when a link is
  clicked - i.e. ordinary client-side route navigation into the shared
  layout's `<slot />`, which is exactly how this app's admin pages already
  work. No special split-panel or drawer behavior is needed to reproduce
  this.

Two scope decisions from the user narrow this further:

- **Chrome only, no new dashboard-home content.** `/admin`'s current content
  ("Logged in as {email} ({role})") is unchanged. Cross-event summary stat
  cards are explicitly out of scope - this project already has a
  "Live admin dashboard" (Feature 31), but it is per-event
  (`admin/events/[id].vue`'s own Dashboard tab), not a cross-event summary,
  and building one is a separate, later decision.
- **No chart** - the template's chart is not reproduced anywhere.

**Follow-up (same chat, after the review packet, build step 1 already
shipped and live-confirmed):** the user attached a screenshot of the
reference template's home page with an arrow pointing near its stat-card
row and asked to "duplicate this look and functionality" for the sidebar
links. Two more scope decisions, resolved before writing step 2:

- The arrow was ambiguous between "style the sidebar links as buttons" and
  "add clickable tile cards to `/admin`'s home page" - the user confirmed
  the latter.
- Tiles are **navigation shortcuts only, no numbers/metrics** - this keeps
  the earlier "no cross-event summary data" decision intact; only the
  narrower "no new dashboard-home content at all" framing is superseded.
  One tile per existing sidebar link, same role-scoping as the sidebar (all
  8 for an Administrator, just Events for a restricted Event Manager).

### In scope

- Rewrite `app/layouts/admin.vue` to use `UDashboardGroup` +
  `UDashboardSidebar` + `UDashboardPanel` + `UDashboardNavbar` instead of the
  current `<header>`/`<nav>` markup.
- Sidebar: brand link to `/admin` ("LiveQA Admin") at the top, then a
  vertical `UNavigationMenu` with the exact same links this app's admin nav
  already has, each with a Lucide icon (`i-lucide-*`, the default Nuxt UI
  icon set already available with no new dependency) and the same
  role-scoped visibility as today:
  - **Administrator and Event Manager both see:** Events (`/admin/events`).
  - **Administrator only:** Create Event (`/admin/events/new`), Restore from
    Backup (`/admin/events/restore`), Event Managers
    (`/admin/event-managers`), Templates (`/admin/templates`), Blocked Terms
    (`/admin/blocked-terms`), Audit Log (`/admin/audit-log`), Usage &
    Guardrails (`/admin/usage`).
- Navbar: right side shows a `UDropdownMenu` wrapping a `UUser` (email as
  name, role label as description, matching the current
  `{{ profile.email }} ({{ roleLabel }})` text) with "Log out" as a menu
  item, calling the exact same `supabase.auth.signOut()` +
  `navigateTo('/admin/login')` logic the current layout already has.
- Preserve the exact same profile-loading pattern (`onMounted` +
  `getAuthenticatedProfile`) so Administrator-only links are hidden until
  the profile resolves and stay hidden entirely for a restricted Event
  Manager - identical to today's behavior, just re-expressed as a computed
  `items` array for `UNavigationMenu` instead of `v-if` blocks in a
  `<nav>`.
- Applies to every page that already sets `layout: 'admin'` (unchanged) -
  `admin/login.vue`, `admin/forgot-password.vue`, and
  `admin/reset-password.vue` continue to opt out of this layout entirely,
  exactly as today.
- Extract the nav link list (label/icon/`to`/role-gating) out of the
  layout into a shared `app/composables/useAdminNav.ts`, returning a
  `computed<NavigationMenuItem[]>` given the current `profile`. Both the
  sidebar and the new home-page tile grid (below) consume this one
  definition, so they cannot drift apart the way `F-03`'s finding warned
  about for a different part of this codebase.
- `app/pages/admin/index.vue`: below its existing "Logged in as..." line,
  add a responsive grid of clickable tile cards (`UCard` or equivalent),
  one per item from `useAdminNav()` - icon, label, and a link to that
  route. No numbers, counts, or fetched data on any tile - this is a visual/
  navigational duplicate of the sidebar, not a new data feature.

### Out of scope

- Any change to `/admin`'s own page content beyond adding the tile grid
  described above, or any other admin page's content/logic - the layout
  itself is still the shared shell only.
- Cross-event summary stat cards (real numbers/counts on any tile), a
  chart, or any new dashboard-home metrics.
- Any change to `app/middleware/admin.ts`, `getAuthenticatedProfile`, or
  authorization/role logic.
- Adding, removing, renaming, or regrouping any nav link (no new
  "Settings"-style nested submenu - the current link set has no natural
  parent/child structure to group, so it stays a flat list, just rendered
  vertically instead of horizontally).
- A collapsible/resizable sidebar, persisted sidebar width, or a command
  palette (`UDashboardSearch`) - none of these were asked for; use
  `UDashboardSidebar`'s own sensible defaults for responsive/mobile
  behavior rather than configuring anything custom.

### Build steps

- [x] 1. Rewrite `app/layouts/admin.vue`: `UDashboardGroup` wrapping a
  `UDashboardSidebar` (brand link + `UNavigationMenu` built from a
  `computed` items array gated on `profile.value?.role`) and a
  `UDashboardPanel` containing a `UDashboardNavbar` (title, `#right` slot
  with the `UDropdownMenu` + `UUser` + Log out item) and `<slot />` for the
  routed page content. Keep the exact same `getAuthenticatedProfile`/
  `signOut`/`navigateTo` logic already in the file.
  **Done when:** logging in as an Administrator shows the sidebar with all
  eight links and the navbar's user menu shows the email/role and a working
  Log out; logging in as a restricted Event Manager shows only the Events
  link; every existing `/admin/*` page still renders its own content
  correctly inside the new shell (spot-check `admin/events/[id].vue`, the
  largest one); `admin/login.vue` still renders without the shell;
  `npm run build` passes.
  **Done:** `npm run build` passes (verified twice - once before, once after
  a self-review fix). Self-review caught a real regression before it
  shipped: the original layout always rendered the Log out button
  regardless of whether `profile` had resolved yet (only the email/role
  *text* was gated behind `v-if="profile"`); my first draft wrapped the
  entire user-menu dropdown - Log out included - behind that same
  `v-if="profile"`, which would have made logging out briefly unavailable
  right after mount. Fixed by removing that outer guard so the dropdown
  (and Log out inside it) is always rendered, matching the original's exact
  availability. Live click-through (both roles' link visibility, the user
  menu, and Log out) was not run in this session - `/admin/**` is
  client-rendered (`ssr: false`), so it needs a live browser check, not
  `curl`; recommend the user confirm visually against the running dev
  server.
  **Follow-up (same chat, after the review packet):** the user reported page
  content couldn't scroll vertically. Root cause: `UDashboardPanel`'s
  default slot has fallback content (`header`/`body`/`footer` sub-slots,
  where `body` carries the actual `flex-1 overflow-y-auto` scroll styling)
  that only renders when nothing is passed to the plain default slot -
  passing the navbar and `<slot />` directly into the default slot (as
  written) bypassed that wrapper entirely, so nothing could scroll under
  `UDashboardGroup`'s `fixed inset-0 overflow-hidden` root. Fixed by moving
  the navbar into the named `#header` slot and the page `<slot />` into the
  named `#body` slot, confirmed against the actual generated theme classes
  in `.nuxt/ui/dashboard-panel.ts`. Rebuilt; `npm run build` passes.
  Live-confirmed scrolling correctly by the user.
- [x] 2. Create `app/composables/useAdminNav.ts` exporting the nav item list
  (currently inline in `admin.vue`) as a function of `profile`; update
  `admin.vue` to consume it instead of its own inline `computed`. Add a
  tile grid to `admin/index.vue` below its existing content, built from the
  same composable, each tile a clickable card (icon + label, linking to
  that route) - no numbers or fetched data.
  **Done when:** the sidebar's links are unchanged (same list, same
  role-scoping, now sourced from the shared composable); `/admin`'s home
  page shows one tile per link visible to the current role (all 8 for an
  Administrator, just Events for a restricted Event Manager), each
  navigating correctly on click; `npm run build` passes.
  **Done:** `npm run build` passes. `useAdminNav.ts` takes `profile` as a
  parameter and calls no auth check of its own; `admin.vue` and
  `admin/index.vue` each keep their own pre-existing `onMounted` +
  `getAuthenticatedProfile` call unchanged. Also dropped `admin/index.vue`'s
  leftover `min-h-screen flex items-center justify-center` wrapper (a holdover
  from when the page had no surrounding chrome and needed to self-center a
  lone loading placeholder) in favor of a plain top-aligned column, since
  centering the tile grid inside an already-scrollable dashboard panel body
  no longer made sense. Tiles use `UButton :to=".."` (real link semantics,
  not a non-interactive card wrapped in a separate link) with `UIcon` +
  label in the default slot. Live click-through of the tiles (both roles)
  was not run in this session - `/admin/**` is client-rendered
  (`ssr: false`) - recommend the user confirm visually.
  **Follow-up (same chat, after live confirmation):** the user asked for a
  "Home" link at the top of the sidebar pointing to `/admin`, explicitly
  without a matching tile on the home page (a tile linking to the page
  you're already on is pointless). Added a sidebar-only `sidebarItems`
  computed in `admin.vue` that prepends `{ label: 'Home', icon:
  'i-lucide-house', to: '/admin' }` to `useAdminNav`'s list for the
  `UNavigationMenu` - `admin/index.vue`'s tile grid still consumes
  `useAdminNav` directly and is unaffected, so no Home tile appears there.
  `npm run build` passes.

### Files / areas

- `app/layouts/admin.vue` - full rewrite (shell only), then updated again
  in step 2 to consume the extracted composable instead of its own inline
  nav-items list.
- `app/composables/useAdminNav.ts` - new (step 2).
- `app/pages/admin/index.vue` - adds the tile grid below existing content
  (step 2); no other change.
- Reuses without modification: `app/composables/useAuthSession.ts`
  (`getAuthenticatedProfile`), `useSupabase()`, `app/middleware/admin.ts`,
  and every other existing `/admin/*` page's own content.

### Data / contracts

None. No new database columns, API routes, or server logic - purely a
client-side layout/component swap using components already shipped with the
installed `@nuxt/ui` version.

### Testing

No test runner is configured in this project (`AGENTS.md` Commands has no
`test` entry), and this step is UI-only with no new logic (the role-scoped
link visibility is the exact same comparison the current layout already
makes, just re-expressed as a computed array) - per `coding-standards.md`'s
testing scope rule, this is verified with the dev server and `npm run
build`, not a unit test. Confirming the sidebar/navbar actually render and
behave correctly for both an Administrator and a restricted Event Manager
needs a live browser check (client-rendered admin routes, `ssr: false`)
against a running dev server.
