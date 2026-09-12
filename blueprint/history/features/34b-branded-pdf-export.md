## Feature 34b: Branded PDF export

**Branch:** `feature/branded-pdf-export`
**Status:** verified

## Goal

Add branded PDF as a third export format alongside 34a's CSV and
printable HTML, resolving `project-overview.md`'s own long-standing
"Open questions" entry: "SiteGround-compatible PDF generation approach
for branded report exports - decide when Report export is built." This
is that decision.

**Resolved before writing this spec (split already approved separately;
each point below is inferred from repository evidence, not invented from
nothing):**

1. **PDF library: `pdfkit`.** The build-plan line's own constraint is "no
   headless-browser/Vercel dependency," which rules out Puppeteer/
   Playwright-based HTML-to-PDF (a full Chromium binary is exactly the
   "headless-browser dependency" being avoided, and is a poor fit for
   SiteGround shared/Node hosting). `pdfkit` is a pure-JavaScript,
   programmatic PDF-drawing library with no browser or native-binary
   dependency, runs in plain Node.js, and is this project's established
   pattern for adding a narrowly-scoped new dependency when nothing
   existing covers the need (`qrcode`, Feature 7, is the only prior
   precedent - same shape: one focused library, `dependencies` +
   `@types/qrcode` in `devDependencies`). This feature adds `pdfkit` and
   `@types/pdfkit` the same way, via `npm install` so the actual current
   published version is resolved and pinned, not guessed.
2. **The PDF reuses 34a's exact data aggregation and redaction rules** -
   `buildEventReportData`, unchanged - so anonymity redaction, the
   `hide_vote_counts` exemption, and the top-voted tie behavior are all
   already correct by construction; this feature only adds a new
   rendering of the same data.
3. **"Branded" means the event's accent color and primary logo**, not
   every branding field. `theme_mode` (light/dark) is not applied - a
   PDF is a printed-document convention that stays light/print-friendly
   regardless of an event's live dark-mode preference, the same reasoning
   34a's printable HTML already applied to its own print stylesheet.
   Sponsor logo is not included, matching Feature 8/11b's established
   precedent that only the primary logo appears in generated
   documents (signage) - sponsor logo has never had a second display
   location named anywhere in this project.
4. **Replies and attachments are summarized as counts in the PDF, not
   fully listed inline.** `pdfkit`'s API is programmatic drawing (text/
   shapes/images with manual layout), not an HTML-table renderer -
   unlike 34a's CSV cells or HTML `<table>`, laying out a fully nested
   reply/attachment list per question is materially more layout work for
   a document whose full detail is already available from the same
   generation flow's CSV or HTML export. A PDF row shows `N repl{y,ies},
   N attachment(s)` rather than each one's content.
5. **The logo is read directly from Storage as bytes, not a signed URL.**
   `pdfkit`'s `.image()` needs image data (a `Buffer`), and this route
   already runs with the service-role client that can `.download()` the
   object directly - a signed URL would be a pointless extra round trip
   for a value already reachable server-side.

## In scope

- **`package.json` (edit).** Adds `pdfkit` to `dependencies` and
  `@types/pdfkit` to `devDependencies` via `npm install`/
  `npm install --save-dev`, letting npm resolve and pin the current
  published versions.
- **`server/utils/build-report-pdf.ts` (new).** `buildReportPdf(data:
  CombinedReportData | TopicByTopicReportData, branding: { accentColor:
  string | null, logoBuffer: Buffer | null, eventName: string }):
  Promise<Buffer>` - creates a `PDFDocument`, collects its output chunks
  into a `Buffer` (resolved on the document's `'end'` event, matching
  `pdfkit`'s standard Node stream-buffering pattern). Renders: a header
  with the logo (if provided, top-left) and the event name in the
  accent color (if provided, else a default dark color) as the title;
  participation count and generated-at timestamp; then, for `'combined'`
  data, one paragraph block per question, or for `'topic_by_topic'`
  data, one heading per topic followed by its question blocks. Each
  question block shows the fields named in the resolved notes above,
  replies/attachments as trailing summary counts, and a starred marker
  for `isTopVoted`. Adds a new page when content would overflow the
  current one (`pdfkit`'s built-in page-break handling via its content
  stream API).
- **`server/api/admin/events/[id]/reports.post.ts` (edit).** Accepts
  `format: 'pdf'` in addition to `'csv' | 'html'`. For `'pdf'`: after
  building the aggregation, also reads `event_settings.accent_color` and
  `logo_storage_path` and, when a logo path exists,
  `.download()`s it from `event-branding` and converts it to a `Buffer`;
  calls `buildReportPdf`; uploads the resulting buffer to `event-reports`
  at `${eventId}/${reportId}.pdf` with `contentType: 'application/pdf'`.
- **`app/pages/admin/events/[id].vue` (edit).** Adds `{ label: 'Branded
  PDF', value: 'pdf' }` to the existing format select's options; no
  other change - the same Generate button, request, and past-reports
  list already handle any format value generically.

## Out of scope

- **Applying `theme_mode` or `background_color` to the PDF** - per the
  resolved note above, only accent color and the primary logo are
  applied; a PDF stays a light, print-oriented document regardless of
  the event's live dark-mode preference.
- **Including the sponsor logo** - no display location has ever been
  named for it anywhere in this project (11b's own disclosed scope
  note); this feature does not invent one.
- **Fully listing reply text or attachment details inline in the PDF** -
  summarized as counts, per the resolved note above; the same
  generation's CSV or HTML export already carries the full detail.
- **Any change to 34a's CSV or HTML output, or to
  `build-event-report-data.ts`** - this feature only adds a third
  renderer of the same, unchanged aggregation.
- **Custom fonts, embedded branding beyond color and logo, or a
  multi-page cover design** - `pdfkit`'s default font and a simple
  header are this feature's entire visual scope; nothing here builds a
  polished template system.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Add the `pdfkit` dependency** via `npm install pdfkit` and
      `npm install --save-dev @types/pdfkit`.
      **Done when:** `package.json` lists both, `npm run build` still
      passes.
- [x] 2. **PDF builder** - `server/utils/build-report-pdf.ts` per the
      contract above.
      **Done when:** code builds; calling it with sample aggregation data
      and no branding produces a non-empty `Buffer` (confirmed by code
      review, since exercising a real PDF viewer requires a live
      environment outside this skill); calling it with an accent color
      and logo buffer does not throw.
- [x] 3. **Wire PDF into the generation route** -
      `server/api/admin/events/[id]/reports.post.ts` per the contract
      above.
      **Done when:** code builds; requesting `format: 'pdf'` builds and
      uploads a `.pdf` object with `contentType: 'application/pdf'` and
      logs the same `'report_generated'` audit action as the other two
      formats; a missing logo does not fail generation (the header
      renders without an image).
- [x] 4. **Format option in the Reports tab** - the `reportFormatOptions`
      addition in `/admin/events/[id].vue` per the contract above.
      **Done when:** code builds; "Branded PDF" appears in the format
      select and generating it calls the same existing flow.

## Files / areas

- `package.json` (edit)
- `server/utils/build-report-pdf.ts` (new)
- `server/api/admin/events/[id]/reports.post.ts` (edit)
- `app/pages/admin/events/[id].vue` (edit)

## Data / contracts

- **New runtime dependency: `pdfkit@0.20.2`** (plus `@types/pdfkit@0.17.6`
  for development), resolved and pinned by `npm install` - this
  project's second added dependency after `qrcode` (Feature 7), both
  narrowly scoped, pure-JavaScript, no native binary or headless-browser
  requirement.
- **PDF content reuses `QuestionReportRow` and the `CombinedReportData`/
  `TopicByTopicReportData` shapes from 34a unchanged** - no new
  aggregation contract.
- **Storage path convention is unchanged**:
  `${eventId}/${reportId}.pdf`, the same deterministic-path pattern as
  the `.csv`/`.html` objects.
- **Branding read for the PDF is `accent_color` and `logo_storage_path`
  only** - both already-existing `event_settings` columns (Features 11a,
  11b); no new column, no new Storage bucket.
- **Response and audit-log shapes are unchanged from 34a** - `'pdf'` is
  simply a third valid value for the existing `format` field everywhere
  it already appears.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** a real generated PDF actually
opening correctly in a PDF viewer, the logo rendering when present, and
page breaks behaving correctly for an event with many questions - all
require a dev server, a real Supabase project, and manual visual
inspection of the output file, none of which this skill can perform.

`npm run build` was run after all four steps and passed cleanly (only
pre-existing, unrelated dependency deprecation and plugin-timing warnings
appeared); `reports.post.mjs` grew from 13.8kB to 17kB in the build
output, confirming the PDF wiring compiled in.

## Notes for the AI

- Do not use Puppeteer, Playwright, or any headless-browser/HTML-to-PDF
  approach - `pdfkit` is the resolved, disclosed choice, per the
  resolved note above.
- Do not modify `build-event-report-data.ts`, `build-report-csv.ts`, or
  `build-report-html.ts` - this feature only adds a third renderer.
- Do not apply `theme_mode`/`background_color` or include the sponsor
  logo in the PDF.
- Do not fully render reply text or attachment lists inline - counts
  only, per the resolved note above.
- Let a missing/unset logo degrade gracefully (no image, not an error).

## Findings

_No findings recorded._

## Independent review

_No independent review requested._
