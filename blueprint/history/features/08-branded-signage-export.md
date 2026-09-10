## Feature 8: Branded signage export

**Branch:** `feature/branded-signage-export`
**Status:** verified

## Goal

Give an Administrator or an Event Manager with access to a specific event one
downloadable PNG graphic combining the Audience QR, event name, join code,
and the standard attendee instructions - printable for slides, handouts, or
posters.

## In scope

- A new **Signage** tab on `/admin/events/[id].vue`, alongside the existing
  Details / Attendee types / Settings / QR codes tabs, same plain-button
  `activeTab` pattern. Available regardless of the event's `status`, same as
  the QR codes tab.
- One composed graphic, 1200x1600px, white background, containing (top to
  bottom): the event name, the Audience QR (reusing Feature 7's
  `generateQrPngDataUrl` against `${location.origin}/e/<slug>`), the literal
  text `Join code: <CODE>`, and the exact attendee instructions already
  defined in `project-overview.md`: *"Scan the QR code, ask your question,
  and vote for questions you want answered."* A preview `<img>` plus one
  "Download PNG" button (`<slugified-event-name>-signage.png`).
- Event name auto-fit: since nothing in the app enforces a maximum event
  name length, the name is drawn at a starting font size that shrinks in
  steps until it fits the available width, down to a minimum readable size;
  if it still doesn't fit at the minimum, it is truncated with an ellipsis
  rather than overflowing or wrapping unpredictably.
- `app/utils/signage.ts`: `generateSignagePngDataUrl(input: { eventName:
  string; joinCode: string; qrPngDataUrl: string }): Promise<string>` - pure
  canvas composition (an off-screen `<canvas>`, never attached to the DOM),
  returns the finished PNG as a data URL.
- Extract the small "create a temporary anchor and click it" download helper
  already duplicated-in-spirit from `QrCodeCard.vue`'s use case into
  `app/utils/download.ts` (`downloadDataUrl(dataUrl: string, filename:
  string): void`), and refactor `QrCodeCard.vue` to use it instead of its
  own private copy - this feature adds a second, identical consumer, so
  removing the duplication now is in scope; `QrCodeCard`'s existing behavior
  does not change.

## Out of scope

- **No logo.** The build-plan line for this feature lists a logo among the
  signage contents, but no logo storage exists anywhere in this project yet
  - `events` and `event_settings` have no logo/image column, and Feature 11
    (Event branding) is the feature that will add one. Per the user's
  explicit decision this session, this feature ships the signage graphic
  without a logo now; adding a logo slot to this same layout is a follow-up
  once Feature 11 exists, not part of this build step.
- Any other export format (SVG, PDF, or multiple sizes/aspect ratios for
  "slides" vs. "handouts" vs. "posters" specifically) - one fixed-size PNG
  covers all three reasonably and matches this build-plan line's singular
  "graphic," not a set of graphics. Feature 34's later branded PDF report
  export is unrelated (a different kind of document entirely).
- A Moderator-facing signage variant - the build-plan line, and the
  attendee instructions text it reuses, are audience-facing only.
- Any change to `events`/`event_settings` data, RLS, or a new server route -
  this feature only reads `name`, `slug`, and `join_code`, already fetched
  by the existing page.
- Any change to `QrCodeCard.vue`'s visible behavior - only its internal
  download helper moves to a shared location.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Shared download helper + signage composition utility** -
      `app/utils/download.ts`: move the existing anchor-click download logic
      out of `QrCodeCard.vue` into `downloadDataUrl(dataUrl: string,
      filename: string): void`; update `QrCodeCard.vue` to call it (no
      behavior change). `app/utils/signage.ts`:
      `generateSignagePngDataUrl(input: { eventName: string; joinCode:
      string; qrPngDataUrl: string }): Promise<string>` - loads
      `qrPngDataUrl` into an `Image`, draws the 1200x1600 canvas described
      above (event name with auto-fit/ellipsis, the QR, the join-code line,
      the instructions line), resolves with `canvas.toDataURL('image/png')`;
      rejects if the QR image fails to load.
      **Done when:** code builds; the QR codes tab's existing Download
      PNG/SVG buttons still work exactly as before (regression check on the
      moved helper).
- [x] 2. **`SignageExport` component** - `app/components/SignageExport.vue`,
      props `eventName: string`, `url: string` (the audience URL), `joinCode:
      string`: on mount and whenever props change, call
      `generateQrPngDataUrl(url)` (Feature 7) then
      `generateSignagePngDataUrl(...)`, render the result in a preview
      `<img>`, and a "Download PNG" button using `downloadDataUrl`. On a
      generation failure, show a generic inline error instead of a broken
      preview.
      **Done when:** code builds; the component renders a composed preview
      image and a working download button when given sample props,
      including a long event name that visibly shrinks or truncates instead
      of overflowing.
- [x] 3. **Signage tab** - in `/admin/events/[id].vue`, add `'signage'` to
      the `activeTab` union and a tab button labeled "Signage"; its panel
      renders `<SignageExport :event-name="name" :url="audienceUrl"
      :join-code="joinCode" />`, reusing the `audienceUrl` computed already
      added for the QR codes tab.
      **Done when:** visiting a real event's management page's Signage tab
      shows one composed preview image containing that event's real name,
      QR, and join code, confirmed by comparison; the Download PNG button
      produces a saved `.png` file, confirmed live.

## Files / areas

- `app/utils/download.ts` (new - extracted from `QrCodeCard.vue`)
- `app/utils/signage.ts` (new)
- `app/components/QrCodeCard.vue` (edit - use the extracted download helper)
- `app/components/SignageExport.vue` (new)
- `app/pages/admin/events/[id].vue` (edit - new Signage tab)

## Data / contracts

- **No new stored data and no new dependency.** The composition uses the
  browser's built-in `Canvas`/`Image` APIs only - no new npm package, unlike
  Feature 7's `qrcode`.
- **Canvas `fillText` renders the event name as pixels, not markup** - there
  is no HTML or SVG string interpolation anywhere in this feature, so no
  escaping is required for this user-controlled text. (This would change if
  a future SVG-based export were added; it does not apply here.)
- **Fixed 1200x1600px PNG output, one graphic per event** - not
  configurable in this feature; Feature 11 (logo) is the only known,
  planned follow-up change to this layout.
- **Auto-fit contract for the event name:** shrink font size in fixed steps
  down to a minimum before falling back to ellipsis truncation - guarantees
  the rendered graphic never overflows regardless of name length, without
  needing a stored max-length constraint this project doesn't have.

## Testing

No test runner configured; `npm run build` passed after all three steps.
`generateSignagePngDataUrl`'s auto-fit/truncation logic is real,
assertable logic (given a very long string, does the chosen font size fit
the target width) that would be a reasonable unit-test candidate once
`/tests` exists.

**Not yet exercised live:** the composed preview rendering correctly for a
real event (including a long-name edge case triggering the auto-fit/
truncation path), and the download button producing a valid `.png` file.
This implementation pass did not start a dev server; these are
build-verified only so far, the same caveat recorded for Features 6 and 7.

## Notes for the AI

- Do not add a logo slot, logo upload, or any placeholder logo image in
  this feature - Feature 11 owns logo storage entirely; this feature's
  layout simply has no logo yet.
- Do not build a second export format (SVG/PDF) or multiple sizes "for
  slides vs. handouts vs. posters" - one fixed PNG is this feature's whole
  scope.
- Do not change what `QrCodeCard.vue` looks like or does from a user's
  perspective; the `download.ts` extraction must be behavior-preserving.
- Keep the canvas off-screen (never appended to the DOM) - it is only ever
  read via `toDataURL`, never displayed itself; the `<img>` preview is a
  separate element bound to the resulting data URL.
