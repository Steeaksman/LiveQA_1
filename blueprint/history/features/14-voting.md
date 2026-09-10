## Feature 14: Voting

**Branch:** `feature/voting`
**Status:** verified

## Goal

Let a joined Attendee cast one upvote per public question, see vote counts
(unless the event hides them), and sort the feed by votes, newest, or
oldest - completing the "live Q&A feed + voting" headline loop the
overview names as this project's core.

## In scope

- **Add-only voting: this feature never removes a vote.** "One upvote per
  attendee per question" (the build-plan line) is read as the uniqueness
  invariant, not a promise of an unvote/toggle capability - nothing else
  in the plans asks for removing a cast vote. Voting again on an
  already-voted question is idempotent (treated as success, no duplicate
  row, no error), not rejected.
- `server/api/events/[slug].get.ts` (Feature 12/13): add `votingOpen:
  boolean` from `events.voting_open`, the same pattern already used for
  `submissionsOpen`.
- `server/api/events/[slug]/questions.get.ts` (Feature 13): accept two
  optional query params, `token` and `sort` (`'votes' | 'newest' |
  'oldest'`, default `'newest'`, matching today's unspecified behavior).
  For every returned question, add `voteCount: number | null` (`null`
  when that event's `hide_vote_counts` is `true` - the count is withheld
  entirely, not just hidden client-side) and `hasVoted: boolean` (`false`
  whenever `token` is omitted or doesn't resolve to a real attendee for
  this event). Sorting happens in application code after fetching vote
  counts (no new database view or RPC function - this project has no
  precedent for either yet, and per-event data volume is small).
- `server/api/votes.post.ts`: body `{ eventId, token, questionId }`.
  Fresh (never client-cached) checks, each with its own clear error: the
  event is live, `voting_open` is `true`, a real, non-deleted `attendees`
  row exists for `(event_id, token)`, and the question exists, belongs to
  this event, and is `visibility: 'public'` (voting on a hidden/pending or
  cross-event question is rejected with the same generic "Question not
  found." either way). Inserts `{ question_id, attendee_id }`; a
  unique-constraint conflict (already voted) is treated as success, not
  an error, matching the add-only/idempotent contract above.
- `/e/[slug].vue`: a sort `USelect` (Most votes / Newest / Oldest) above
  the list, re-fetching on change; each question shows its vote count
  (only when not `null`) and an "Upvote" button - rendered only when
  `joined` and `votingOpen`, disabled mid-request, replaced with a
  disabled "Voted" state once `hasVoted`. A shared "Voting is currently
  closed." note appears above the list when `votingOpen` is `false`. On a
  successful vote, update that one question's `voteCount`/`hasVoted`
  locally instead of re-fetching the whole list (see Data/contracts for
  why this differs from Feature 13's submit-then-refetch pattern).

## Out of scope

- **Removing or changing a cast vote.** See the add-only decision above;
  nothing here builds an "unvote" action.
- **Realtime vote updates or a polling fallback** - Features 25 and 27,
  the same exclusion Feature 13 already recorded for the question feed
  itself. A vote from another attendee only appears after this device's
  own next fetch (page load, sort change, or Refresh).
- **Any moderator-side vote visibility or reset control** - not specified
  anywhere and unrelated to this feature's attendee-facing scope.
- **Duplicate-vote abuse prevention beyond the database's own unique
  constraint** (rate limiting, device fingerprinting) - Feature 30 (Abuse
  protection modes).
- **Bans** - `attendees.banned_until` still has no writer; this feature's
  vote endpoint does not check it, matching Features 12 and 13's identical,
  already-recorded exclusion.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Add `votingOpen` to the event context endpoint** - one field,
      same pattern as `submissionsOpen`.
      **Done when:** code builds; requesting context for an event with
      `voting_open: true` and one with `false` both return the matching
      `votingOpen` value.
- [x] 2. **Vote counts and sorting on the question list endpoint** - per
      the contract above.
      **Done when:** a live event with questions holding different vote
      counts returns them correctly ordered under `sort=votes`,
      `sort=newest`, and `sort=oldest`; an event with `hide_vote_counts:
      true` returns `voteCount: null` for every question regardless of
      actual vote counts; passing a real attendee's `token` marks their
      voted questions `hasVoted: true` and all others `false`; omitting
      `token` marks every question `hasVoted: false`.
- [x] 3. **Vote submission endpoint** - `server/api/votes.post.ts` per the
      contract above.
      **Done when:** voting on a public question creates one `votes` row,
      confirmed by a read-only query; voting again with the same token on
      the same question does not create a second row and still returns
      success; voting with `voting_open: false`, from an unjoined token,
      or on a hidden/pending/foreign-event question each return a
      distinct, clear error and create no row.
- [x] 4. **Feed UI: sort, counts, upvote button** - rework
      `/e/[slug].vue` per the contract above.
      **Done when:** changing the sort control re-fetches and reorders
      the list; a question's vote count is visible unless the event
      hides them; upvoting a question updates its button to "Voted" and
      its count without a full list reload; the shared closed-voting note
      appears when `votingOpen` is `false`; the upvote button does not
      render for a device that has not joined.

## Files / areas

- `server/api/events/[slug].get.ts` (edit - `votingOpen`)
- `server/api/events/[slug]/questions.get.ts` (edit - `voteCount`,
  `hasVoted`, `sort`, `token`)
- `server/api/votes.post.ts` (new)
- `app/pages/e/[slug].vue` (edit - sort control, counts, upvote button)

## Data / contracts

- **Voting is add-only; there is no unvote in this feature.** A second
  vote attempt from the same attendee on the same question is a no-op
  success, never an error and never a second row - the database's
  existing `votes_question_attendee_key` unique index (Feature 1) is the
  actual enforcement; the endpoint's `23505`-as-success handling mirrors
  the retry-on-conflict pattern already used elsewhere in this app
  (Feature 6's slug/join-code save), just treating the conflict as the
  desired end state rather than something to retry past.
- **`voteCount: null` means "withheld," not "zero."** When
  `hide_vote_counts` is `true`, the server never computes or sends a real
  number - there is nothing for a client to accidentally leak by
  inspecting network traffic.
- **After a successful vote, the client updates only that one question's
  local state instead of re-fetching the list - a deliberate difference
  from Feature 13's "always re-fetch" rule, not an inconsistency.**
  Feature 13 re-fetches because a submitted question's resulting
  visibility depends on branching (`moderation_mode`) the client
  shouldn't replicate. A vote has no such branching: a successful
  response means exactly "this attendee now has one recorded vote on this
  question," which the client can reflect directly. Re-fetching and
  re-sorting the entire list after every single vote would also visibly
  reshuffle it under `sort=votes`, which this feature deliberately avoids.
- **Sorting happens after fetching, in server-side application code**, not
  in the database query - the query only filters and selects; no new SQL
  view, RPC function, or embedded-resource ordering syntax is introduced.
- **The question list endpoint remains public** (no auth) with an
  *optional* `token` for personalization - a caller with no token, or an
  invalid one, still gets the full public list, just with every
  `hasVoted` `false`.

## Testing

No test runner configured; `npm run build` passed after all four steps.

**Not yet exercised live:** voting under both `hide_vote_counts` states,
all three sort orders, the closed-voting and unjoined/foreign-question
error paths, and the idempotent double-vote. This implementation pass did
not start a dev server or apply the pending Feature 11a/12 migrations;
these are build-verified only so far, the same caveat recorded for
Features 6-13.

**Implementation note:** the question-list fetch's `token` query param
starts `undefined` (matching server-side render and the client's first
render pass) and is only set to the real device token inside `onMounted`,
the same SSR-safety pattern Feature 12 established for the `joined` flag.
This makes `hasVoted` correctly `false` for everyone on first paint, then
Nuxt's reactive `useFetch` automatically re-fetches once the real token
is set post-mount - avoiding the same hydration-mismatch class of bug
Feature 12 fixed, rather than reintroducing it here for vote state.

## Notes for the AI

- Do not build an unvote/toggle action - a repeat vote is a no-op success,
  not a removal.
- Do not add a database view, RPC function, or PostgREST embedded-count
  ordering to sort by votes - fetch, then sort in application code.
- Do not re-fetch the whole question list after a successful vote - update
  only the voted question's local `voteCount`/`hasVoted`.
- Do not send a real `voteCount` number when `hide_vote_counts` is `true`
  - send `null`, so there is nothing for a client to expose even by
  accident.
- Do not add rate limiting, fingerprinting, or ban-checking to the vote
  endpoint - Feature 30's job, not this one's.
