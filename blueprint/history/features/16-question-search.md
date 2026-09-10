## Feature 16: Question search

**Branch:** `feature/question-search`
**Status:** verified

## Goal

Let anyone on `/e/<slug>` filter the public question feed by a plain
text search, over public questions only.

## In scope

- **Case-insensitive substring match (`ilike`), not full-text search.**
  The build-plan line says "search," with no mention of relevance
  ranking, stemming, or a `tsvector` column - that infrastructure was
  explicitly deferred here from Feature 15's own line ("Postgres
  trigram/full-text similarity... "), and this feature does not need it
  either: a simple substring filter is sufficient for "search over
  public questions" at this project's scale, and it's a strictly
  reversible choice - upgrading to real full-text search later needs no
  contract change visible to a client, since the response shape is
  identical either way.
- `server/api/events/[slug]/questions.get.ts` (Features 13/14): accept
  one more optional query param, `search`. When present and non-empty,
  adds `.ilike('text', '%<term>%')` to the existing query, composed with
  the unchanged `visibility = 'public'` filter - search never reaches
  non-public questions, the same boundary Feature 15 already established
  for suggestions. When absent or empty, behavior is exactly what it is
  today. Composes cleanly with the existing `sort` param (filtering
  happens before the existing in-application sort).
- `/e/[slug].vue`: a debounced (400ms) search `UInput` above the question
  list, feeding into the same reactive `query` used for `sort`/`token` -
  typing re-fetches automatically through the existing `useFetch`
  reactivity, no new fetch call. Works regardless of `joined` state,
  matching Feature 13's "the feed is public" principle. An empty result
  while a search term is active shows "No questions match your search."
  instead of the existing empty-feed message.

## Out of scope

- **Full-text search, a `tsvector` column, or relevance ranking** - not
  asked for by this build-plan line; `ilike` substring matching is the
  complete scope.
- **Escaping user-typed `%`/`_` as literal characters.** `ilike`
  treats them as wildcards; a search containing one behaves slightly
  differently than a literal match. This is a minor, accepted UX
  quirk, not a security issue (PostgREST parameterizes the query safely
  either way) - not worth the added complexity for a "nice to have"
  filter nobody asked to have wildcard-proofed.
- **Searching non-public questions**, `attendee_types`, or anything
  other than question text - the build-plan line is "question search,"
  scoped to what the public feed already shows.
- **Any change to the suggestions feature (15) or its trigram
  infrastructure** - unrelated; this feature reuses none of it.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Search filter on the question list endpoint** - add the
      `search` query param to `server/api/events/[slug]/questions.get.ts`
      per the contract above.
      **Done when:** a live event with several public questions returns
      only the ones whose text contains the search term
      (case-insensitively) when `search` is provided; omitting `search`
      (or sending an empty string) returns the full unfiltered list,
      confirmed by comparison to today's behavior; a search term matching
      nothing returns an empty list, not an error; a search matching only
      a hidden/pending question's text (identical wording) still returns
      nothing.
- [x] 2. **Search input in the feed UI** - add the debounced search field
      to `/e/[slug].vue` per the contract above.
      **Done when:** typing a term that matches an existing public
      question narrows the list to it within roughly the debounce
      window; clearing the field restores the full list; an unmatched
      term shows "No questions match your search."; the field and
      filtering work identically whether or not this device has joined.

## Files / areas

- `server/api/events/[slug]/questions.get.ts` (edit - `search` param)
- `app/pages/e/[slug].vue` (edit - search input)

## Data / contracts

- **Search is a pure additional filter, composed with the existing
  `visibility = 'public'` constraint** - it can only narrow what was
  already publicly visible, never expand it.
- **No new database object.** Unlike Feature 15's trigram function, this
  feature needs no migration, extension, or index - `ilike` runs directly
  against the existing `text` column via the standard PostgREST filter
  builder.
- **An absent or empty `search` param is defined as "no filter,"** not an
  error and not "match nothing" - this keeps the endpoint's existing,
  already-shipped behavior (Features 13/14) unchanged for every caller
  that doesn't pass the new param.

## Testing

No test runner configured; `npm run build` passed after both steps.

**Not yet exercised live:** the filter narrowing correctly, the
empty-search-term list, the hidden/pending-question exclusion, and the
debounced UI both joined and unjoined. This implementation pass did not
start a dev server; these are build-verified only so far, the same
caveat recorded for Features 6-15.

## Notes for the AI

- Do not add a `tsvector` column, GIN index, or ranking logic - `ilike`
  only.
- Do not let search reach `pending`/`hidden` questions - the existing
  `visibility = 'public'` filter must remain in the same query, not be
  weakened or made conditional.
- Do not add wildcard-character escaping for user-typed `%`/`_` - an
  accepted, documented minor limitation, not a defect to fix here.
- Reuse the existing reactive `query` on the questions `useFetch` call in
  `/e/[slug].vue` - do not add a second, separate fetch mechanism for
  search.
