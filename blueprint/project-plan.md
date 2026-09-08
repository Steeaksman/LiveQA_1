# Project Plan

> One of the two planning docs you provide. Use as much detail as the project
> needs, including rationale, constraints, examples, edge cases, and explicit
> exclusions that should guide later feature work. Draft it directly, develop it
> through any AI conversation, or optionally run `/discovery` for a guided deep
> planning session. The content is always yours to direct. When it is filled in,
> run `/overview` to generate the project overview from this plus `build-plan.md`.

## 1. Problem - What problem are we solving?

Conferences, association meetings, medical/educational events, corporate
events, and town halls need a live audience Q&A tool: attendees ask and vote
on questions from their phones, moderators triage in real time, and speakers
answer what the room actually cares about.

LiveQA_1 is an original, production-ready implementation of that idea,
inspired by the ease-of-use and general concept of AhaSlides, Slido, and
Mentimeter (particularly their Q&A features) but not copying their
proprietary source code, branding, logos, text, artwork, layouts, exact
interface designs, or workflows. LiveQA_1 has its own visual identity.

**Core experience:**

- Attendee: **Scan → Join → Ask → Vote**
- Moderator: **Scan Moderator QR → Enter Password → Moderate**
- Administrative complexity (roles, retention, RLS, free-tier limits) stays
  entirely behind the scenes.

**Explicitly out of scope for v1** (documented so later features don't drift
into them; architecture should not preclude adding them later):

- Billing, subscription plans, license keys, paid tiers, self-service signup
- Presenter/projector "presentation screen" view, question board, QR waiting
  screen
- Public embedding beyond a possible future read-only iframe
- Authenticated (permanent-account) attendees
- Multi-tenant organizations / workspaces / white-label

## 2. Users - Who is this for?

Four roles, three of which are real accounts:

| Role | Account? | Auth | Scope |
|---|---|---|---|
| **Administrator** | Yes | Supabase Auth | System-wide: all events, all Event Managers, global settings, AI/retention/blocked-term config, audit log |
| **Event Manager** | Yes | Supabase Auth | Either **global** (all events) or **restricted** (only assigned events), granted by an Administrator |
| **Moderator** | No | Event-specific password (no user account) | One event only, via a moderator-only URL/QR; multiple moderators can work the same event concurrently |
| **Attendee** | No | None — opaque per-device token | One event only, scoped by an anonymous browser token, not a login |

Permissions (Administrator vs. Event Manager vs. Moderator vs. Attendee) must
be enforced in the UI, in server-side logic, **and** in Supabase Row Level
Security — hiding a menu item is never sufficient.

## 3. Features - What does the MVP need?

Grouped by area; see `build-plan.md` for the ordered, feature-sized checklist.

**Event setup & administration**

- Step-by-step event creation wizard (details, attendees, types, questions,
  moderation, voting, replies, branding, access/security, attachments,
  privacy, notifications, retention, review/publish), then a tabbed
  management view for edits
- Reusable event templates (config only, no attendee data) and event
  duplication (config only, never questions/replies/votes/attendees/reports)
- Friendly audience URL (`/e/<slug>`), customizable unique join code, generic
  `/join` code-entry page
- Audience QR (→ attendee page) and Moderator QR (→ moderator login),
  downloadable as PNG/SVG, plus optional branded signage graphics (logo, name,
  QR, join code, instructions) for slides/handouts/posters
- Per-event branding: logo, sponsor logo, accent/background color or image,
  button styling, welcome text/instructions, light/dark mode

**Attendee Q&A (the core loop)**

- One persistent Q&A room per event (not one per speaker) with an optional
  "current speaker/topic" that new questions inherit; existing questions keep
  their original topic
- Join flow with a configurable identity requirement (anonymous / name
  optional / name required) plus an admin-defined Attendee Type dropdown
  (informational only — never used to filter/sort in v1)
- Text questions (configurable max length, default 500 chars, server-validated)
- One upvote per attendee per question, no downvotes, sortable by votes /
  newest / oldest, counts optionally hidden
- Duplicate-question suggestions while typing (Postgres trigram/full-text
  first; AI optional), with a per-event strictness: disabled / suggest only /
  strong suggestion (default) / block likely duplicate
- Attendee-side search of public questions only (never surfaces
  hidden/moderated content)
- "My Questions" view; attendee edit/delete window configurable (never /
  until approved / until visible / until first vote), enforced server-side
- Optional replies/comments per question, independently moderated
- Optional attachments (text-only / images / documents / both), with
  configurable MIME types, size, and count limits via Supabase Storage
- Attendee content reporting (dedup per attendee) surfaced to moderators

**Moderation**

- Moderator workflow: scan QR → enter event password → secure event-scoped
  session → live queue
- Moderation mode per event: immediate publish, or approval queue; approval
  and public visibility can be independent (approved ≠ automatically visible)
- Actions: approve, reject, hide, archive, mark answered, change visibility,
  change current topic, open/close submissions, open/close voting, moderate
  replies, review reports, bulk-select actions, and a one-click **Archive All
  Unanswered** (confirmation required)
- Moderators can never edit attendee question wording; only an Administrator
  can, with the original text, revised text, editor, and timestamp preserved
- Moderator notifications: visual (always on), sound and browser push
  (opt-in, off by default; permission requested only after moderator
  interaction)
- Attendees never see moderation internals (queue status, "under review,"
  moderator identity)

**Realtime & resilience**

- Supabase Realtime drives live updates for questions, approvals, visibility,
  votes/totals, answered state, archives, replies, current topic,
  submission/voting open-closed state, and the moderator queue
- Clients subscribe only to what they need (attendee → public event data;
  moderator → the one event being moderated; admin → the actively viewed
  event/dashboard) — no blanket subscriptions
- Presence (or an equivalent lightweight mechanism) estimates active
  attendee/moderator counts — operational information only, not
  billing-grade
- On a dropped Realtime connection: auto-reconnect, preserve unsent attendee
  input, re-fetch state, avoid duplicate submissions, show a subtle
  connection indicator, and fall back to polling for essential public data
  rather than going unusable

**Admin oversight**

- Live dashboard: active attendees/moderators, question counts by state,
  top-voted question, current topic, submission/voting state
- Administrative audit log for major actions (event CRUD, settings changes,
  moderator password rotation, admin question edits, permanent deletion,
  duplication, report generation, retention purge, Event Manager permission
  changes) — routine moderator activity is excluded
- Soft delete everywhere with restore; permanent delete requires confirmation
- Reporting: combined or topic-by-topic, chosen at generation time, covering
  participation, questions/answered/archived, votes, top-voted, timestamps,
  display names where permitted, anonymous status, attendee type, topic,
  replies, attachment references — moderator identity/activity excluded.
  Export as CSV, printable HTML, and branded PDF (no headless-browser/Vercel
  dependency)
- Admin data export/backup for event configuration, attendee types, topics,
  questions, replies, votes, and reports, in a structured/restorable format,
  plus documented manual Supabase project backup steps

**Free-tier operations**

- **Run Event Readiness Check**: verifies app reachability, Supabase
  reachability, DB connection, Realtime subscription, storage (if
  attachments enabled), QR URL resolution, moderator auth, event
  configuration, submission/voting state, and required env vars, with clear
  pass/fail indicators
- Admin-visible (never attendee-visible) usage signals: approximate active
  attendee/moderator counts, Realtime connection/presence estimate, DB and
  storage usage when obtainable, with configurable Normal / Approaching
  Capacity / Consider Upgrading warnings

## 4. Data - What are we storing?

Entities (see `project-overview.md` for the concrete field-level model once
generated):

- `profiles` — Administrators and Event Managers (Supabase Auth users) and
  their role/permission scope
- `events`, `event_settings` — one row of durable identity + one row of the
  large set of per-event toggles described above (moderation mode, voting,
  anonymity, access mode, attachments, retention, etc.)
- `event_manager_assignments` — Event Manager ↔ event grants (global vs.
  restricted)
- `event_templates` — reusable config bundles, no attendee/Q&A data
- `attendee_types` — admin-defined dropdown values per event
- `attendees` — opaque per-device token scoped to one event, used for votes,
  ownership, rate limiting, temporary bans, "My Questions" — never invasive
  fingerprinting, never an exposed internal DB id
- `topics` — optional speaker/topic tracking per event
- `questions`, `question_revisions` — text, state, ownership, topic link;
  revisions capture admin edits only
- `votes` — one per (attendee, question)
- `replies` — optional threaded responses to a question
- `attachments` — Supabase Storage references tied to a question
- `content_reports` — attendee reports against a question or reply
- `moderator_sessions` — event-scoped sessions created from the moderator
  password flow
- `reports` — generated report metadata/exports
- `audit_logs` — administrative action log

Conventions: UUID primary keys, foreign keys, indexes on hot lookup paths,
unique constraints (slugs, join codes), explicit status enums, soft-delete
columns, `created_at`/`updated_at` timestamps. All schema changes are version
controlled migrations so a fresh Supabase project is reproducible from the
repo.

## 5. Tech - What stack are we using?

- **Nuxt 4 + Vue 3 + TypeScript** — this is the actual, already-scaffolded
  stack (`nuxt.config.ts`, `@nuxt/ui`). **Note:** the original planning notes
  this plan was distilled from named "Nuxt 4 + TypeScript" once up top but
  then referred to "Next.js/React" throughout (Vercel-avoidance language,
  `NEXT_PUBLIC_*` env vars, an `app/` directory, "Next.js deployment mode").
  That's treated as leftover boilerplate language from a Next.js-oriented
  source, not a real requirement — every such reference below is translated
  to its Nuxt/Nitro equivalent. Flagging this here in case the intent was
  actually Next.js; if so, say so and this plan gets re-cut.
- **Supabase** — PostgreSQL, Realtime, Auth, Storage, Row Level Security,
  and database functions/triggers where appropriate. Designed to run on the
  **Supabase Free plan** at launch (see Deployment).
- **Nitro `node-server` preset** (Nuxt's portable Node.js build output) —
  the Nuxt equivalent of a "Next.js Node deployment," chosen specifically
  because it runs on plain Node hosting instead of requiring a
  Vercel-specific runtime.
- **Zod** (or equivalent) for server-side input validation.
- **@nuxt/ui** — component base already installed; extend with the
  project's own visual identity rather than any competitor's look.
- No dependency on Vercel Functions, Vercel KV, Vercel Cron, Vercel Edge
  Middleware, or Vercel-specific image/storage infrastructure. Scheduled
  maintenance uses whatever combination of Supabase `pg_cron`/Edge Function
  scheduling, SiteGround cron (if available for the exact command), or safe
  application-triggered maintenance turns out to fit — decided and documented
  in the architecture step, not before.
- AI integrations (optional, off by default) sit behind a provider
  abstraction with server-side-only secrets; the app must work fully with AI
  disabled. AI may assist duplicate detection, moderation suggestions, and
  categorization, and may never auto-delete content permanently.

## 6. Monetize - How will this make money?

Not part of v1. No billing, subscriptions, license keys, paid tiers, or
self-service signup. The data/role model should simply avoid choices that
would force a rewrite if organizations, workspaces, white-label customers,
usage limits, or Stripe billing get added later — nothing more elaborate than
that is needed now.

## 7. UI/UX - How should this look and feel?

- Own polished SaaS visual identity — modern, clean, rounded cards, generous
  spacing, large touch targets, subtle animation, clear hierarchy, fast,
  accessible. Explicitly **not** a clone of AhaSlides/Slido/Mentimeter
  styling, layout, or branding.
- Device priority: attendee experience is phone-first (also works on
  tablet/desktop); moderator experience is tablet-first (iPad-class);
  admin is desktop/laptop-first. All three are responsive.
- Attendee interface stays radically simpler than the admin interface — a
  feature existing in the schema is not a reason to expose it to attendees.
  The entire attendee instruction set should be: *"Scan the QR code, ask your
  question, and vote for questions you want answered."*
- Admin nav: Dashboard, Events, Create Event, Templates, Reports, Event
  Managers, Audit Log, Settings — no WordPress-era concepts leaking into the
  UI.
- Accessibility target: **WCAG 2.2 AA** — keyboard navigation, screen-reader
  support, labeled/accessible forms and dialogs, visible focus, error
  announcements, sufficient contrast (never color-only), resizable text,
  touch targets, accessible tabs/voting controls/file uploads, ARIA live
  regions where content updates live.
- English-only for v1, but strings structured so localization can be added
  without a rewrite.

## 8. Deployment - Where and how will this ship?

- **Host:** SiteGround **GoGeek** plan, as a SiteGround **Node.js Project**,
  on a dedicated subdomain (e.g. `qanda.example.com`). This is a **hard
  requirement** — the whole app must run without any paid hosting service
  beyond SiteGround + Supabase Free + GitHub.
- **Deploy path:** GitHub repository → SiteGround Node.js Project connected
  to the chosen repo/branch → push → SiteGround builds → deployment logs in
  Site Tools → successful build replaces production. Document a rollback
  strategy (redeploy the previous known-good commit/branch).
- **Runtime:** confirm the currently-supported SiteGround Node.js version and
  configure Nuxt's Nitro `node-server` preset build/start commands
  accordingly — this gets pinned down and documented during the Phase 1
  architecture step (`/feature` should not re-litigate it per feature).
- **Domain/HTTPS:** DNS + SSL + forced HTTPS on the subdomain; Supabase
  allowed redirect URLs, CORS/origin rules, and auth redirects all point at
  the production URL.
- **Backend:** Supabase Free plan initially — ~250 total event attendees,
  ~50–100 concurrent Q&A users typical, several moderators, one or more
  admins, possibly multiple simultaneous events. Do not artificially cap
  event size just because of the Realtime connection quota; instead build
  admin-visible guardrails (usage warnings, readiness checks) and document
  the upgrade path to Supabase Pro. No data migration should ever be required
  solely to upgrade the Supabase plan.
- **Secrets:** SiteGround Node.js environment-variable management in
  production; an `.env.example` in the repo; real credentials are never
  committed; the Supabase service-role key never reaches the browser.
- **Load expectations:** validated pre-launch against ~100 connected
  attendees with several moderators and rapid voting/question bursts, then a
  higher scenario (~150, approaching ~200 realtime clients) to check latency,
  errors, DB load, and Realtime behavior — never load-tested against a live
  customer event.

## Open questions for the architecture step

- Confirm the exact current SiteGround GoGeek Node.js/Nuxt-Nitro supported
  configuration (Node version, package manager, build/start commands, output)
  before finalizing production build settings.
- Confirm whether "Nuxt 4" (as declared) or "Next.js" (as implied by most of
  the original notes) is really intended — this plan proceeds on Nuxt 4,
  matching the already-scaffolded repo.
- Pick the scheduled-task mechanism (`pg_cron` vs. Supabase Edge Function
  schedule vs. SiteGround cron vs. app-triggered maintenance) once the exact
  jobs needed (retention purge, etc.) are known.
- Pick a SiteGround-compatible PDF generation approach for branded report
  exports (no headless-browser/Vercel dependency) when Reports is built.
