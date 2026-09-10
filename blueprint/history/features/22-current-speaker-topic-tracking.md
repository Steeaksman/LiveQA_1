# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 22: Current speaker/topic tracking

**Branch:** `feature/current-speaker-topic-tracking`
**Status:** verified

## Goal

Let a Moderator manage a live agenda of topics for the event - add,
rename, reorder, delete, and mark exactly one "current" - from the same
`/m/<slug>` queue page, and have every newly submitted question inherit
whichever topic is current at the moment it's asked. This is the feature
Feature 20 named as owning "change current topic," and the one the
schema's own comment names for the inheritance rule.

**Scope note (resolved before writing this spec):** nothing in the plans
says who manages topics - pre-event admin setup or live moderator
control. Per the user's explicit choice, topics are **moderator-only**:
created, edited, reordered, deleted, and advanced entirely from the
password-gated `/m/<slug>` page. No admin-side topics UI is built.

## In scope

- **`server/api/events/[slug]/moderation/topics.get.ts` (new).** Query
  `{ token }`. `401` "Not authorized." when the session doesn't verify.
  Otherwise returns every non-deleted topic for the event, ordered by
  `sort_order`, as `{ id, name, sortOrder, isCurrent }`.
- **`server/api/events/[slug]/moderation/topics.post.ts` (new).** Body
  `{ token, name }`. `401` on a bad session; `400` "Please enter a topic
  name." for an empty/whitespace-only name; name is trimmed and capped
  at 100 characters (matching this project's existing display-name
  convention). Assigns `sort_order` as one more than the event's current
  maximum (`0` if this is the first topic). A newly created topic is
  never `is_current` - a moderator must separately mark it current.
- **`server/api/events/[slug]/moderation/topics/action.post.ts`
  (new).** Body `{ token, topicId, action, name? }`, where `action` is
  one of `rename`, `set_current`, `delete`, `move_up`, `move_down`.
  `401` on a bad session; `404` "Topic not found." when `topicId` doesn't
  resolve to a non-deleted topic scoped to `(id, event_id)` together
  (never `id` alone, matching Feature 20/21's precedent); `400` "Invalid
  action." for anything else.
  - `rename` - requires `name` in the body; same validation as create
    (non-empty after trim, capped at 100 characters, else `400` "Please
    enter a topic name.").
  - `set_current` - **two sequential updates, in this order**: first
    clear `is_current` on whichever topic in this event currently has it
    (a harmless no-op if none does), then set it on the target topic.
    This order respects the schema's existing unique partial index
    (one current topic per event) without needing a transaction - setting
    the new one before clearing the old one would collide with that
    constraint.
  - `delete` - soft-deletes the topic (`deleted_at = now()`). If the
    deleted topic was the current one, the event simply has no current
    topic afterward (already-submitted questions keep their `topic_id`
    unchanged; new ones inherit `null` until a moderator sets a new
    current topic) - no special-case handling needed beyond the normal
    soft-delete filter every topic query already applies.
  - `move_up` / `move_down` - swaps this topic's `sort_order` with its
    immediate neighbor in the current non-deleted ordering; a no-op
    (not an error) when already first/last.
- **`server/api/questions.post.ts` (edit).** Replaces the hardcoded
  `topic_id: null` with a fresh lookup of the event's current topic
  (`is_current = true`, not soft-deleted) at the moment of submission,
  using its id, or `null` when none is current - re-read every time,
  never cached from an earlier request or trusted from the client,
  matching this endpoint's existing never-trust-the-client discipline
  for every other field.
- **`server/api/events/[slug]/moderation/questions.get.ts` (edit).**
  Adds `topicName: string | null` to each returned question, resolved
  from its (possibly null) `topic_id` via a batch lookup against
  `topics` (mirroring this endpoint's existing `attendees`/
  `attendee_types` batch-lookup pattern) - this is the other half of
  "tracking": moderators can see which topic each question was tagged
  with, not just which one is currently active.
- **`app/pages/m/[slug].vue` (edit).** A new "Topics" panel above the
  question list: an ordered list of topics, each showing its name, a
  "Current" indicator or a "Set current" button when it isn't, up/down
  reorder buttons, a rename control, and a delete button; an "Add topic"
  text input plus button below the list. Each question card now also
  shows its `topicName` (when present) alongside its existing state
  labels. Every action refetches the topics list (and the question list,
  since a newly-current topic doesn't retroactively change any existing
  question but a moderator will want to see the up-to-date topic state
  immediately).

## Out of scope

- **Any admin-side topic management UI** - per the resolved scope note,
  topics are moderator-only in this feature.
- **Showing the current topic, or any topic, to attendees** - nothing in
  the plans asks for this, and no attendee-facing visual design for it
  exists; `/e/<slug>` and the public question list are untouched.
- **Retroactively changing any existing question's `topic_id`** - the
  build-plan line is explicit that "existing questions keep their
  original topic"; no action in this feature ever writes to an existing
  question's `topic_id`.
- **A full drag-and-drop reorder, or reordering more than one position
  at a time** - `move_up`/`move_down` (single-step neighbor swaps) is the
  simplest mechanism that satisfies "reorder" without new UI
  infrastructure; nothing asks for drag-and-drop.
- **Bulk topic actions** - Feature 21's bulk tooling was for questions
  specifically; this feature does not extend multi-select to topics.
- **Realtime topic sync across moderators** - Features 25-27's job, same
  carve-out already established for the rest of the moderator queue.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Topics list + create endpoints** -
      `server/api/events/[slug]/moderation/topics.get.ts` and
      `.../topics.post.ts` per the contract above.
      **Done when:** a valid moderator token lists all non-deleted
      topics ordered by `sortOrder`; creating a topic with a valid name
      appends it with the next `sortOrder` and `isCurrent: false`,
      confirmed by a read-only query; an empty name returns `400`; an
      invalid/expired token returns `401` on both.
- [x] 2. **Topic action endpoint** -
      `server/api/events/[slug]/moderation/topics/action.post.ts` per
      the contract above.
      **Done when:** `rename` updates the name (and rejects an empty
      one); `set_current` results in exactly one current topic for the
      event even when one was already current, confirmed by a read-only
      query; `delete` soft-deletes the topic and clears it from later
      list results; `move_up`/`move_down` swap `sort_order` with the
      correct neighbor and no-op at either end of the list; an unknown
      `action` or a `topicId` from a different event returns `400`/`404`
      respectively.
- [x] 3. **Question submission inherits the current topic** -
      `server/api/questions.post.ts` per the contract above.
      **Done when:** submitting to an event with a current topic set
      stores that topic's id on the new question, confirmed by a
      read-only query; submitting to an event with no current topic
      stores `null`, matching today's behavior; an existing question's
      `topic_id` is never touched by a later topic change.
- [x] 4. **Moderation queue shows each question's topic** -
      `server/api/events/[slug]/moderation/questions.get.ts` per the
      contract above.
      **Done when:** a question with a `topic_id` returns the matching
      topic's current name; a question with `topic_id: null` returns
      `topicName: null`; a question whose topic was later deleted also
      returns `topicName: null` (the batch lookup naturally excludes
      soft-deleted topics).
- [x] 5. **`/m/<slug>` Topics panel** - `app/pages/m/[slug].vue` per the
      contract above.
      **Done when:** adding, renaming, reordering, deleting, and setting
      a topic current all work from the page and persist across a
      reload; each question card shows its topic name when it has one;
      a fresh test question submitted after setting a current topic
      shows that topic's name once the queue is refetched.

## Files / areas

- `server/api/events/[slug]/moderation/topics.get.ts` (new)
- `server/api/events/[slug]/moderation/topics.post.ts` (new)
- `server/api/events/[slug]/moderation/topics/action.post.ts` (new)
- `server/api/questions.post.ts` (edit)
- `server/api/events/[slug]/moderation/questions.get.ts` (edit)
- `app/pages/m/[slug].vue` (edit)

## Data / contracts

- **No new migration.** `topics` (`id`, `event_id`, `name`, `sort_order`,
  `is_current`, soft-delete columns) and `questions.topic_id` have
  existed since Feature 1; this feature is their first consumer.
- **The unique-current-per-event constraint is respected by ordering,
  not a transaction:** `set_current` always clears the event's existing
  current topic before setting the new one, never the reverse.
- **`sort_order` is only ever adjusted by one step at a time**
  (`move_up`/`move_down` swap two adjacent values); nothing renumbers or
  compacts the whole list, so gaps or ties from manual data edits are
  tolerated, not corrected.
- **The current topic is re-read fresh at every question submission** -
  never cached, never trusted from the client, matching every other
  server-computed field in `questions.post.ts`.
- **Every topic lookup is scoped to `(id, event_id)` together**, and
  every topic query filters out soft-deleted rows - matching Feature
  20/21's established precedent for the equivalent question-scoped
  operations.
- **This feature never writes `topic_id` on an existing question** - the
  only place `topic_id` is ever set is at insert time, in
  `questions.post.ts`.

## Testing

No test runner configured; `npm run build` is the automated check for
the TypeScript/Vue/server-route changes (all five steps - no migration
is needed).

**Not yet exercised live:** the full topic lifecycle end to end (create,
rename, reorder at both ends of the list, delete including deleting the
current topic, and a real question submission picking up whichever
topic is current at the time). This implementation pass did not start a
dev server; these are build-verified only (`npm run build` passed after
all five steps).

## Notes for the AI

- Do not build any admin-facing topic UI - moderator-only, per the
  resolved scope note.
- Do not show topics anywhere on `/e/<slug>` or the public question
  list.
- Do not let `set_current` leave two topics marked current at once -
  always clear the existing one first, then set the new one.
- Do not retroactively change any existing question's `topic_id` from
  any action in this feature.
- Do not scope a topic lookup by `id` alone - always confirm `event_id`
  matches the session's resolved event too.
- Do not let `questions.post.ts` trust a client-supplied topic - always
  re-read the event's current topic fresh at submission time.
