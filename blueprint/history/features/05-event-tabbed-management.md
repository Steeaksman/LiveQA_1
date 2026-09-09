## Feature 5: Event tabbed management

**Branch:** `feature/event-tabbed-management`
**Status:** verified

## Goal

Let an Administrator or an Event Manager with access to a specific event
edit that event's existing settings (name, attendee types, Q&A/moderation/
voting settings) after creation - the fields Features 4a/4b already
created, exposed for the first time to more than the wizard's one-shot
creation flow.

## In scope

- Fix a real access gap the wizard's admin-only scope left behind:
  `/admin/events` is currently guarded `administrator-only`, so an Event
  Manager can never see even the events RLS already scopes them to. Relax
  its guard to `admin` (any authenticated administrator or Event Manager);
  the existing `select` query needs no change - RLS (`events_select`)
  already returns only what each role is allowed to see. Each row becomes
  a link to the new management page.
- `/admin/events/[id].vue`, guarded by `admin` only (not
  `administrator-only` - an Event Manager with access must reach this
  page too). On load, fetch the event by id. An empty result (RLS denied
  because this Event Manager isn't assigned to it, or the id doesn't
  exist) shows a plain "Event not found" state rather than an error -
  this is not a case to special-case as a security failure; RLS is simply
  doing its job of returning nothing to someone without access. No
  administrator/Event-Manager permission difference is otherwise
  enforced client-side beyond what RLS already grants: both edit the same
  fields with the same rights on an event they can reach.
- Three tabs on that page, each independently saved (no single combined
  submit): **Details** (edit `name`; `slug`/`join_code`/`status` shown
  read-only - customizing slug/join-code is Feature 6, changing `status`
  beyond the wizard's draft→live is not specified anywhere and stays out),
  **Attendee types** (the same add/remove pattern the wizard already
  uses), **Settings** (`question_max_length`, `moderation_mode`,
  `hide_vote_counts`, `submissions_open`, `voting_open` - the same fields
  and behavior 4b's wizard step already has, now editable after creation
  too).

## Out of scope

- Any status transition beyond what 4c already built (draft→live). No
  unpublish, close, or archive control here - nothing in the plans
  specifies those transition rules yet.
- Slug/join-code editing, QR codes, branded signage - Feature 6/7/8.
- Branding, replies, attachments, anonymity, abuse tiers, retention,
  notifications - their own later features, same as the wizard.
- Deleting the event (soft or otherwise) - not specified for this feature.
- A dedicated moderator- or attendee-facing view of any of this - both
  remain entirely unaffected.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Relax the events list guard; link to the management page** -
      in `app/pages/admin/events/index.vue`, change
      `middleware: ['admin', 'administrator-only']` to `middleware:
      'admin'`. Wrap each row in a `NuxtLink` to `/admin/events/{id}`
      (the query already selects `id`).
      **Done when:** code builds; the list still renders correctly for an
      administrator (structurally - full live-role verification happens
      in step 4).
- [x] 2. **Management page shell + Details tab** -
      `app/pages/admin/events/[id].vue`, guarded by `admin`. On mount,
      fetch `events` (`id, name, slug, join_code, status`) by route param;
      if no row comes back, show "Event not found" and stop - no further
      fetches. Otherwise render a simple tab switcher (plain buttons/local
      `activeTab` ref, not `UTabs`'s content-slot API, to keep this
      consistent with the wizard's existing `v-if`-per-step pattern) with
      **Details** as the default tab: an editable name field, read-only
      slug/join code/status display, "Save" button (`update events set
      name = ...`), checked for `error`/zero affected rows the same
      defensive way the wizard already does.
      **Done when:** visiting a real event's management page shows its
      current name/slug/join-code/status; editing the name and saving
      persists it, confirmed by a read-only query; a nonexistent/
      inaccessible id shows "Event not found".
- [x] 3. **Attendee types tab** - same add/remove-by-soft-delete pattern
      already in `new.vue`'s attendee-types step, operating on this
      event's existing rows (fetched on mount alongside the event).
      **Done when:** adding and removing a label updates `attendee_types`
      rows for this event, confirmed by a read-only query.
- [x] 4. **Settings tab** - the same five fields and update logic as the
      wizard's settings step (`question_max_length`, `moderation_mode`,
      `hide_vote_counts`, `submissions_open`, `voting_open`), pre-filled
      from the fetched event/event_settings data, with its own "Save".
      **Done when:** saving updates the expected columns, confirmed by a
      read-only query.
      **Live verification actually performed:** administrator edits to
      all three tabs, confirmed against the database (name change,
      attendee-type add + soft-delete, `question_max_length` change). The
      Event-Manager-access half of this step's original done-when (an
      assigned Event Manager reaching the page, an unassigned one getting
      "Event not found") was explicitly declined by the user - this
      feature's RLS-based authorization has not been exercised live by
      anyone other than an administrator.

## Files / areas

- `app/pages/admin/events/index.vue` (edit - guard, row links)
- `app/pages/admin/events/[id].vue` (new)

## Data / contracts

- **Authorization is RLS, not a client-side role branch.** The page does
  not check "is this user an administrator or the assigned Event Manager"
  itself - it fetches the event and lets `events_select`/`_update`
  (Feature 1) decide what comes back. An empty fetch result and "no
  access" are indistinguishable to this page by design, matching the
  project-wide rule that authorization lives in RLS, not a trusted
  frontend flag.
- **Per-tab saves, not one combined submit** - matches the wizard's
  existing pattern (each step/tab persists independently) and keeps a
  failed save isolated to the one section that failed.
- **No new RLS policies.** `events_update`, `attendee_types_update`/
  `_insert`, and `event_settings_update` already grant both roles the
  same rights on events they can reach (Feature 1); this feature is the
  first UI to use that access outside the one-time creation wizard.

## Testing

No test runner configured; UI/integration behavior. `npm run build`
passed throughout. Live verification (the user, via `npm run dev`)
confirmed all three tabs for an administrator: name change, attendee-type
add + soft-delete, and a `question_max_length` change, all confirmed
against the database. **Not exercised:** the Event Manager access path -
the user explicitly chose to skip it. This feature is the first place
non-administrator access to this data actually matters (the page relies
entirely on RLS, with no client-side role check backing it up), so this
is a real, named gap, not a formality: an Event Manager's actual ability
to reach an assigned event and be blocked from an unassigned one has
never been observed running.

## Notes for the AI

- Do not build a role check like `if (profile.role === 'administrator')`
  anywhere on this page for read/write access to the event's own data -
  that would duplicate (and could drift from) the RLS policies that are
  the actual authority.
- Reuse the established defensive pattern: check `error` and affected-row
  count on every mutation before treating a save as successful.
- No Event Manager account currently has any event assignment (Feature 3
  shipped with zero test assignments still in place) - live verification
  of the "Event Manager with access" path may need a real assignment
  created first via `/admin/event-managers`.
