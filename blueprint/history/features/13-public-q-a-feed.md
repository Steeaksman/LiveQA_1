## Feature 13: Public Q&A feed

**Branch:** `feature/public-q-a-feed`
**Status:** verified

## Goal

Let anyone visiting a live event's `/e/<slug>` see its current public
questions, and let a joined Attendee submit a new one - honoring the
event's `moderation_mode` (what state a new question starts in) and
`submissions_open` (whether submitting is currently allowed at all).

## In scope

- Extend `server/api/events/[slug].get.ts` (Feature 12) with three more
  fields the submit form needs, from the same event/`event_settings` rows
  it already fetches: `moderationMode: 'immediate' | 'queue'`,
  `questionMaxLength: number`, `submissionsOpen: boolean` (from `events`,
  not `event_settings`). No existing field or behavior changes.
- `server/api/events/[slug]/questions.get.ts`: given a slug, returns the
  live event's current public questions - `{ questions: [{ id, text }]
  }`, ordered newest-first, filtered to `visibility = 'public' and
  deleted_at is null` (approval_status is not filtered on separately -
  per this project's own state-machine note, visibility already governs
  what is publicly shown; nothing here needs to also branch on approval
  status). Same generic "Event not found." for a non-live/unknown/deleted
  slug, matching Features 6 and 12's precedent. No attendee identity
  (token) required - this is public data, identical for every caller.
- `server/api/questions.post.ts`: body `{ eventId, token, text }`.
  Re-verifies (fresh, never from client-cached context): the event is
  live, `submissions_open` is `true`, and a real, non-deleted `attendees`
  row exists for `(event_id, token)` - each with its own clear error.
  Validates `text` (trimmed, non-empty, at most that event's
  `question_max_length`). Sets the new row's initial state from
  `moderation_mode`: `immediate` → `approval_status: 'approved'`,
  `visibility: 'public'`; `queue` → `approval_status: 'pending'`,
  `visibility: 'hidden'` - the only two states this feature ever creates;
  a moderator changing them later is Features 19/20's job. `topic_id` is
  always `null` (no current-topic assignment exists until Feature 22) and
  `anonymous` is always `false` (no attendee-facing control for it until
  Feature 18). Returns `{ questionId }` on success.
- `/e/[slug].vue` rework: the public question list is fetched
  unconditionally (via `useFetch`, matching this project's data-loading
  convention) and always shown, whether or not this device has joined -
  "public" means visible to everyone reaching the page, not gated behind
  joining. Below it: the existing join form (Feature 12, unchanged) when
  not yet joined, replaced by a submit form once joined - a `UTextarea`
  bound to `question_max_length`, disabled with a "Submissions are
  currently closed." message when `submissionsOpen` is `false`, and a
  "Submit" button. A successful submit clears the box, shows a transient
  confirmation ("Your question was submitted!" for `immediate`, "Your
  question was submitted and will appear once approved." for `queue`),
  and re-fetches the public list (rather than optimistically inserting
  the new question - correct in both modes without the client needing to
  replicate the moderation-mode logic itself). A manual "Refresh" button
  next to the list re-fetches it on demand - a plain, one-shot convenience,
  not a substitute for the live updates Feature 25 or the polling fallback
  Feature 27 will add.

## Out of scope

- **Approving, rejecting, or otherwise changing a `pending`/`hidden`
  question** - Features 19 and 20 (Moderator authentication, queue
  actions) own every state transition after creation.
- **Voting, vote counts, or any vote-based sort order** - Feature 14. The
  list has one fixed order (newest-first) for now; "sort by votes/newest/
  oldest" is explicitly Feature 14's line in the build plan.
- **An attendee's own pending/hidden questions, or any "my submissions"
  view** - Feature 17 (My Questions & attendee edit/delete). The public
  list only ever shows `visibility: 'public'` rows; a `queue`-mode
  submitter sees just the transient confirmation message, nothing added
  to the shared list, until a moderator (later) makes it public.
- **Anonymity and attendee-type visibility controls** - Feature 18. Every
  question this feature creates has `anonymous: false`; no submitter
  identity (name, attendee type) is shown on any question at all yet, by
  either mode - inventing a display rule here would guess at Feature 18's
  contract.
- **Topic assignment** - Feature 22. `topic_id` is always `null`; no admin
  UI exists yet to set a current topic for any event to inherit.
- **Live updates or a polling fallback** - Features 25 and 27. The list
  is fetched on page load, after a successful submit, and on manual
  "Refresh" only.
- **Duplicate-question suggestions or search** - Features 15 and 16,
  unrelated to submitting or listing.
- **Bans** - `attendees.banned_until` still has no writer (Feature 30);
  this feature's submit endpoint does not check or branch on it, matching
  Feature 12's identical, already-recorded exclusion.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Extend the event context endpoint** - add `moderationMode`,
      `questionMaxLength`, `submissionsOpen` to
      `server/api/events/[slug].get.ts`'s response, sourced from the
      `event_settings`/`events` rows it already queries.
      **Done when:** code builds; requesting a live event's context
      includes all three new fields with correct values, confirmed by
      comparison to that event's actual settings.
- [x] 2. **Public question list endpoint** -
      `server/api/events/[slug]/questions.get.ts` per the contract above.
      **Done when:** requesting a live event with a mix of `public` and
      `hidden` questions returns only the public ones, newest-first;
      requesting a non-live or unknown slug returns the same generic
      "Event not found." as the context endpoint.
- [x] 3. **Question submission endpoint** - `server/api/questions.post.ts`
      per the contract above.
      **Done when:** submitting to an `immediate`-mode event with
      `submissions_open: true` creates one `approved`/`public` question
      row, confirmed by a read-only query, and it then appears via step
      2's endpoint; submitting to a `queue`-mode event creates one
      `pending`/`hidden` row that does *not* appear via step 2; submitting
      with `submissions_open: false`, from an unjoined token, or with
      text over the event's max length each return a distinct, clear
      error and create no row.
- [x] 4. **`/e/<slug>` feed and submit form** - rework `/e/[slug].vue` per
      the contract above, replacing the old static "You're in!"
      placeholder.
      **Done when:** visiting a real live event's `/e/<slug>` shows its
      current public questions regardless of join state; joining reveals
      the submit form in place of the join form; submitting a valid
      question shows the correct mode-specific confirmation and the list
      reflects the new question exactly when the event's mode says it
      should; an empty event shows "No questions yet - be the first to
      ask!"; the Refresh button re-fetches on click.

## Files / areas

- `server/api/events/[slug].get.ts` (edit - three new context fields)
- `server/api/events/[slug]/questions.get.ts` (new)
- `server/api/questions.post.ts` (new)
- `app/pages/e/[slug].vue` (edit - feed + submit form, replacing the
  Feature 12 placeholder)

## Data / contracts

- **A question's initial state is fully determined by `moderation_mode`
  at creation time** - `immediate` → `approved`/`public`; `queue` →
  `pending`/`hidden`. This feature never writes any other combination and
  never changes a row after insert; every later transition belongs to
  Features 19/20.
- **No new RLS policy.** `questions` was left RLS-enabled with no
  policies (Feature 1), the same state `attendees` was in before Feature
  12. This feature uses the identical, now-established pattern: anon
  never touches `questions` directly, only through these service-role
  server routes.
- **Question text is rendered through normal Vue interpolation
  (`{{ }}`), never `v-html`** - Vue auto-escapes interpolated text, so no
  additional sanitization is needed for this rendering path; this matches
  every other user-controlled text already displayed elsewhere in this
  app (event names, welcome text) and would need to be revisited only if
  a future feature ever rendered question text as raw HTML.
- **The submit endpoint re-verifies event-live status, `submissions_open`,
  and attendee identity fresh from the database on every call** - never
  trusting the client's cached context, the same defense-in-depth
  standard Feature 12 established for its join endpoint.
- **The client never computes or assumes a question's resulting
  visibility.** It always re-fetches the public list after a successful
  submit rather than optimistically inserting the new question, so the
  UI can never show a `queue`-mode submission as public by mistake.

## Testing

No test runner configured; `npm run build` passed after all four steps.
`getDeviceIdentity`/`isValidHexColor`-style pure-function unit tests don't
apply here - the new logic is server-route branching and straightforward
UI wiring, not isolable pure functions.

**Not yet exercised live:** submitting under both moderation modes,
confirming the resulting visibility via read-only query, the
closed-submissions and unjoined-token error paths, and the empty-feed
state. This implementation pass did not start a dev server or apply the
pending Feature 11a/12 migrations; these are build-verified only so far,
the same caveat recorded for Features 6-12.

## Notes for the AI

- Do not build any moderator approve/reject UI or endpoint here - this
  feature only ever creates a question in its initial state.
- Do not show a submitter's name, attendee type, or any other identity on
  a question - Feature 18 owns that decision entirely.
- Do not add sorting, vote counts, or a "my questions" filter to the list
  - Features 14 and 17's jobs, not this one's.
- Do not add polling or a realtime subscription to the list - the manual
  "Refresh" button is this feature's entire answer to "how do I see new
  questions," by design, until Features 25/27 land.
- Do not check `attendees.banned_until` in the submit endpoint - nothing
  sets it yet (Feature 30); adding a check now would be dead code guessing
  at that feature's eventual contract.
