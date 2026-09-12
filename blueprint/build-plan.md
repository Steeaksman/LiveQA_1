# Build Plan

> One of the two planning docs you provide. Write it directly, develop it through
> any AI conversation, or optionally run `/discovery`. Keep the items high-level
> even when `project-plan.md` is detailed; later `/feature` specs hold the depth
> for each build item.

The features that make up this project, high level and in rough build order, one
line each, no detail (that comes per feature). Rough is fine at first, but before
`/overview` runs this file should be shaped into a checkbox list the build loop
can track.

Keep it as a checklist. Run `/feature` with no number to spec the **next
unchecked** item, or `/feature 3` / `/feature "login"` to pick a specific one.
Completed features get checked off here, so the build plan doubles as your
progress tracker. A big item gets split into sub-items (4a, 4b, etc.) when you
spec it.

## Continuing after the initial build

This is a living roadmap, not a plan that freezes when the first release is
done. Keep completed items checked, then append new unchecked features as the
project grows. Optional milestone headings such as `## MVP` and `## Post-MVP`
keep a longer plan readable without changing how `/feature` finds the next
unchecked item.

Do not renumber completed features because their archived specs refer back to
those numbers. Continue with the next unused number. If a new feature materially
changes the product direction, users, data, stack, monetization, UI/UX, or
deployment, update the relevant part of `project-plan.md` too. Then re-run
`/overview` before spec'ing the feature.

You can edit this file directly or ask the AI to start a new feature by name. If
`/feature "team workspaces"` does not match an existing item, it will propose the
new build-plan line and any necessary project-plan changes, wait for approval,
refresh the overview, and then write the feature spec.

Scaffolding the app (create-next-app, etc.) and prototyping the look are
pre-build steps, not features (see the README), so don't list them here. Start
with your first real slice of functionality.

A common order that works well: build the core UI with placeholder data first,
then wire up data, auth, and integrations. Add deployment readiness only when
the app is worth shipping or a provider config change is part of the work. Adapt
it to your project.

## Format

Use checkboxes. Each item should be a feature-sized outcome, not a loose task or
a whole product area.

Good:

- [ ] 1. **Skill submission** - upload a skill package and save its metadata
- [ ] 2. **Validation result** - run checks and show pass/fail status for a skill
- [ ] 3. **Directory listing** - browse and filter published skills
- [ ] 4. **Deployment readiness** - configure Render or Vercel and verify the
  production build

Avoid:

- Upload stuff
- Database
- Make it look nice
- Auth, billing, dashboard, validation, and deploy

If your first pass is just rough bullets, that is okay. Run `/overview` after
filling both planning docs; it will flag plan-shape problems and can propose a
cleaned-up checkbox version before generating the project overview.

## MVP

**Foundation**

- [x] 1. **Supabase project & schema** - migrations for all core tables, enums, indexes, and RLS policies so a fresh Supabase project is reproducible from the repo
- [x] 2. **Administrator authentication** - Supabase Auth login and system-wide admin access
- [x] 3. **Event Manager accounts & permissions** - global vs. restricted (assigned-events-only) access, enforced in UI, server logic, and RLS

**Event administration**

- [x] 4. **Event creation wizard** - step-by-step flow producing a draft event. Split into sub-items because most later wizard steps (replies, branding, attachments, anonymity, abuse tiers, join-code customization/QR) are already owned by their own later build-plan features and grow the wizard incrementally when they ship, per Feature 1's `event_settings` design. Notifications and retention wizard steps are deferred - not yet decided anywhere in the plans.
  - [x] 4a. **Wizard shell + core details** - name, auto-generated slug/join-code (Feature 6 later adds customization), attendee types CRUD; produces a real draft event
  - [x] 4b. **Question/moderation/voting settings step** - the toggles Features 13/14/19-21 need soon: max question length, moderation mode, voting on/off, hide vote counts
  - [x] 4c. **Review & publish step** - draft to scheduled/live transition (in practice: draft or live only - see the archived spec for why `scheduled` was excluded)
- [x] 5. **Event tabbed management** - edit an existing event's settings after creation
- [x] 6. **Audience URL & join code** - unique friendly slug and short join code, both customizable and unique, plus the generic `/join` code-entry page
- [x] 7. **QR code generation** - Audience QR and Moderator QR, downloadable as PNG/SVG
- [x] 8. **Branded signage export** - QR + logo + event name + join code + instructions graphic for slides/handouts/posters
- [x] 9. **Event templates** - save and apply reusable event configuration bundles (no attendee/Q&A data)
- [x] 10. **Event duplication** - copy an event's configuration only (never questions, replies, votes, attendees, reports, attachments)
- [ ] 11. **Event branding** - logo, sponsor logo, accent/background color or image, button styling, welcome text, light/dark mode. Split into sub-items because logo/sponsor-logo upload needs a Supabase Storage bucket, upload validation, and storage policies that don't exist anywhere in this project yet (Feature 29 is the feature that builds general attachment/Storage support), while the color/text/dark-mode settings need no such infrastructure. Button styling is satisfied by the accent color once Feature 12+'s attendee UI applies it to buttons - no separate stored field. Background image, also named in this line, was never given its own sub-item by either 11a or 11b - still unbuilt and unscheduled; this parent stays unchecked until that gap is resolved (a new 11c, or an explicit decision to drop it from v1).
  - [x] 11a. **Branding: colors, text, dark mode** - accent color, background color, welcome text, and a light/dark mode preference, stored per event for later attendee-facing features to apply
  - [x] 11b. **Branding: logo & sponsor logo** - image upload via a new Supabase Storage bucket, with upload validation and storage policies, once that groundwork exists

**Attendee Q&A**

- [x] 12. **Attendee join flow & device identity** - opaque per-device token, configurable name/attendee-type requirement, attendee-type dropdown sourced from admin config
- [x] 13. **Public Q&A feed** - submit and list questions honoring the event's moderation mode and visibility rules
- [x] 14. **Voting** - one upvote per attendee per question, live counts, sort by votes/newest/oldest
- [x] 15. **Duplicate-question suggestions** - Postgres trigram/full-text similarity suggestions while typing, with the configurable strictness levels
- [x] 16. **Question search** - attendee-facing search over public questions only
- [x] 17. **My Questions & attendee edit/delete** - attendee's own submissions view, edit/delete window enforced server-side per event config
- [x] 18. **Anonymous questions & attendee-type visibility** - per-event anonymity modes and admin control over whether attendee type is publicly shown

**Moderation**

- [x] 19. **Moderator authentication** - moderator QR to password entry to secure event-scoped session, with hashed passwords and rate-limited attempts
- [x] 20. **Moderator queue & core actions** - approve, reject, hide, archive, mark answered, change visibility, change current topic, open/close submissions and voting
- [x] 21. **Bulk moderation & Archive All Unanswered** - multi-select actions plus the confirmed one-click unanswered-archive
- [x] 22. **Current speaker/topic tracking** - optional per-event topic setting that new questions inherit; existing questions keep their original topic
- [x] 23. **Moderator notifications** - visual (always on) plus opt-in sound/browser notifications
- [x] 24. **Attendee content reporting** - report a question/reply (deduped per attendee), surfaced to moderators for review

**Realtime & resilience**

- [x] 25. **Realtime sync** - attendee, moderator, and admin views update live for questions, votes, visibility, answered/archived state, replies, and current topic, each subscribed only to what it needs
- [x] 26. **Presence-based active counts** - approximate active attendee/moderator counts for admin/moderator views
- [x] 27. **Reconnect & polling fallback** - auto-reconnect, preserved unsent input, re-fetch on reconnect, duplicate-submission avoidance, connection indicator, and a polling fallback for essential public data

**Advanced features**

- [x] 28. **Replies/comments** - optional, independently moderated threaded responses to a question, included in reports. Split into sub-items because the reply submission/moderation/display core is one reviewable branch on its own, while extending Feature 24's reporting and Feature 25's realtime to now cover replies (both explicitly deferred to "Feature 28's job" when they were built, since replies didn't exist yet) is a separate, smaller, mechanical follow-up.
  - [x] 28a. **Reply submission, moderation & display** - attendee replies (moderated per the event's moderation mode, mirroring questions) and moderator-authored replies (auto-approved, no moderation), a moderator queue action set (approve/reject/hide/publish - no answered/archived, which replies don't have), and display on both the attendee feed and moderator queue
  - [x] 28b. **Reply reporting & realtime** - extend Feature 24's report mechanism and Feature 25's Realtime RLS/publication/channel to cover replies now that they exist
- [x] 29. **Attachments** - optional image/document uploads via Supabase Storage with configurable type/size/count limits and secure server-side validation. Split into sub-items because the Storage bucket, event-configurable limits, upload endpoint, and attendee upload UI are one reviewable branch on their own, while showing uploaded attachments to other attendees and moderators (plus a moderator remove action) is a separate, smaller follow-up once something exists to display.
  - [x] 29a. **Storage groundwork, upload endpoint & attendee upload UI** - a private Supabase Storage bucket (all access via service-role routes, no Storage RLS needed), event-configurable max count/size, a fixed server-side file-type security allowlist, the upload endpoint, and an upload control in the attendee's own "My Questions" view (the only place an attendee's own-question identity is already exposed client-side)
  - [x] 29b. **Attachment display & moderation** - show uploaded attachments on the public feed and moderator queue, plus a moderator remove-attachment action
- [x] 30. **Abuse protection modes** - Open/Standard/Strict tiers covering rate limiting, blocked-term filtering, browser-token throttling, duplicate protection, temporary bans, and optional CAPTCHA. Split into sub-items because rate limiting, temporary bans, and duplicate-check strictness are all per-event and reuse infrastructure that already exists (`event_settings`, `attendees.banned_until`, Feature 15's strictness setting), while blocked-term filtering is Administrator-scoped and global (per the project plan's own role table), needing a new table and a new global admin page - a different tenant boundary entirely. CAPTCHA has no provider named anywhere in the plans, so it is deferred to Feature 42 rather than guessed here.
  - [x] 30a. **Rate limiting, temporary bans & duplicate-check tier** - a per-event Open/Standard/Strict setting driving a submission rate limit (per attendee token - this project has no IP tracking, so "browser-token throttling" and "rate limiting" are the same mechanism) and an automatic temporary ban on repeated violations (using the existing `attendees.banned_until` column), which also blocks voting; "duplicate protection" needed no new code since Feature 15's existing `duplicate_check_strictness` already delivers it independently - coupling the two would have silently overridden an admin's own strictness choice whenever they changed the abuse tier
  - [x] 30b. **Blocked-term filtering** - a global, Administrator-only blocked-term list (new table, new admin page, mirroring `event-managers.vue`'s global-scope precedent) checked at question/reply submission time across every event

**Admin oversight & reporting**

- [x] 31. **Live admin dashboard** - active attendees/moderators, question counts by state, top-voted question, current topic, submission/voting state, updating live
- [x] 32. **Administrative audit log** - major admin/Event Manager actions, excluding routine moderator activity
- [x] 33. **Question edit history & soft delete** - admin-only wording edits with revision history; soft delete everywhere with restore and confirmed permanent delete. Split into sub-items because there is no admin-facing question view of any kind yet (Feature 31's dashboard only shows aggregate counts), and wording-edit-with-revision-history (reusing the dormant `question_revisions` table) is independently reviewable from the genuinely new restore/permanent-delete concept (moderators can currently only archive, never delete). "Everywhere" in the build-plan wording stays scoped to questions here - replies/attachments restore and permanent delete are a disclosed follow-up (Feature 44), not silently dropped or forced into this feature.
  - [x] 33a. **Admin question view & wording edit with revision history** - a new "Questions" tab on the event admin page listing every question regardless of state, an admin wording-edit action that records `question_revisions` (original/revised text, editor, timestamp) without resetting moderation state (an admin edit is a trusted correction, not a resubmission), and now-loggable "admin question edits" for Feature 32's audit log, which explicitly deferred this category until its producing feature existed
  - [x] 33b. **Question restore & confirmed permanent delete** - admin-facing soft-delete/restore and a confirmed, irreversible permanent delete for questions, built on 33a's admin question view
- [x] 34. **Event reporting & export** - combined or topic-by-topic report, chosen at generation time, exported as CSV, printable HTML, and branded PDF. Split into sub-items because CSV and printable HTML need no new dependency (plain string/template building over data this project already has), while branded PDF needs a real SiteGround-compatible library decision and a new dependency - project-overview.md's own "Open questions" section already flagged PDF generation approach as unresolved.
  - [x] 34a. **Report data aggregation, CSV & printable HTML export** - a new "Reports" tab generating a combined or topic-by-topic report (participation, question state, votes, top-voted, timestamps, anonymity-respecting display names/attendee type, topic, replies, descriptive attachment references - never signed URLs, since a persisted report may be opened long after they'd expire), saved to a new Storage bucket with a `reports` row (Feature 1's dormant table), completing Feature 32's deferred "report generation" audit category
  - [x] 34b. **Branded PDF export** - resolved the SiteGround-compatible PDF generation approach (pdfkit - pure JavaScript, no headless-browser/native-binary dependency) and added branded PDF (accent color + primary logo) as a third format, reusing 34a's report data aggregation unchanged
- [x] 35. **Data export/backup tool** - admin export of event configuration, attendee types, topics, questions, replies, votes, and reports in a structured, restorable format. Split into sub-items because import/restore is a materially riskier, differently-shaped problem than export (overwrite-vs-new-event semantics and ID-collision handling are unresolved anywhere in the plans, and there is no dormant table reserved for it the way `reports`/`audit_logs` signaled their own producing features were coming) - export can proceed now on its own, with the format designed so a later restore feature can consume it.
  - [x] 35a. **Event data export** - a downloadable JSON export of one event's configuration, attendee types, topics, questions, replies, votes, attendees (included for FK integrity even though not explicitly named - votes/questions/replies all reference `attendee_id`), and report metadata, in a format designed for a future restore feature to consume
  - [x] 35b. **Event data restore/import** - consumes 35a's export format to always recreate a brand-new draft event (never overwrite), with every id freshly generated and remapped and attendee tokens always regenerated, resolving the overwrite-vs-new-event and ID-collision questions the parent line left open

**Production readiness**

- [x] 36. **Supabase free-tier usage guardrails** - admin-visible active-count, Realtime, DB, and storage usage signals with Normal/Approaching-Capacity/Consider-Upgrading warnings (never shown to attendees)
- [x] 37. **Event Readiness Check** - one-click pre-event diagnostic covering app/Supabase/DB/Realtime/storage reachability, QR and join-code resolution, moderator auth, and event/submission/voting configuration state
- [ ] 38. **Accessibility pass** - WCAG 2.2 AA across attendee, moderator, and admin surfaces
- [ ] 39. **Security hardening review** - RLS, IDOR, XSS/CSRF, upload validation, rate limiting, and cross-event isolation checked end to end
- [ ] 40. **Load testing** - simulate ~100 then ~150-200 concurrent clients with rapid voting/question bursts and document latency, errors, and Realtime behavior
- [ ] 41. **SiteGround deployment configuration** - GitHub-connected Node.js Project, confirmed build/start settings, environment variables, production subdomain, DNS, and SSL
- [ ] 42. **CAPTCHA integration** - split out of Feature 30 because no provider is named anywhere in the plans; pick a provider (e.g. hCaptcha, Cloudflare Turnstile) and wire it into attendee submission as the optional Strict-tier challenge Feature 30's own build-plan line named but never specified
- [ ] 43. **Server-route conversion for full admin/Event Manager audit coverage** - split out of Feature 32 because most admin/Event Manager mutations (event details/settings/branding-color saves, event duplication, Event Manager scope changes/revocation/assignments) are direct client-side Supabase calls gated by RLS today, with no server-side interception point for an audit-log write; only moderator password rotation, branding logo upload/remove, and Event Manager creation already route through a server route and got audit logging in Feature 32. Convert the remaining direct-client admin/Event Manager mutations to service-role server routes and add an audit-log write to each, completing project-plan.md's full "major actions" list (event CRUD, settings changes, duplication, Event Manager permission changes).
- [ ] 44. **Reply and attachment restore & confirmed permanent delete** - split out of Feature 33 because "soft delete everywhere with restore and confirmed permanent delete" named replies and attachments too, but Feature 33 scoped restore/permanent-delete to questions only (matching its own title). Extend the same admin-facing restore/confirmed-permanent-delete concept to replies and attachments, which already soft-delete via existing attendee/moderator actions but have no restore or permanent-delete path yet.

## Post-MVP (documented, not built now)

Architecture should not preclude these, but none are scheduled features yet:

- Presenter/projector "presentation screen," question board, QR waiting screen
- Public read-only embedding via iframe
- Authenticated (permanent-account) attendees
- Billing, subscription plans, organizations/workspaces, white-label
