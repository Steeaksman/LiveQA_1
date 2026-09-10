## Feature 7: QR code generation

**Branch:** `feature/qr-code-generation`
**Status:** verified

## Goal

Give an Administrator or an Event Manager with access to a specific event a
downloadable Audience QR (to `/e/<slug>`) and Moderator QR (to `/m/<slug>`),
each as PNG and SVG, on that event's management page.

## In scope

- A new **QR codes** tab on `/admin/events/[id].vue`, alongside the existing
  Details / Attendee types / Settings tabs, following the same plain-button
  `activeTab` pattern (not `UTabs`). Available regardless of the event's
  `status` - nothing here requires the event to be `live` (an admin may want
  to prepare and print materials before publishing).
- Two QR codes, each rendered as a preview image plus its exact encoded URL
  shown as text (so correctness is checkable without a phone), plus
  "Download PNG" and "Download SVG" buttons:
  - **Audience QR** encodes `${window.location.origin}/e/<slug>` - the
    Feature 6 attendee route.
  - **Moderator QR** encodes `${window.location.origin}/m/<slug>`. This
    route does not exist yet; see Out of scope.
  Both use the event's current `window.location.origin` (wherever the app
  is actually being run from - localhost in dev, the real domain once
  deployed) rather than a stored or hardcoded production URL, since no such
  configured value exists anywhere in this project yet and inventing one
  here would duplicate Feature 41's deployment configuration.
- `app/utils/qr-code.ts`: `generateQrPngDataUrl(text: string):
  Promise<string>` and `generateQrSvgMarkup(text: string): Promise<string>`,
  thin typed wrappers around the new `qrcode` package, generated entirely
  client-side (no server route) - consistent with how every other admin
  page in this project reads/writes directly through the browser's
  Supabase client under RLS, and avoids needing the native `canvas` package
  server-side.
- `app/components/QrCodeCard.vue`: a small presentational component (props:
  `label: string`, `url: string`) used twice in the new tab for the two
  near-identical Audience/Moderator blocks, to avoid duplicating the same
  preview-plus-two-buttons markup in the page.
- New dependencies: `qrcode` (runtime) and `@types/qrcode` (dev), added via
  `npm install qrcode` / `npm install -D @types/qrcode`. Nothing else in the
  project currently generates a QR code.

## Out of scope

- `/m/<slug>` itself, and moderator authentication generally - Feature 19
  builds the actual password-gated page at that route. Downloading and
  scanning the Moderator QR before then correctly reaches Nuxt's default
  not-found page, the same kind of expected, named gap Feature 6 already
  established for `/e/<slug>` reaching this codebase before Feature 12.
  `/m/<slug>` is chosen now (mirroring `/e/<slug>`'s brevity) because
  Feature 1's data model already settled the actual security boundary for
  moderator access as the event's password (Feature 19), not URL secrecy -
  reusing the existing `slug` here commits to nothing Feature 19 could not
  freely rename later.
- Branded signage (logo, event name, join code, and instructions combined
  with a QR into one exportable graphic) - Feature 8, which can reuse this
  feature's `qr-code.ts` helpers.
- Any change to `moderator_access_enabled` or any other event setting -
  this feature only renders and downloads static images from data already
  on the page.
- Any new RLS policy or server route - the page already has everything it
  needs (the event's `slug`) from the existing fetch in `onMounted`.
- Editing or regenerating the underlying slug/join code - Feature 6, already
  built; this feature only reads the current `slug`.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **QR generation utility** - `npm install qrcode` and `npm install
      -D @types/qrcode`; add `app/utils/qr-code.ts` exporting
      `generateQrPngDataUrl(text: string): Promise<string>` (wraps
      `QRCode.toDataURL`) and `generateQrSvgMarkup(text: string):
      Promise<string>` (wraps `QRCode.toString(text, { type: 'svg' })`).
      **Done when:** code builds.
- [x] 2. **`QrCodeCard` component** - `app/components/QrCodeCard.vue`,
      props `label: string` and `url: string`: on mount (and whenever
      `url` changes), call `generateQrPngDataUrl(url)` and render the
      result in an `<img>`; show `label` and the literal `url` as text
      below it; a "Download PNG" button using the already-generated data
      URL and a "Download SVG" button that calls
      `generateQrSvgMarkup(url)`, wraps the result in a `Blob`, and
      triggers a download via a temporary anchor's `download` attribute
      (`<slugified-label>-qr.png` / `.svg` as the filename).
      **Done when:** code builds; the component renders a QR image and the
      correct label/URL text when given sample props.
- [x] 3. **QR codes tab** - in `/admin/events/[id].vue`, add `'qr-codes'`
      to the `activeTab` union and a tab button labeled "QR codes"; its
      panel renders two `QrCodeCard`s: `label="Audience"` /
      `:url="`${location.origin}/e/${slug}`"` and `label="Moderator"` /
      `:url="`${location.origin}/m/${slug}`"`.
      **Done when:** visiting a real event's management page's QR codes
      tab shows two distinct QR images, each with its correct encoded URL
      printed as text (the real event's slug, confirmed by comparison);
      each Download PNG/SVG button produces a saved file with the
      expected extension, confirmed live.

## Files / areas

- `package.json` / `package-lock.json` (edit - add `qrcode`, `@types/qrcode`)
- `app/utils/qr-code.ts` (new)
- `app/components/QrCodeCard.vue` (new)
- `app/pages/admin/events/[id].vue` (edit - new QR codes tab)

## Data / contracts

- **No new stored data.** Both QR codes are derived entirely from the
  already-fetched `slug` and the browser's own `location.origin` at render
  time; nothing about a QR code is persisted or served from the backend.
- **`/m/<slug>` is a naming convention this feature introduces, not a
  built route.** Feature 19 owns building the actual page there; this
  feature only needs the string to be stable and predictable, which
  reusing the existing `slug` (rather than inventing a second identifier)
  guarantees without any schema change.
- **No client-side role branch for viewing/downloading QR codes**, matching
  Features 5 and 6: reaching this event's management page at all already
  means RLS (`events_select`) allowed it.
- **PNG and SVG encode the identical URL string** - the two formats are
  purely a file-format choice for downstream use (signage, printing), not
  two different pieces of information.

## Testing

No test runner configured; `npm run build` passed after all three steps
(`qrcode` and `@types/qrcode` installed cleanly, no type or build errors).
`generateQrPngDataUrl`/`generateQrSvgMarkup` are thin wrappers around a
well-tested third-party library rather than novel logic, so they are a
weaker unit-test candidate than Feature 4a/6's `slugify`/join-code helpers
- if `/tests` is added later, a focused test could still assert each
wrapper calls the underlying `qrcode` function with the exact input text
and returns its result.

**Not yet exercised live:** rendering both QR images on a real event's
management page, confirming each encodes the correct URL, and confirming
each Download PNG/SVG button produces a valid, correctly named file. This
implementation pass did not start a dev server; these are build-verified
only so far, the same caveat recorded for Feature 6.

## Notes for the AI

- Do not build `/m/<slug>` in this feature - Feature 19 owns it. Reaching
  Nuxt's default not-found page when actually scanning the Moderator QR
  before then is expected, not a bug to route around here.
- Do not invent a configured production base URL (an env var, a constant,
  etc.) for the QR content - use `window.location.origin` so the same code
  is correct in dev and in production without extra configuration Feature
  41 hasn't defined yet.
- Do not add signage composition (logo, event name, join code, instructions
  combined into one image) here - that is Feature 8's job, reusing this
  feature's `qr-code.ts` helpers rather than duplicating QR-generation
  logic.
- Generate QR codes client-side only; do not add a server API route for
  this feature - there is no privileged operation or data here that the
  browser cannot already do with what the page has fetched.
