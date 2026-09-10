# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Feature 18: Anonymous questions & attendee-type visibility

**Branch:** `feature/anonymous-questions-attendee-type-visibility`
**Status:** verified

## Goal

Let an Administrator or Event Manager choose, per event, how attendee
identity attaches to a public question - never, attendee's choice, or
always anonymous - and separately whether an attendee's type (e.g.
"Staff") is shown alongside a non-anonymous question. This is the first
feature to show any submitter identity on the public feed at all.

## In scope

- **`anonymity_mode`, a new Postgres enum on `event_settings`: `'named' |
  'optional' | 'always'`, `not null default 'always'`.** Nothing else in
  the plans names the exact levels for "anonymity modes" (plural), so
  this feature defines the contract: `named` - every public question
  shows the submitter's name (when they gave one) and no anonymity
  choice is offered at submission; `optional` - the attendee checks a
  box per question to submit it anonymously; `always` - every question
  is anonymous regardless of anything the attendee submits. **Defaulting
  to `always`, not `named`,** is a deliberate compatibility choice: every
  question submitted before this feature shipped (Features 13-17) was
  already rendered with no identity at all, so `always` preserves that
  behavior for every existing event until an admin explicitly opts into
  showing names - `named` as the default would retroactively expose
  identity on already-public questions the moment this feature ships,
  with no admin action taken.
- **`show_attendee_type boolean not null default false`** on
  `event_settings` - independent of anonymity, and only ever consulted
  when a question is *not* anonymous (see Data/contracts for why
  anonymity overrides this rather than composing independently).
- Two new fields on the existing Settings tab of `/admin/events/[id].vue`:
  "Anonymity mode" (`USelect`: Never anonymous / Attendee chooses /
  Always anonymous) and "Show attendee type publicly" (`USwitch`).
- `server/api/events/[slug].get.ts`: add `anonymityMode` to the context
  response - the submit form needs it to decide whether to offer the
  anonymity checkbox at all.
- `server/api/questions.post.ts`: accepts an optional `anonymous`
  boolean in the body, but **never stores it as given** - the row's
  actual `anonymous` value is computed server-side from the event's
  `anonymity_mode`: `named` → always `false`; `always` → always `true`;
  `optional` → the submitted boolean (defaulting to `false` if missing
  or not a boolean). The client's hint is only ever consulted in
  `optional` mode.
- `server/api/events/[slug]/questions.get.ts`: for each returned
  question, resolve and include `displayName: string | null` and
  `attendeeType: string | null` - both `null` whenever the question is
  effectively anonymous (`anonymous = true`, regardless of
  `show_attendee_type`), and `attendeeType` also `null` whenever
  `show_attendee_type` is `false` or the attendee has none assigned.
  Resolved via a separate batch query against `attendees`/
  `attendee_types` by the already-fetched questions' `attendee_id`s
  (mirroring this endpoint's existing `hasVoted` batch-lookup pattern),
  never as a raw `attendee_id` in the response - the underlying id is
  never exposed, matching this project's own data-model note that the
  attendee owner is "nullable in public reads."
- `/e/[slug].vue`: an "Ask anonymously" checkbox on the submit form,
  shown only when `context.anonymityMode === 'optional'`; the public
  feed shows `displayName`/`attendeeType` beneath a question's text when
  present, exactly as the server chose to reveal them - the client makes
  no redaction decisions of its own.

## Out of scope

- **Changing a question's anonymity after submission.** Feature 17's
  edit endpoint changes `text` and recomputes moderation state only; it
  does not touch `anonymous`. Nothing asks for an "un-anonymize" or
  "make anonymous after the fact" action, and adding one would be new,
  unrequested scope.
- **Showing identity anywhere in "My Questions."** That view already
  needs no identity (it is inherently "mine"); this feature does not
  touch `my-questions.get.ts`.
- **Personalizing the public feed's redaction per viewer** - an
  anonymous question renders anonymous to everyone, including its own
  author looking at the shared feed. There is no "you can see this was
  yours" special case there; "My Questions" already serves that need.
- **Any additional anonymity-adjacent control** (e.g., hiding vote
  counts by attendee, redacting question text itself) - out of scope;
  this feature only ever touches whether a name/type is shown.
- **Retroactively changing already-stored `anonymous` values** - the
  compatibility-preserving default (`always`) means existing questions
  keep displaying exactly as they do today unless an admin changes the
  setting; this feature does not backfill or rewrite any existing row.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Anonymity settings migration** - `create type
      public.anonymity_mode as enum ('named', 'optional', 'always');`;
      `alter table public.event_settings add column anonymity_mode
      public.anonymity_mode not null default 'always', add column
      show_attendee_type boolean not null default false;`.
      **Done when:** the migration file exists, matching this project's
      plain-SQL conventions; applying it (outside this skill) is
      required before later steps can be verified live.
- [x] 2. **Admin anonymity settings** - add the two Settings-tab fields,
      fetched/saved with the tab's existing fields.
      **Done when:** code builds; setting each anonymity mode and
      toggling attendee-type visibility, then saving, persists both,
      confirmed by a read-only query once the migration is applied.
- [x] 3. **Expose `anonymityMode` in the context endpoint** - one field
      added to `server/api/events/[slug].get.ts`'s response.
      **Done when:** requesting context for events in each of the three
      modes returns the matching value.
- [x] 4. **Server-computed anonymity at submission** -
      `server/api/questions.post.ts` per the contract above.
      **Done when:** submitting to a `named`-mode event always creates
      an `anonymous: false` row regardless of what the client sends;
      submitting to an `always`-mode event always creates `anonymous:
      true`; submitting to an `optional`-mode event stores exactly the
      client's boolean (and `false` when omitted), confirmed each time
      by a read-only query.
- [x] 5. **Identity resolution on the public list** -
      `server/api/events/[slug]/questions.get.ts` per the contract
      above.
      **Done when:** a non-anonymous question with `show_attendee_type:
      true` returns both `displayName` and `attendeeType`; the same
      question with the setting `false` returns `attendeeType: null`
      but keeps `displayName`; an anonymous question returns both as
      `null` regardless of the type-visibility setting; no response ever
      includes a raw attendee id.
- [x] 6. **UI: anonymity checkbox and identity display** - wire the
      submit-form checkbox and the feed's name/type display into
      `/e/[slug].vue` per the contract above.
      **Done when:** the "Ask anonymously" checkbox appears only under
      `optional` mode; a submitted anonymous question shows no identity
      in the feed; a non-anonymous question shows its `displayName`/
      `attendeeType` exactly as the server returned them.

## Files / areas

- `supabase/migrations/<timestamp>_add_anonymity_settings.sql` (new)
- `app/pages/admin/events/[id].vue` (edit - two Settings fields)
- `server/api/events/[slug].get.ts` (edit - `anonymityMode`)
- `server/api/questions.post.ts` (edit - server-computed `anonymous`)
- `server/api/events/[slug]/questions.get.ts` (edit - `displayName`/
  `attendeeType`)
- `app/pages/e/[slug].vue` (edit - checkbox + identity display)

## Data / contracts

- **Anonymity is computed server-side at submission time and never
  trusted from the client outside `optional` mode** - the same
  never-trust-the-client discipline every other write endpoint in this
  app already applies.
- **Anonymity overrides attendee-type visibility, rather than the two
  composing independently.** A question marked anonymous never shows its
  type either, even when `show_attendee_type` is `true` - showing "a
  VIP asked this anonymously" in a small event can still partially
  identify someone; treating "anonymous" as fully redacting all
  attendee-linked display data is the safer reading of what "anonymous"
  is supposed to mean.
- **The raw `attendee_id` is never returned by the public question list**
  - only the resolved `displayName`/`attendeeType` strings (or `null`),
  matching this project's own data-model note that the owner is
  "nullable in public reads."
- **The default (`anonymity_mode: 'always'`) is a compatibility choice,
  not an arbitrary pick** - it exactly preserves what every event has
  already been showing since Feature 13, so shipping this feature never
  silently changes what an existing, unconfigured event displays.
- **The public feed performs no client-side redaction logic** - it
  renders exactly the `displayName`/`attendeeType` values the server
  sent (including `null`), never re-deriving visibility from `anonymous`
  or `show_attendee_type` itself, since the client is never given those
  raw values to begin with.

## Testing

No test runner configured; `npm run build` passed after all six steps
(step 1 is a migration, not executed by any build/test command in this
project, matching every prior migration).

**Not yet exercised live:** each anonymity mode's submission behavior,
the type-visibility toggle, the anonymity-overrides-type-visibility
rule, and the submit-form checkbox's conditional visibility. This
implementation pass did not start a dev server or apply the pending
migration; these are build-verified only so far, the same caveat
recorded for Features 6-17.

## Notes for the AI

- Do not let the submit endpoint trust a client-supplied `anonymous`
  value in `named` or `always` mode - only `optional` mode ever reads it.
- Do not show `attendeeType` on an anonymous question even when
  `show_attendee_type` is `true` - anonymity always wins.
- Do not return a raw `attendee_id` (or any other attendee identifier
  beyond the resolved display strings) from the public question list.
- Do not add an anonymity-editing action to Feature 17's edit endpoint -
  not asked for here.
- Do not change `my-questions.get.ts` - identity display is a public-feed
  concern only.
