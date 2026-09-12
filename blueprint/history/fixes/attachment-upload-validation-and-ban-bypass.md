# Attachment upload validation and ban bypass

**Type:** Fix
**Status:** verified
**Branch:** `fix/attachment-upload-validation-and-ban-bypass`
**Fixes:** F-01, F-02

## The problem

Two confirmed findings from the full-project security audit, both in the
attachment/logo upload surface:

- **F-01:** `server/api/attachments.post.ts` and `server/api/admin/events/[id]/branding-logo.post.ts`
  both validate an uploaded file only by checking the multipart part's
  client-declared `Content-Type` against an allowlist
  (`ALLOWED_MIME_TYPES.includes(file.type)`). That header is entirely
  client-controlled - a file can be labeled `image/png` regardless of its
  actual content, and gets stored with that same forged content-type.
- **F-02:** `server/api/attachments.post.ts` never checks whether the
  attendee is currently banned (`attendees.banned_until`), unlike
  `questions.post.ts`, `replies.post.ts`, and `votes.post.ts`, which all
  call `isAttendeeBanned` before accepting a write. A banned attendee can
  still upload attachments to their own existing questions during the ban.

## The fix

- Add a small, dependency-free file-signature checker
  (`server/utils/detect-file-type.ts`) that verifies a buffer's actual
  leading bytes match the signature expected for a declared MIME type,
  covering exactly the five types this app already allows: JPEG, PNG, GIF,
  WEBP, and PDF. No new npm dependency - the fixed, narrow set of allowed
  types makes a hand-rolled magic-byte check sufficient and avoids adding a
  dependency for something this small.
- Call it in both `attachments.post.ts` and `branding-logo.post.ts`
  immediately after the existing `ALLOWED_MIME_TYPES.includes(file.type)`
  check, rejecting with the same existing `UNSUPPORTED_TYPE_ERROR` /
  `INVALID_SLOT_ERROR`-adjacent message when the content doesn't match the
  declared type.
- Add an `isAttendeeBanned(attendee.id)` check to `attachments.post.ts`
  right after the attendee is resolved (mirroring where `votes.post.ts`
  places its own ban check), returning 429 with the existing
  `TEMPORARILY_RESTRICTED_ERROR` from `enforce-abuse-protection.ts` when
  banned.
- Must not break: legitimate uploads of the five already-allowed file
  types, the existing size-limit and count-limit checks, and the existing
  response envelope/error messages for every other rejection path in both
  routes.

## Build steps

- [x] 1. **File-content signature check (F-01)** - add
      `server/utils/detect-file-type.ts` and wire it into both
      `attachments.post.ts` and `branding-logo.post.ts`.
      **Done when:** code builds; a file whose declared MIME type doesn't
      match its actual leading bytes is rejected with the existing
      unsupported-type error in both routes; a genuine JPEG/PNG/GIF/WEBP
      (and PDF for attachments) still passes (confirmed by code review,
      since exercising real file uploads against a live server is outside
      this skill).
- [x] 2. **Ban check on attachment upload (F-02)** - add the
      `isAttendeeBanned` check to `attachments.post.ts`.
      **Done when:** code builds; a banned attendee's upload attempt
      returns 429 with `TEMPORARILY_RESTRICTED_ERROR` before any other
      attachment-specific validation runs (confirmed by code review).

## Verify

`npm run build` passes. Code review confirms: (a) both upload routes reject
content/type mismatches using real magic-byte signatures for all five
allowed types, not just the declared header; (b) `attachments.post.ts`
checks `isAttendeeBanned` before accepting an upload, in the same place and
style as `votes.post.ts`'s existing ban check. Live verification (uploading
a real disguised file, or testing as a genuinely banned attendee) requires
a running server and real Supabase project, outside this skill.

## Findings

### attachment-upload-validation-and-ban-bypass/F-01 [P1] closed - Attachment uploads trust the client-declared file type instead of its content

**File:** server/api/attachments.post.ts:117, server/api/admin/events/[id]/branding-logo.post.ts:61
**Found:** 2026-09-12 by /audit (scope: full; lens: security)
**Why it matters:** Both routes validate an uploaded file only by checking the multipart part's declared `Content-Type` header against an allowlist (`ALLOWED_MIME_TYPES.includes(file.type)`). That header is entirely client-controlled - an attacker can label an HTML/SVG file containing a script payload as `image/png` and pass the check. The file is then stored with that same forged content-type (`.upload(..., { contentType: file.type })`), so Supabase Storage will very likely serve it back with that header later. The attendee feed, moderator queue, and My Questions view all render `viewUrl` as a plain `<a href target="_blank">`, so a moderator or attendee could open the disguised file directly. Whether this is exploitable end-to-end depends on Supabase Storage's exact content-type/`nosniff` behavior, which this audit could not verify without a live project, but the underlying validation gap - trusting client-declared type over actual content - is a confirmed, concrete missing guard either way.
**Suggested fix:** Sniff the actual file content (magic bytes) server-side before accepting it - e.g. verify the first bytes match a real image/PDF signature for the declared type - rather than trusting `file.type` alone. Apply the same fix to both routes since they share the identical pattern.
**Resolution:** Fixed via `fix/attachment-upload-validation-and-ban-bypass`: added `server/utils/detect-file-type.ts` (magic-byte signature check for the five allowed types) and wired it into both `attachments.post.ts` and `branding-logo.post.ts` alongside the existing declared-type allowlist check. Re-reviewed 2026-09-12 by `/audit current`: verified each signature check (JPEG/PNG/GIF/WEBP/PDF) matches the real file-format magic bytes, confirmed `declaredType` is always one of the allowlisted strings by the time it reaches the checker (short-circuit `||` order), and confirmed a forged `Content-Type` on non-matching content is now rejected in both routes. `npm run build` passed. Closed.

### attachment-upload-validation-and-ban-bypass/F-02 [P1] closed - Attachment upload does not enforce the abuse-protection ban

**File:** server/api/attachments.post.ts
**Found:** 2026-09-12 by /audit (scope: full; lens: security)
**Why it matters:** `questions.post.ts`, `replies.post.ts`, and `votes.post.ts` all call `isAttendeeBanned` (directly or via `enforceSubmissionRateLimit`) before accepting a write from an attendee. `attachments.post.ts` has no such check anywhere in the handler, so a temporarily banned attendee (via `attendees.banned_until`) can still upload files to their own already-submitted questions for the duration of their ban. The impact is bounded - an attacker can only attach to questions they already own, not create new content or reach other events - but it is a real, confirmed inconsistency in an abuse-protection mechanism the build plan explicitly names as a security-hardening concern.
**Suggested fix:** Call `isAttendeeBanned(attendee.id)` (and consider `enforceSubmissionRateLimit`, matching questions/replies) near the top of the handler in `attachments.post.ts`, once the attendee is resolved, returning the same `TEMPORARILY_RESTRICTED_ERROR` / 429 the other routes use.
**Resolution:** Fixed via `fix/attachment-upload-validation-and-ban-bypass`: added an `isAttendeeBanned(attendee.id)` check in `attachments.post.ts` immediately after the attendee is resolved, returning 429 with `TEMPORARILY_RESTRICTED_ERROR`, matching `votes.post.ts`'s existing placement and error. Re-reviewed 2026-09-12 by `/audit current`: confirmed the check runs before question lookup and every other attachment-specific validation, confirmed it matches `votes.post.ts`'s exact pattern, and found no path that reaches the upload logic without first passing this check. `npm run build` passed. Closed.
