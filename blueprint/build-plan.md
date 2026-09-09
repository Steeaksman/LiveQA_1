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

- [ ] 4. **Event creation wizard** - step-by-step flow producing a draft event. Split into sub-items because most later wizard steps (replies, branding, attachments, anonymity, abuse tiers, join-code customization/QR) are already owned by their own later build-plan features and grow the wizard incrementally when they ship, per Feature 1's `event_settings` design. Notifications and retention wizard steps are deferred - not yet decided anywhere in the plans.
  - [x] 4a. **Wizard shell + core details** - name, auto-generated slug/join-code (Feature 6 later adds customization), attendee types CRUD; produces a real draft event
  - [x] 4b. **Question/moderation/voting settings step** - the toggles Features 13/14/19-21 need soon: max question length, moderation mode, voting on/off, hide vote counts
  - [ ] 4c. **Review & publish step** - draft to scheduled/live transition
- [ ] 5. **Event tabbed management** - edit an existing event's settings after creation
- [ ] 6. **Audience URL & join code** - unique friendly slug and short join code, both customizable and unique, plus the generic `/join` code-entry page
- [ ] 7. **QR code generation** - Audience QR and Moderator QR, downloadable as PNG/SVG
- [ ] 8. **Branded signage export** - QR + logo + event name + join code + instructions graphic for slides/handouts/posters
- [ ] 9. **Event templates** - save and apply reusable event configuration bundles (no attendee/Q&A data)
- [ ] 10. **Event duplication** - copy an event's configuration only (never questions, replies, votes, attendees, reports, attachments)
- [ ] 11. **Event branding** - logo, sponsor logo, accent/background color or image, button styling, welcome text, light/dark mode

**Attendee Q&A**

- [ ] 12. **Attendee join flow & device identity** - opaque per-device token, configurable name/attendee-type requirement, attendee-type dropdown sourced from admin config
- [ ] 13. **Public Q&A feed** - submit and list questions honoring the event's moderation mode and visibility rules
- [ ] 14. **Voting** - one upvote per attendee per question, live counts, sort by votes/newest/oldest
- [ ] 15. **Duplicate-question suggestions** - Postgres trigram/full-text similarity suggestions while typing, with the configurable strictness levels
- [ ] 16. **Question search** - attendee-facing search over public questions only
- [ ] 17. **My Questions & attendee edit/delete** - attendee's own submissions view, edit/delete window enforced server-side per event config
- [ ] 18. **Anonymous questions & attendee-type visibility** - per-event anonymity modes and admin control over whether attendee type is publicly shown

**Moderation**

- [ ] 19. **Moderator authentication** - moderator QR to password entry to secure event-scoped session, with hashed passwords and rate-limited attempts
- [ ] 20. **Moderator queue & core actions** - approve, reject, hide, archive, mark answered, change visibility, change current topic, open/close submissions and voting
- [ ] 21. **Bulk moderation & Archive All Unanswered** - multi-select actions plus the confirmed one-click unanswered-archive
- [ ] 22. **Current speaker/topic tracking** - optional per-event topic setting that new questions inherit; existing questions keep their original topic
- [ ] 23. **Moderator notifications** - visual (always on) plus opt-in sound/browser notifications
- [ ] 24. **Attendee content reporting** - report a question/reply (deduped per attendee), surfaced to moderators for review

**Realtime & resilience**

- [ ] 25. **Realtime sync** - attendee, moderator, and admin views update live for questions, votes, visibility, answered/archived state, replies, and current topic, each subscribed only to what it needs
- [ ] 26. **Presence-based active counts** - approximate active attendee/moderator counts for admin/moderator views
- [ ] 27. **Reconnect & polling fallback** - auto-reconnect, preserved unsent input, re-fetch on reconnect, duplicate-submission avoidance, connection indicator, and a polling fallback for essential public data

**Advanced features**

- [ ] 28. **Replies/comments** - optional, independently moderated threaded responses to a question, included in reports
- [ ] 29. **Attachments** - optional image/document uploads via Supabase Storage with configurable type/size/count limits and secure server-side validation
- [ ] 30. **Abuse protection modes** - Open/Standard/Strict tiers covering rate limiting, blocked-term filtering, browser-token throttling, duplicate protection, temporary bans, and optional CAPTCHA

**Admin oversight & reporting**

- [ ] 31. **Live admin dashboard** - active attendees/moderators, question counts by state, top-voted question, current topic, submission/voting state, updating live
- [ ] 32. **Administrative audit log** - major admin/Event Manager actions, excluding routine moderator activity
- [ ] 33. **Question edit history & soft delete** - admin-only wording edits with revision history; soft delete everywhere with restore and confirmed permanent delete
- [ ] 34. **Event reporting & export** - combined or topic-by-topic report, chosen at generation time, exported as CSV, printable HTML, and branded PDF
- [ ] 35. **Data export/backup tool** - admin export of event configuration, attendee types, topics, questions, replies, votes, and reports in a structured, restorable format

**Production readiness**

- [ ] 36. **Supabase free-tier usage guardrails** - admin-visible active-count, Realtime, DB, and storage usage signals with Normal/Approaching-Capacity/Consider-Upgrading warnings (never shown to attendees)
- [ ] 37. **Event Readiness Check** - one-click pre-event diagnostic covering app/Supabase/DB/Realtime/storage reachability, QR and join-code resolution, moderator auth, and event/submission/voting configuration state
- [ ] 38. **Accessibility pass** - WCAG 2.2 AA across attendee, moderator, and admin surfaces
- [ ] 39. **Security hardening review** - RLS, IDOR, XSS/CSRF, upload validation, rate limiting, and cross-event isolation checked end to end
- [ ] 40. **Load testing** - simulate ~100 then ~150-200 concurrent clients with rapid voting/question bursts and document latency, errors, and Realtime behavior
- [ ] 41. **SiteGround deployment configuration** - GitHub-connected Node.js Project, confirmed build/start settings, environment variables, production subdomain, DNS, and SSL

## Post-MVP (documented, not built now)

Architecture should not preclude these, but none are scheduled features yet:

- Presenter/projector "presentation screen," question board, QR waiting screen
- Public read-only embedding via iframe
- Authenticated (permanent-account) attendees
- Billing, subscription plans, organizations/workspaces, white-label
