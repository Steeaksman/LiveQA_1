# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-03 [P2] open - Repeated event/attendee-lookup logic across the attendee-facing surface

**File:** server/api/questions.post.ts, server/api/replies.post.ts, server/api/votes.post.ts, server/api/attachments.post.ts, server/utils/find-editable-question.ts
**Found:** 2026-09-12 by /audit (scope: full; lens: quality)
**Why it matters:** Each of these five files independently reimplements the same three-step check: look up the event by id and require `status === 'live'`, then look up the attendee by `event_id` + `token`. The admin and moderator surfaces already extracted this exact kind of check into shared helpers (`verifyEventAccess`, `verifyModeratorSession`), but the attendee surface has no equivalent. A future change to this logic (a new event lifecycle state, an additional attendee-eligibility check) risks being applied to some call sites and missed in others.
**Suggested fix:** Extract a shared `resolveAttendee(eventId, token)` helper (mirroring `verifyModeratorSession`'s shape) that the five call sites can share.
**Resolution:**
