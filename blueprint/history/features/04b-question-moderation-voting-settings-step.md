## Feature 4b: Question/moderation/voting settings step

**Branch:** `feature/question-moderation-voting-settings-step`
**Status:** verified

## Goal

Add the three `event_settings` toggles that Features 13/14/19-21 will need
soon (question max length, moderation mode, hide vote counts), plus a
wizard step to set them and the initial `events.submissions_open`/
`voting_open` state, extending the Feature 4a wizard rather than replacing
it.

## In scope

- `event_settings` gains three columns: `question_max_length` (default
  500, per `project-plan.md`'s stated default), `moderation_mode` (new
  enum `'immediate' | 'queue'`, default `'queue'` - the safer default;
  `'immediate'` means a new question is auto-approved and public at
  submission, `'queue'` means it starts `pending`/`hidden` - this column
  only records the choice, Feature 13 is what actually applies it at
  submission time), `hide_vote_counts` (default `false` - counts visible
  by default, matching "optionally hidden" from the plans).
- A third wizard step in `app/pages/admin/events/new.vue`, after Attendee
  Types: set those three settings, plus the already-existing
  `events.submissions_open` and `voting_open` (both still default `false`
  from 4a - this step is the first thing that can turn them on). "Done"
  moves here from the Attendee Types step; that step's button becomes
  "Next" instead.

## Out of scope

- Replies, branding, attachments, anonymity, abuse tiers, retention,
  notifications - unrelated later features/deferred.
- Review & publish / any `events.status` change - Feature 4c.
- Actually enforcing `moderation_mode` at question submission, or
  `question_max_length` at validation time - Feature 13. Actually
  enforcing voting behavior - Feature 14. This feature only stores the
  choices.
- Editing these settings after the wizard - Feature 5 (tabbed management).

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Migration: event_settings columns** -
      `supabase/migrations/<ts>_add_question_moderation_voting_settings.sql`:
      `create type moderation_mode as enum ('immediate', 'queue');`, then
      `alter table event_settings add column question_max_length integer
      not null default 500 check (question_max_length > 0), add column
      moderation_mode moderation_mode not null default 'queue', add column
      hide_vote_counts boolean not null default false;`. Hand the SQL to
      the user to run in the Supabase Dashboard SQL Editor, then verify via
      a read-only query.
      **Done when:** the three columns exist with the stated
      types/defaults, confirmed via `mcp__supabase__list_tables` (verbose)
      on `event_settings`.
- [x] 2. **Wizard step 3: Q&A & moderation settings** - in `new.vue`, add a
      third step after attendee types. On entry, load the current
      `event_settings` row (already exists from 4a) and the event's
      `submissions_open`/`voting_open` for defaults. Form: max question
      length (number input, must be a positive integer - reject and show
      an inline error before submitting otherwise, same generic pattern as
      elsewhere), moderation mode (select: "Immediate publish" /
      "Approval queue"), hide vote counts (toggle), submissions open
      (toggle), voting open (toggle). On submit: `update event_settings`
      (the three new columns) and `update events` (the two existing
      booleans) for this event id, both already administrator-permitted by
      Feature 1's RLS; on error, show "Something went wrong. Please try
      again." and keep the user on this step (no data loss - the previous
      steps' rows are already persisted). Rename the attendee-types step's
      "Done" button to "Next" (advances here instead of exiting); this
      step's button is "Done", navigating to `/admin/events`.
      **Done when:** submitting updates the expected `event_settings`
      and `events` columns, confirmed by a read-only query; the
      renamed "Next" button correctly advances instead of exiting.

## Files / areas

- `supabase/migrations/<ts>_add_question_moderation_voting_settings.sql` (new)
- `app/pages/admin/events/new.vue` (edit - third wizard step)

## Data / contracts

- **`moderation_mode` is a stored choice, not enforced behavior.** Feature
  13 reads it to decide a new question's initial `approval_status`/
  `visibility`; nothing in this feature changes how questions are created,
  since question submission doesn't exist yet.
- **`question_max_length` has no upper bound in this feature** - only
  `> 0` is enforced at the database level. No range is specified anywhere
  in the plans, so none is invented.
- **`submissions_open`/`voting_open` are the same columns Feature 20's
  moderator queue actions later toggle live** - this step only sets their
  initial value at creation time; nothing about their later runtime
  behavior changes.

## Testing

No test runner configured; this is a schema addition plus a form step.
`npm run build` passed throughout. Live verification (the user, via
`npm run dev`) confirmed the positive-integer validation error, and a
precise isolated test (toggling only "Voting open") confirmed against a
read-only query that `voting_open` saved as `true` while
`submissions_open` correctly stayed `false`. An earlier round of testing
appeared to show settings not persisting at all; that turned out to be a
stale dev server that hadn't picked up the code, not a real defect - a
zero-affected-rows check was added to `finish()` anyway as a legitimate
defensive improvement (silently updating 0 rows is a real failure mode
worth surfacing, independent of what actually happened here).

## Notes for the AI

- Do not add a submission-time length check or a moderation enforcement
  path anywhere - those are Feature 13's job once it exists.
- Reuse the existing generic error-message pattern and the lesson from
  4a: always check `error` on every Supabase mutation before updating
  local UI state or advancing the wizard step.
