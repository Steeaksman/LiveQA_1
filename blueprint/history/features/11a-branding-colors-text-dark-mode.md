## Feature 11a: Branding: colors, text, dark mode

**Branch:** `feature/branding-colors-text-dark-mode`
**Status:** verified

## Goal

Let an Administrator or an Event Manager with access to a specific event set
its accent color, background color, welcome text, and a light/dark theme
preference - stored now so later attendee-facing features (12+) can apply
them once they exist.

## In scope

- Four new `event_settings` columns (migration): `accent_color text`,
  `background_color text` (both nullable - hex color strings, `#RRGGBB`),
  `welcome_text text` (nullable, free text), and `theme_mode` (new Postgres
  enum `public.theme_mode` - `'light' | 'dark' | 'system'`, `not null
  default 'system'`), matching the existing pattern of a Postgres enum for
  a small fixed set (`moderation_mode`, Feature 4b).
- `app/utils/color.ts`: `isValidHexColor(value: string): boolean` -
  `^#[0-9a-fA-F]{6}$`, the one supported format (no 3-digit shorthand, no
  named colors).
- A new **Branding** tab on `/admin/events/[id].vue`, alongside the
  existing five tabs, same plain-button pattern: Accent color and
  Background color (`UInput`, hex text, optional - empty saves as `null`),
  Welcome text (`UTextarea`, optional), Theme mode (`USelect`: Light /
  Dark / Match visitor device, mapping to `light`/`dark`/`system`). One
  "Save" updating all four columns together, validating both color fields'
  format (when non-empty) before attempting the update, same defensive
  error/affected-rows pattern as every other save on this page.

## Out of scope

- **Logo, sponsor logo, and background image** - Feature 11b. All three
  need a Supabase Storage bucket, upload validation, and storage policies
  that don't exist anywhere in this project yet; this sub-feature adds
  colors/text/mode only, none of which need file storage.
- **Button styling as a separate stored field.** Per the user's explicit
  decision this session, "button styling" from the parent build-plan line
  is satisfied by `accent_color` once Feature 12+'s attendee UI applies it
  to buttons - no new column, no new admin control beyond accent color.
- **Actually applying any of these values anywhere.** No attendee-facing
  page exists yet (`/e/<slug>` is Feature 12); this feature only stores
  the settings. Rendering them is out of scope until that page exists,
  the same forward-reference pattern Features 6-8 already established for
  `/e/<slug>`/`/m/<slug>`.
- Any new RLS policy - `event_settings_update` (Feature 1) already covers
  every column on that table generically; these four are no exception.
- Validating `welcome_text` content or length - free text, same as `name`.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Branding columns migration** - new migration file adding
      `create type public.theme_mode as enum ('light', 'dark', 'system');`
      and `alter table public.event_settings add column accent_color
      text, add column background_color text, add column welcome_text
      text, add column theme_mode public.theme_mode not null default
      'system';`.
      **Done when:** the migration file exists, follows this project's
      existing migration conventions (plain SQL, one clear purpose,
      matching Feature 4b's enum-plus-`alter table` shape); applying it
      (locally or to the linked Supabase project, outside this skill) is
      required before step 2 can be verified live.
- [x] 2. **Branding tab** - `app/utils/color.ts` (`isValidHexColor`); in
      `/admin/events/[id].vue`: fetch `accent_color, background_color,
      welcome_text, theme_mode` alongside the existing `event_settings`
      fetch; add the `'branding'` tab (button + panel) with the four
      fields described above; `saveBranding()` validates both color
      fields when non-empty (inline error, no network call on invalid
      format), then updates `event_settings` with all four values (empty
      color inputs saved as `null`), checked for `error`/affected rows.
      **Done when:** code builds; setting valid colors, welcome text, and
      a theme mode and saving persists all four, confirmed by a read-only
      query once the migration is applied; entering an invalid color
      format shows an inline error without a database call; leaving a
      color field blank saves `null` for that column.

## Files / areas

- `supabase/migrations/<timestamp>_add_event_branding_settings.sql` (new)
- `app/utils/color.ts` (new)
- `app/pages/admin/events/[id].vue` (edit - Branding tab)

## Data / contracts

- **Hex color format is `#RRGGBB` only** - 6 hex digits after a required
  `#`, validated client-side only (no DB check constraint), matching
  Feature 6's identical precedent for slug/join-code format (this project
  has no server layer in front of direct `event_settings` updates).
- **`theme_mode` is a Postgres enum, not free text** - `'light' | 'dark' |
  'system'`, matching the `moderation_mode` precedent (Feature 4b) rather
  than a plain `text` column with app-level-only validation.
- **`accent_color`/`background_color`/`welcome_text` are all nullable and
  unset by default** - no default color or text is invented here; a null
  value means "the later-built attendee UI uses its own baseline styling,"
  not "an admin actively chose no branding."
- **No client-side role branch beyond the existing pattern** - matching
  every other tab on this page, `event_settings_update` RLS decides who
  can save; the page does not re-check `profile.role` for this tab.

## Testing

No test runner configured; `npm run build` is the automated check for the
TypeScript/Vue changes (step 2). The migration itself (step 1) is not
executed by any build or test command in this project - applying it is a
separate action outside this skill, consistent with how prior migrations
(Features 1, 4b) were added. `isValidHexColor` is a small pure function
that would be a reasonable unit-test candidate once `/tests` exists.

**Not yet exercised live:** the Branding tab's save/validation behavior
against a real event, which requires the migration to be applied first.
This implementation pass did not start a dev server or apply the
migration to the linked Supabase project; these are build-verified only
so far (`npm run build` passed after both steps), the same caveat
recorded for Features 6-10.

## Notes for the AI

- Do not add logo, sponsor logo, or background image handling here -
  Feature 11b owns all Storage-dependent branding fields.
- Do not add a `button_style` (or similarly named) column - per the user's
  decision, accent color is the only stored input button styling needs.
- Do not render any of these values anywhere yet - there is no attendee-
  facing page in this codebase to apply them to; this feature only
  persists the settings.
- Follow the `moderation_mode` precedent exactly for `theme_mode` (a
  Postgres enum), not a plain `text` column.
