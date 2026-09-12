## Feature 41: SiteGround deployment configuration

**Branch:** `feature/siteground-deployment-configuration`
**Status:** verified

## Goal

Confirm and document the exact settings needed to run this app as a
SiteGround Node.js Project - resolving project-overview.md's own disclosed
TODO ("pin the exact SiteGround Node version, build command, and output
directory") - and give the operator a concrete runbook for the manual
account-side steps (GitHub connection, environment variables, subdomain,
DNS, SSL) that no coding skill can perform on their behalf.

**Resolved before writing this spec (each point below is verified against
current official documentation fetched while writing this spec, not
invented from nothing or relied on from training data):**

1. **`/release` does not cover this** - its own skill file states its
   "Initial targets" are only Render and Vercel; SiteGround isn't one of
   them. There is no purpose-built skill for this build-plan item (unlike
   Feature 39's security review, which `/audit` already covered), so
   `/feature` is the right tool - the deliverable here is real: pinned
   config plus a written runbook, not a pure review.
2. **Nuxt 4 requires Node.js 22.x or newer** (fetched from Nuxt's own
   current installation docs, `nuxt.com/docs/4.x/getting-started/installation`)
   - this is the exact "Node version" project-overview's TODO asked to
   pin. The operator must select 22.x or newer (ideally the current active
   LTS) when creating the SiteGround Node.js Project.
3. **The build and start commands are already fixed by Nitro's node-server
   preset** (fetched from Nitro's own current deploy docs,
   `nitro.build/deploy/runtimes/node`): build with `npm run build`, which
   produces a standalone `.output/` directory; start with `node
   .output/server/index.mjs`. No SiteGround-specific build step is needed
   beyond `npm install` then `npm run build`.
4. **The app already respects `PORT`/`NITRO_PORT` and
   `HOST`/`NITRO_HOST` environment variables automatically** (same Nitro
   docs) - whatever port SiteGround's Node.js Project hosting assigns, the
   app binds to it with no code change. This resolves the "will the app
   listen on the right port" question without guessing at SiteGround's own
   mechanism for it.
5. **SSL termination happens in front of the Node process, not inside it**
   - Nitro's own docs explicitly say to run behind a reverse proxy that
   terminates SSL in production (`NITRO_SSL_CERT`/`NITRO_SSL_KEY` are
   "intended for testing only"). This matches how SiteGround's own Site
   Tools architecture already works (its web server layer sits in front of
   a Node.js Project and handles the domain's SSL certificate) - no app
   config for SSL is needed or appropriate.
6. **SiteGround's own public documentation does not cover the exact Site
   Tools mechanics** for selecting a Node version, naming a startup
   file/command, or entering environment variables for a Node.js Project -
   confirmed by fetching SiteGround's own current KB pages on this
   directly; they describe only plan-based project limits (GoGeek: up to
   10 Node.js projects, confirming the plan project-overview.md already
   names) and that GitHub-linked projects auto-redeploy on push. The exact
   on-screen fields are only visible inside a live Site Tools account, so
   the runbook below describes the steps at the level that's actually
   confirmable, and tells the operator to follow Site Tools' own on-screen
   guidance for exact field names when they reach that screen - not a
   guess dressed up as a confirmed fact.
7. **`.env.example` already lists the exact three environment variables**
   this app needs (`NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NUXT_SUPABASE_SERVICE_ROLE_KEY`) - no change needed there.
8. **The production subdomain, DNS, and SSL steps are entirely manual,
   account-specific actions** - per this project's own established
   boundary (no skill starts a dev server or performs remote/account
   actions), these become runbook steps for the operator, not something to
   automate.

## In scope

- **`nuxt.config.ts` (edit).** Add `nitro: { preset: 'node-server' }`,
  making the already-default preset explicit and pinned rather than
  relying on auto-detection, matching project-overview's own stated intent.
- **`package.json` (edit).** Add `"engines": { "node": ">=22" }`,
  documenting the verified Nuxt 4 requirement as machine-readable metadata.
- **`blueprint/context/project-overview.md` (edit).** Replace the
  "Deployment" section's `> TODO: pin the exact SiteGround Node version,
  build command, and output directory...` line with the confirmed values
  from the resolved notes above, and remove the now-resolved "Exact
  SiteGround Node.js/Nitro deployment settings" line from "Open questions."
- **`DEPLOYMENT.md` (new, repo root).** The operator-facing runbook:
  creating the SiteGround Node.js Project (Node 22.x+, connecting the
  GitHub repo for auto-deploy on push), the exact three environment
  variable names to enter (no values), setting up the production
  subdomain, DNS, and SSL through Site Tools' own domain/SSL management,
  and a post-deploy smoke-test checklist (homepage/join page load, admin
  login works via `scripts/create-admin.mjs`-created account, the RLS
  smoke check passes against production, a Realtime-dependent page
  connects). Notes plainly, at each SiteGround-specific step, that exact
  on-screen field names may differ from this runbook and to follow Site
  Tools' own guidance there - not asserting confirmed specifics this
  session couldn't verify.

## Out of scope

- **Actually creating the SiteGround Node.js Project, connecting GitHub,
  setting environment variables, configuring DNS, or provisioning SSL** -
  all manual, account-specific, remote actions outside any coding skill's
  reach, per this project's own established boundary.
- **Actually deploying or pushing to production** - `DEPLOYMENT.md` is a
  runbook to follow, not something this feature executes.
- **Render or Vercel configuration** - this project's chosen host is
  SiteGround; `/release`'s Render/Vercel support is irrelevant here.
- **Any change to the app's own runtime behavior** - the two code edits
  only pin already-correct defaults and document a version requirement;
  neither changes what the app does.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Pin the verified build settings** - `nuxt.config.ts`'s explicit
      `nitro.preset`, `package.json`'s `engines.node`.
      **Done when:** code builds; `nuxt.config.ts` explicitly sets
      `nitro.preset: 'node-server'`; `package.json` declares
      `engines.node: ">=22"`.
- [x] 2. **Resolve the overview's TODO** - edit
      `blueprint/context/project-overview.md`'s Deployment section and
      Open Questions list per the contract above.
      **Done when:** the TODO line is replaced with the confirmed Node
      version, build command, and start command; the resolved Open
      Question line is removed.
- [x] 3. **Write the deployment runbook** - `DEPLOYMENT.md` per the
      contract above.
      **Done when:** the file exists at the repo root and covers every
      area named in the contract above, clearly distinguishing confirmed
      facts (cited) from steps the operator must read off their own live
      Site Tools screen.

## Files / areas

- `nuxt.config.ts` (edit)
- `package.json` (edit)
- `blueprint/context/project-overview.md` (edit)
- `DEPLOYMENT.md` (new)

## Data / contracts

No API or stored-data contract changes - this feature only pins existing
default behavior and writes documentation. No new fields, routes, or
response shapes.

## Testing

No test runner is configured, and this feature has no application logic to
unit-test. `npm run build` is the automated check for the code changes in
step 1. Steps 2 and 3 are documentation; there is no automated check beyond
proofreading them against the resolved notes above. **Not yet exercised
live:** every actual SiteGround Site Tools screen, the real GitHub-connected
deploy, the production subdomain/DNS/SSL, and the post-deploy smoke test -
all require the operator's own SiteGround account and a real deploy, outside
this skill's reach, the same caveat recorded for every prior feature that
could not start a server or touch a remote account from this skill.

## Notes for the AI

- Do not assert a specific SiteGround Site Tools field name, button
  label, or exact click-path as confirmed fact - SiteGround's own public
  docs don't cover that level of detail; phrase those runbook steps as
  "follow Site Tools' own on-screen guidance for X."
- Do not attempt to create, configure, or deploy anything on SiteGround,
  GitHub Actions, or DNS from this skill.
- Do not add Render or Vercel configuration - wrong host for this project.
- Do not change any application behavior - both code edits pin already-
  correct defaults; neither should alter what the running app does.
