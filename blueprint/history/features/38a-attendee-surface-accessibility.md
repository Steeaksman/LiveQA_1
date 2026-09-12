## Feature 38a: Attendee surface accessibility

**Branch:** `feature/attendee-surface-accessibility`
**Status:** verified

## Goal

Bring the attendee-facing surface (`app/pages/join.vue` and
`app/pages/e/[slug].vue`) to WCAG 2.2 AA, fixing the concrete gaps found by
reading both files rather than applying a generic checklist.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **Both files were read in full before scoping this spec.** Every
   interactive control in them is already a native or `@nuxt/ui` component
   (`UButton`, `UInput`, `UTextarea`, `USelect`, `USwitch`) - there are no raw
   `<div>`/`<span>` click handlers anywhere in either file, so basic keyboard
   operability is already largely sound. This narrows real scope to the
   specific gaps below rather than a full rebuild.
2. **No `lang` attribute is set anywhere in the app** - `nuxt.config.ts` has
   no `app.head.htmlAttrs.lang`, and `app/app.vue` doesn't set one either.
   WCAG 3.1.1 requires it. This is one global, page-independent line, so it
   is fixed once here in 38a rather than repeated in 38b/38c.
3. **Validation errors are rendered as disconnected `UAlert`s below their
   fields, not through `UFormField`'s own `:error` prop** (already used
   elsewhere in this app, e.g. the admin event Details tab's slug/join-code
   fields) - so they are not programmatically associated with the field that
   caused them (WCAG 3.3.1, 4.1.2). In scope: reconnect each field-specific
   error to its field via `:error`. A genuinely field-independent error (a
   vote/report/reply network failure with no single associated visible
   field) keeps its existing standalone `UAlert` - forcing every error onto a
   field it doesn't belong to would be its own accessibility bug.
4. **The search input and the reply input rely on placeholder text alone as
   their label** (`placeholder="Search questions"`, `placeholder="Write a
   reply"`) - WCAG 1.3.1/4.1.2/3.3.2 require a real programmatic label,
   which placeholder text does not provide (it disappears on input and isn't
   reliably exposed as a label by assistive tech). In scope: add a
   visually-hidden label (or `aria-label`) without changing the current
   visual design.
5. **Each per-question file-upload `<input type="file">` in the My Questions
   attachment control has no accessible name** distinguishing which question
   it belongs to when multiple questions with open upload slots exist on the
   page at once. In scope: add an `aria-label` naming the specific question's
   text.
6. **The vote count (`<span>{{ question.voteCount }}</span>`) is a bare
   number with no semantic context** - WCAG 1.3.1/4.1.2. In scope: add an
   `aria-label` (e.g. `"12 votes"`).
7. **The Realtime connection-status text ("Live" / "Reconnecting...")
   changes silently** with every Realtime status transition - a screen
   reader user gets no indication their connection state changed (WCAG 4.1.3,
   Status Messages). In scope: make this text an `aria-live="polite"` region.
8. **This project ships Tailwind v4 via `@nuxt/ui` v4** (`@import
   "tailwindcss"` in `app/assets/css/main.css`, no custom palette override
   anywhere in that file) - the exact `text-gray-500` shade used throughout
   both files for secondary text (status labels, counts, timestamps) is
   therefore Tailwind v4's own default gray-500. Its real contrast ratio
   against the page's plain white default background must be measured
   during implementation, not asserted here, since Tailwind v4's default
   palette values differ from v3's and no prior measurement exists in this
   project.
9. **Explicitly out of scope, named rather than silently dropped: contrast
   against a fully admin-configurable, arbitrary `event_settings
   .accent_color` / `background_color`** (Feature 11a). Fixing a handful of
   fixed Tailwind classes cannot guarantee contrast against a color an admin
   is free to set to anything - that needs either live contrast computation
   against the admin's chosen color or constraints on the color picker
   itself, a separate, unresolved product decision this build plan has never
   named anywhere. This is flagged to the user as a candidate new build-plan
   item, not decided here.
10. **`NuxtRouteAnnouncer` is already present in `app/app.vue`** (Nuxt's
    built-in route-change announcer) - part of perceivable navigation is
    already satisfied for free; no changes needed there.

## In scope

- **`nuxt.config.ts` (edit).** Add `app.head.htmlAttrs.lang: 'en'` (WCAG
  3.1.1), matching this project's English-only v1 scope already stated in
  the project overview.
- **`app/pages/join.vue` (edit).** Associate the join-code error with its
  `UFormField` via `:error` instead of (or alongside) the current standalone
  `UAlert`.
- **`app/pages/e/[slug].vue` (edit).**
  - Associate the join-form's name-required and attendee-type-required
    errors with their respective `UFormField`s via `:error`.
  - Associate the question-submission error and the question-edit error with
    their respective `UFormField`/`UTextarea` via `:error` where the error
    is genuinely about that field's content. Vote, report, and reply errors
    stay as standalone alerts - they are not about a single visible field.
  - Add a real accessible label (visually hidden, or `aria-label`) to the
    search input and the reply input, distinct from their existing
    placeholder text.
  - Add a distinguishing `aria-label` to each per-question file-upload input.
  - Add an `aria-label` to the vote-count `<span>`.
  - Wrap the connection-status text in an `aria-live="polite"` region.
  - Measure the real rendered contrast ratio of `text-gray-500` against the
    page's default white background; if it fails WCAG 1.4.3's 4.5:1 minimum
    for normal text, swap it for a compliant shade (e.g. `text-gray-600` or
    `text-gray-700`) applied consistently across both files; if it already
    passes, make no change and record the measured ratio.

## Out of scope

- **`app/pages/m/[slug].vue`** - moderator surface accessibility is Feature
  38b, a separate spec.
- **Every `/admin/*` page** - admin surface accessibility is Feature 38c, a
  separate spec.
- **Contrast against admin-configurable `accent_color`/`background_color`** -
  per the resolved note above; flagged to the user as a candidate new
  build-plan item, not solved here.
- **Any new devDependency** (an accessibility linter, axe-core, etc.) - not
  authorized by this spec; tooling gates are a separate, explicit decision
  in this project's workflow (mirroring how `/tests`/`/browser-tests` are
  their own explicit setup steps).
- **Any visual redesign** beyond what the accessible-name, live-region, and
  contrast fixes above require - this is a remediation pass, not a redesign.
- **Dark-mode contrast** - neither file currently applies any `dark:`
  variant classes or reads `context.themeMode` to toggle a dark background,
  so there is no dark-mode rendering path on this surface today to check
  contrast against; wiring `themeMode` into the attendee page's actual
  visual output (if that is even missing, rather than handled elsewhere) is
  a Feature 11a completeness question, not an accessibility-pass task.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Global language attribute + `join.vue` fixes** per the contract
      above.
      **Done when:** code builds; `nuxt.config.ts` sets `app.head.htmlAttrs
      .lang` to `'en'`; the join-code error in `join.vue` is associated with
      its field via `UFormField`'s `:error` prop (confirmed by code review).
- [x] 2. **`e/[slug].vue` - form/error association** (join form, question
      submission, question edit) per the contract above.
      **Done when:** code builds; each named field-specific error uses
      `UFormField`'s `:error` prop instead of a disconnected alert; vote,
      report, and reply errors are unchanged (confirmed by code review).
- [x] 3. **`e/[slug].vue` - accessible names and live region** (search input,
      reply input, file inputs, vote count, connection status) per the
      contract above.
      **Done when:** code builds; the search input, reply input, and each
      file input each have a real accessible name distinct from their
      placeholder text; the vote-count span has an `aria-label`; the
      connection-status text is inside an `aria-live="polite"` region
      (confirmed by code review).
- [x] 4. **Contrast measurement and correction** for `text-gray-500` against
      the default white background, per the contract above.
      **Done when:** the real rendered contrast ratio is computed and
      recorded against Tailwind v4's shipped `text-gray-500` value; if it
      fails 4.5:1, the class is swapped for a compliant shade applied
      consistently across both files; if it passes, no change is made and
      the measured ratio is recorded in this step's evidence.
      **Measured:** Tailwind v4's `gray-500` is `oklch(55.1% 0.027
      264.364)` (verified against Tailwind's own docs, not assumed from
      training data). Converted via the standard OKLab -> linear-sRGB
      matrices and the WCAG relative-luminance formula, its contrast ratio
      against white is **4.836:1**, clearing the 4.5:1 minimum for normal
      text. No class change made.

## Files / areas

- `nuxt.config.ts` (edit)
- `app/pages/join.vue` (edit)
- `app/pages/e/[slug].vue` (edit)

## Data / contracts

No API or stored-data contract changes - this is a UI-only accessibility
remediation. No new fields, routes, or response shapes.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** real screen-reader announcement
behavior, keyboard-only navigation, and the actual computed contrast ratio
in a running browser - all require a dev server, the same caveat recorded
for every prior feature that could not start a server from this skill.
Manual verification via `/check` or `/try` after this lands is recommended
given how much of this feature's value depends on real assistive-technology
behavior rather than build output alone.

## Notes for the AI

- Do not touch `app/pages/m/[slug].vue` or any `/admin/*` page - those are
  38b and 38c, separate specs.
- Do not attempt to guarantee contrast against admin-configurable branding
  colors - out of scope, per the resolved note above.
- Do not add a new devDependency for accessibility linting or testing - not
  authorized by this spec.
- Do not change any visual design or layout beyond what the accessible-name,
  live-region, and contrast fixes above require.
- Reuse `UFormField`'s existing `:error` prop pattern already used elsewhere
  in this app (e.g. the admin event Details tab) rather than inventing a new
  error-association mechanism.
