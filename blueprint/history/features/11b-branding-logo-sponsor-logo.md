## Feature 11b: Branding: logo & sponsor logo

**Branch:** `feature/branding-logo-sponsor-logo`
**Status:** verified

## Goal

Let an Administrator or an Event Manager with access to a specific event
upload, replace, preview, and remove an event logo and a sponsor logo, stored
in a new private Supabase Storage bucket, and have the primary logo appear in
the existing Signage export - the exact follow-up Feature 8 explicitly
deferred to "Feature 11" when it shipped the logo-free signage layout.

## In scope

- New private Storage bucket `event-branding` (migration), following 29a's
  established pattern exactly: `insert into storage.buckets (id, name,
  public) values ('event-branding', 'event-branding', false);` - no Storage
  RLS policies, since every access goes through service-role server routes.
- Two new nullable `event_settings` columns (same migration):
  `logo_storage_path text`, `sponsor_logo_storage_path text`.
- Three new admin-authenticated server routes, mirroring
  `server/api/admin/events/[id]/moderator-password.post.ts`'s
  `verifyEventAccess` + service-role pattern exactly:
  - `GET /api/admin/events/[id]/branding-logo` - returns fresh 1-hour signed
    URLs (`{ logoUrl, sponsorLogoUrl }`, either `null` when unset) for the
    Branding tab's preview and the Signage tab's logo prop.
  - `POST /api/admin/events/[id]/branding-logo` - multipart body (`slot`:
    `'logo' | 'sponsor_logo'`, `file`); validates the slot value, a fixed
    image-only MIME allowlist (`image/jpeg`, `image/png`, `image/gif`,
    `image/webp` - no PDF; a logo is always a displayed image), and a fixed
    2,097,152-byte (2 MB) max size; uploads to `event-branding` at the
    deterministic path `${eventId}/${slot}` with `upsert: true`; updates the
    matching `event_settings` column; returns a fresh signed URL for the
    uploaded object. On a database-update failure after a successful
    upload, best-effort removes the just-uploaded object before returning
    the error (the same disclosed safety net 29a's `attachments.post.ts`
    uses).
  - `DELETE /api/admin/events/[id]/branding-logo` - JSON body (`slot`);
    removes the Storage object (best-effort) and nulls the matching column;
    a no-op success when the slot is already unset.
- `app/utils/signage.ts`: `generateSignagePngDataUrl` gains an optional
  `logoPngUrl?: string | null` input. When present, it loads the image (with
  `image.crossOrigin = 'anonymous'`, since this is a remote URL rather than
  the QR's existing data URL) inside a try/catch, draws it centered
  horizontally in a fixed max box (200w x 160h, aspect ratio preserved) at
  the top of the canvas, and shifts the event name's start position down by
  the drawn logo height plus 40px of spacing. On a load failure, or when
  `logoPngUrl` is absent, the layout is byte-for-byte identical to today's
  logo-free output - regression-safe by construction.
- `app/components/SignageExport.vue`: new optional `logoUrl?: string | null`
  prop, passed through to `generateSignagePngDataUrl` and added to the
  existing `watch` source array so a logo that resolves after mount (fetched
  asynchronously by the parent) triggers a regenerate.
- `app/pages/admin/events/[id].vue`:
  - On mount, after the existing fetches, call the new GET route (using a
    freshly fetched `session.access_token`, matching `saveModeratorPassword`)
    to populate `logoUrl`/`sponsorLogoUrl` refs.
  - Branding tab: a file input, upload button, image preview (or "No logo
    set." text), and a Remove button for each of Logo and Sponsor logo,
    posting/deleting via the new routes with the same Bearer-token and
    error-handling shape `saveModeratorPassword` already uses.
  - Signage tab: pass `:logo-url="logoUrl"` into the existing
    `<SignageExport>` usage.

## Out of scope

- **Sponsor logo is stored and previewable only.** No feature to date names
  anywhere else it should render - Feature 8's explicit note names only "a
  logo" (singular) for the signage layout, not a sponsor logo, and this
  feature adds no new attendee-facing surface. Do not invent a display
  location for it.
- **Background image.** The parent build-plan item 11 and Feature 11a's
  archived "Out of scope" both name it alongside logo/sponsor logo as
  Storage-dependent and deferred to "Feature 11b," but this sub-feature's
  own build-plan title and description ("Branding: logo & sponsor logo")
  covers only the two logos. Background image remains unbuilt and
  unscheduled after this feature ships - a real gap worth flagging, not
  something to silently fold in here or silently drop from the roadmap. The
  parent build-plan item 11 stays unchecked for exactly this reason.
- **Applying `accent_color`/`background_color`/`theme_mode` anywhere.**
  Confirmed still true as of this feature: `app/pages/e/[slug].vue` renders
  `welcomeText` but never applies these three settings as actual styling.
  This predates this feature (a gap Feature 11a's own archive already
  disclosed and no later feature has picked up) and this feature's own
  scope is logo-specific - not this feature's job to fix.
- **Any new Storage RLS policy.** The build-plan line's "storage policies"
  wording is satisfied by 29a's already-established pattern: a private
  bucket plus service-role-only server routes, with clients never talking to
  Storage directly. This is a continuation of that precedent, not a
  deviation from the build-plan text.
- **Any new Postgres RLS policy.** `event_settings_update` (Feature 1)
  already covers every column on that table generically, per 11a's identical
  finding for its four columns - these two are no exception.
- **A per-event configurable size/type limit for logos**, unlike Feature 29's
  attachments. The build-plan text for this sub-feature does not mention
  configurability (Feature 29's parent line explicitly does), and there is
  exactly one logo and one sponsor logo per event, not a variable-count
  upload needing a tunable cap - a fixed allowlist and fixed max size are
  the simplest fit, matching `attachments.post.ts`'s identical reasoning for
  its fixed MIME allowlist.
- **Storing the uploaded file's original filename.** Paths are
  server-generated and deterministic (`${eventId}/logo`,
  `${eventId}/sponsor_logo`), never derived from client input - matching
  every prior Storage upload in this project.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Branding storage bucket & columns migration** - new migration
      file creating the private `event-branding` bucket and adding
      `event_settings.logo_storage_path` / `sponsor_logo_storage_path`
      (both nullable `text`), matching 29a's migration shape exactly.
      **Done when:** the migration file exists and matches the project's
      established plain-SQL, one-purpose migration convention; applying it
      to the linked Supabase project is a separate action outside this
      skill, the same caveat recorded for every prior migration.
- [x] 2. **Branding logo server routes** - `branding-logo.get.ts`,
      `branding-logo.post.ts`, `branding-logo.delete.ts` under
      `server/api/admin/events/[id]/`, each using `verifyEventAccess` and
      `useSupabaseServiceRole()` exactly as `moderator-password.post.ts`
      does, per the contracts above.
      **Done when:** code builds; each route returns 401 `"Not authorized."`
      for a missing or invalid bearer token (confirmed by code review, since
      exercising a real Supabase project is outside this skill); the upload
      route rejects a disallowed MIME type, an oversized file, and an
      invalid `slot` value with a clear inline-safe error before touching
      Storage.
- [x] 3. **Logo integration in the signage graphic** - extend
      `app/utils/signage.ts` and `app/components/SignageExport.vue` per the
      contracts above.
      **Done when:** code builds; with `logoUrl` absent, the generated
      graphic's composition is unchanged from Feature 8's original output
      (confirmed by code inspection: the no-logo branch is untouched); the
      logo-present branch and load-failure fallback cannot be visually
      confirmed without a dev server and a real uploaded logo, so this step
      is build-verified only, the same caveat recorded for every prior
      signage/QR feature.
- [x] 4. **Branding tab logo upload UI** - extend
      `app/pages/admin/events/[id].vue` per the contracts above: fetch on
      mount, upload/remove controls and previews in the Branding tab, and
      the new `logo-url` prop passed into the Signage tab's
      `<SignageExport>`.
      **Done when:** code builds; the Branding tab renders upload, preview,
      and remove controls for both slots; the Signage tab passes the
      fetched `logoUrl` through. Not yet exercised live - requires the
      migration applied to a real Supabase project and a real file upload,
      the same caveat recorded for Features 6-10 and 29a.

## Files / areas

- `supabase/migrations/20260910090000_add_branding_storage.sql` (new)
- `server/api/admin/events/[id]/branding-logo.get.ts` (new)
- `server/api/admin/events/[id]/branding-logo.post.ts` (new)
- `server/api/admin/events/[id]/branding-logo.delete.ts` (new)
- `app/utils/signage.ts` (edit)
- `app/components/SignageExport.vue` (edit)
- `app/pages/admin/events/[id].vue` (edit - Branding tab + Signage tab prop)

## Data / contracts

- **Bucket:** `event-branding`, private (`public: false`), service-role-only
  access - no Storage RLS policies, matching 29a.
- **Columns:** `event_settings.logo_storage_path text` (nullable),
  `event_settings.sponsor_logo_storage_path text` (nullable). `null` means
  no logo uploaded for that slot.
- **Slot enum (app-level, not a Postgres enum):** `'logo' | 'sponsor_logo'` -
  a fixed two-value discriminator on the upload/remove routes, not a stored
  column value, so a plain string check is enough (no new Postgres enum
  type, unlike `theme_mode`).
- **Storage path is deterministic:** `${eventId}/${slot}` - re-uploading a
  slot overwrites the existing object (`upsert: true`), so there is never an
  orphaned prior file to separately clean up on replace.
- **Fixed MIME allowlist:** `image/jpeg`, `image/png`, `image/gif`,
  `image/webp`. **Fixed max size:** 2,097,152 bytes (2 MB) - both constants
  in the upload route, not event-configurable (see Out of scope).
- **Signed URLs:** generated fresh server-side per request, 3,600-second
  (1-hour) expiry, matching `my-questions.get.ts`'s existing precedent - never
  persisted, never generated client-side.
- **Response envelope:** `{ success, data, error }` throughout, matching
  every other server route in this project. GET returns
  `{ logoUrl: string | null, sponsorLogoUrl: string | null }`. POST returns
  `{ url: string }` (the freshly uploaded object's signed URL). DELETE
  returns `null` data on success.
- **Authorization:** `verifyEventAccess(event, eventId)` on every route,
  re-deriving the caller's identity from their bearer token and fresh
  service-role lookups - never a client-supplied id or role, matching this
  project's one existing precedent for this exact authorization shape.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. Live behavior - a real upload against a real Supabase project,
the generated signed URLs resolving, and the signage canvas actually drawing
a logo - cannot be exercised without a dev server and cannot be claimed here,
matching the disclosed caveat on every prior Storage or canvas feature
(6-10, 29a).

`npm run build` was run after all four steps and passed cleanly (only
pre-existing, unrelated dependency deprecation warnings appeared).

## Notes for the AI

- Do not add Storage RLS policies for `event-branding` - the private bucket
  plus service-role-only routes is this project's deliberate, already-shipped
  pattern (29a), not a gap this feature needs to close.
- Do not invent a display location for the sponsor logo, or add the logo to
  any surface besides the Signage graphic - no feature has specified either.
- Do not fold "background image" into this feature's scope, and do not let
  it silently disappear from the roadmap either - it is named in Out of
  scope specifically so it stays visible as an unscheduled gap.
- Do not attempt to apply `accent_color`/`background_color`/`theme_mode`
  anywhere while touching the Branding tab or the attendee page - that gap
  predates this feature and is not in scope here.
- Reuse `verifyEventAccess` exactly as `moderator-password.post.ts` does; do
  not re-implement admin/Event-Manager authorization inline in the new
  routes.
- Keep the no-logo signage path pixel-identical to Feature 8's original
  output; the logo box, spacing, and crossOrigin handling are additive, not
  a rework of the existing layout.

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
