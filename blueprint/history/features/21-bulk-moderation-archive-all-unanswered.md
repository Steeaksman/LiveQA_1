# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 21: Bulk moderation & Archive All Unanswered

**Branch:** `feature/bulk-moderation-archive-all-unanswered`
**Status:** verified

## Goal

Let a moderator apply any of Feature 20's eight per-question actions to
several questions at once from the same queue, and give them one
dedicated, confirmed button that archives every currently unanswered
question in the event in a single click.

## In scope

- **`server/utils/moderation-actions.ts` (new shared helper), extracted
  from `action.post.ts`'s existing per-action `switch`.** A pure function
  `computeModerationUpdate(current: { approvalStatus, visibility,
  answered, archived }, action: ModerationAction): { ok: true, update:
  Partial<{...}> } | { ok: false, error: string }` holding exactly
  Feature 20's eight legality rules (unchanged: `publish` and
  `mark_answered` require `approvalStatus === 'approved'`; `reject`
  always also forces `visibility = 'hidden'`; the rest are unconditional).
  **Why this refactor is in scope here:** this feature adds a second
  endpoint that needs the identical legality rules applied per-question;
  extracting them into one shared function guarantees the single-question
  and bulk endpoints can never drift apart, rather than copying the
  `switch` statement a second time.
- **`server/api/events/[slug]/moderation/questions/action.post.ts`
  (edit)** - now calls `computeModerationUpdate` instead of its own
  inline `switch`. Behavior and error messages are unchanged.
- **`server/api/events/[slug]/moderation/questions/bulk-action.post.ts`
  (new).** Body `{ token, questionIds: string[], action }` - the same
  eight `action` values Feature 20 defined. `401` "Not authorized." when
  the session doesn't verify; `400` "Invalid action." for an unknown
  action; `400` "No questions selected." for an empty or missing
  `questionIds`. For each id: resolve it scoped to `(id, event_id)`
  together (never `id` alone, matching Feature 20's precedent); silently
  skip an id that doesn't resolve to a non-deleted question in this
  event, and skip one where `computeModerationUpdate` reports `ok:
  false` for its current state (e.g., `publish` against a
  non-approved question) - **a bulk action never fails outright because
  one selected item was in the wrong state; it applies to everything it
  legally can and reports how many it skipped**, since a mixed-state
  multi-select is the whole point of a bulk tool. Returns `{
  updatedCount, skippedCount }`. This one endpoint also *is* the backend
  for "Archive All Unanswered" - the client computes the target id list
  (see below) and calls this same endpoint with `action: 'archive'`;
  there is no separate archive-all route.
- **`app/pages/m/[slug].vue` (edit).** Each question row gets a
  `UCheckbox` bound to a `Set` of selected ids, plus a "Select all" /
  "Clear selection" checkbox above the list that toggles every currently
  loaded question. When one or more questions are selected, a toolbar
  appears with the same eight action buttons Feature 20 already renders
  per-question (unfiltered here - a mixed selection may legally accept
  different actions per item, and the server already skips whatever
  doesn't apply); clicking one calls `bulk-action.post.ts` with the
  selected ids, then refetches the queue and clears the selection,
  showing a one-line summary ("Applied to 8 of 10 selected."). Separately
  (independent of any selection), an always-visible "Archive All
  Unanswered" button: computes its target count from the currently
  loaded list (`!answered && !archived`), is disabled when that count is
  `0`, and on click shows a plain `window.confirm('Archive N unanswered
  questions? You can undo this by unarchiving them individually.')`
  before calling `bulk-action.post.ts` with that exact id list and
  `action: 'archive'` - **no new dependency or custom modal component**;
  this project has no existing confirmation-dialog pattern anywhere, and
  a native browser confirm is the simplest option that satisfies
  "confirmed one-click" without inventing new UI infrastructure.

## Out of scope

- **Any action beyond Feature 20's existing eight.** This feature adds no
  new moderation action, and no way to bulk-edit question text.
- **Selecting or filtering by approval status, visibility, or search** -
  the queue has no filter/sort UI yet (Feature 20 didn't add one); "select
  all" simply means every question currently rendered in the flat list.
- **Undo for "Archive All Unanswered" beyond individually unarchiving
  each affected question** - Feature 20's `unarchive` action already
  covers this; no bulk-undo or "last bulk action" history is built here.
- **Any change to `current_topic`/topics** - still Feature 22's job,
  unaffected by this feature.
- **Realtime updates or a live selection shared across moderators** -
  Features 25-27's job; this is still fetch-and-refetch only, and
  selection state lives only in the acting moderator's own browser tab.
- **Rate limiting or abuse protection on the bulk endpoint** - Feature
  30's job, same carve-out Feature 20 already established for its own
  action endpoint.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **`computeModerationUpdate` helper + refactor** -
      `server/utils/moderation-actions.ts` per the contract above;
      update `action.post.ts` to call it instead of its own `switch`.
      **Done when:** code builds; each of Feature 20's eight actions
      still produces the same column change and the same error messages
      through the refactored endpoint (re-verified by a read-only
      query), confirming the extraction changed nothing observable.
- [x] 2. **Bulk action endpoint** -
      `server/api/events/[slug]/moderation/questions/bulk-action.post.ts`
      per the contract above.
      **Done when:** a mixed batch of question ids with a legal action
      for some and an illegal one for others updates only the legal
      ones and reports the correct `updatedCount`/`skippedCount`,
      confirmed by a read-only query; an id from a different event is
      skipped, not applied; an empty `questionIds` returns `400`; an
      invalid/expired token returns `401`.
- [x] 3. **Queue UI: multi-select + Archive All Unanswered** -
      `app/pages/m/[slug].vue` per the contract above.
      **Done when:** selecting several questions shows the bulk toolbar;
      applying a bulk action updates the affected questions and shows
      the applied/skipped summary; "Archive All Unanswered" is disabled
      with zero unanswered questions, otherwise confirms before
      archiving exactly the unanswered, non-archived questions and
      leaves everything else untouched.

## Files / areas

- `server/utils/moderation-actions.ts` (new)
- `server/api/events/[slug]/moderation/questions/action.post.ts` (edit - refactor only)
- `server/api/events/[slug]/moderation/questions/bulk-action.post.ts` (new)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **The single-question and bulk endpoints share one legality function.**
  `computeModerationUpdate` is the single source of truth for what each
  of the eight actions does and requires; neither endpoint may
  reimplement or diverge from it.
- **A bulk action is partial-success by design, never all-or-nothing.**
  Skipping an individual illegal-for-its-state or wrong-event id is
  expected behavior, not an error condition - the response's
  `skippedCount` is the only signal, not a per-id error list (kept
  proportionate to what a one-line UI summary needs).
- **"Archive All Unanswered" has no server-side concept of its own** - it
  is exactly `bulk-action` with `action: 'archive'` against a
  client-computed id list. This keeps exactly one code path responsible
  for every archive, whether single, multi-select, or "all unanswered."
- **Every question id in a bulk request is still scoped to `(id,
  event_id)` together**, matching Feature 20's precedent - a bulk call
  can never touch a question belonging to a different event even if a
  crafted id list included one.
- **Selection state is client-only and per-browser-tab** - nothing about
  a moderator's current selection is persisted or shared with other
  moderators.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue/server-route changes (all three steps - no migration
is needed, matching Feature 20).

**Not yet exercised live:** the full bulk flow end to end (a mixed-state
multi-select, the applied/skipped summary, and "Archive All Unanswered"
against a real mix of answered/unanswered/already-archived questions).
This implementation pass did not start a dev server; these are
build-verified only (`npm run build` passed after all three steps).

## Notes for the AI

- Do not duplicate the eight actions' legality rules in a second place -
  both endpoints must call the same `computeModerationUpdate` function.
- Do not make a bulk action fail entirely because one selected question
  was in the wrong state - skip it and continue, then report the count.
- Do not build a separate "archive all" server route - it is the same
  `bulk-action` endpoint called with a client-computed id list.
- Do not add a new UI dependency or custom modal for the confirmation -
  `window.confirm()` is the deliberate, simplest choice given no existing
  confirmation pattern in this codebase.
- Do not scope a bulk id lookup by `id` alone - always confirm `event_id`
  matches the session's resolved event too.
