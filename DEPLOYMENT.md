# Deployment runbook: SiteGround

This app deploys as a SiteGround **Node.js Project** on a **GoGeek** plan,
connected to this GitHub repository for automatic redeploy on push. Every
step below that touches SiteGround's Site Tools, GitHub, DNS, or Supabase's
dashboard is a manual, account-specific action - no coding skill in this
project can perform these on your behalf. Where SiteGround's own public
documentation doesn't cover an exact on-screen field name, this runbook says
so explicitly rather than guessing; follow Site Tools' own on-screen
guidance at that point.

## Confirmed settings (verified against current Nuxt/Nitro documentation)

- **Node.js version:** 22.x or newer (Nuxt 4's own minimum requirement;
  pick the current active LTS if SiteGround offers a newer option).
- **Install command:** `npm install`
- **Build command:** `npm run build` (produces the standalone `.output/`
  directory - Nitro's `node-server` preset, pinned explicitly in
  `nuxt.config.ts`).
- **Start command:** `node .output/server/index.mjs`
- **Port/host:** the app already reads `PORT`/`HOST` (or `NITRO_PORT`/
  `NITRO_HOST`) automatically - whatever SiteGround's Node.js Project
  hosting assigns, no app configuration is needed.
- **SSL:** terminated by SiteGround's own Site Tools layer in front of the
  Node process, not by the app itself.

**Not confirmable from SiteGround's public documentation:** the exact Site
Tools screen names/fields for selecting the Node version, entering the
start command, and setting environment variables. Site Tools' own
in-product guidance is the source of truth for those exact steps.

## 1. Prerequisites

- A SiteGround GoGeek (or higher) hosting account.
- This repository pushed to GitHub.
- A Supabase project already migrated (`supabase/migrations/`) with its
  URL, anon key, and service-role key on hand.

## 2. Create the Node.js Project in Site Tools

1. In Site Tools, create a new **Node.js Project** and select **Node.js
   22.x** (or the current active LTS, whichever Site Tools offers).
2. Connect the project to this GitHub repository so pushes to the default
   branch trigger an automatic rebuild and redeploy.
3. Set the install and build commands to `npm install` and `npm run
   build` (follow Site Tools' own on-screen fields for where these go).
4. Set the application's start command/entry point to `node
   .output/server/index.mjs` (again, follow Site Tools' own field for
   this - the exact mechanism isn't documented publicly).

## 3. Environment variables

In the Node.js Project's environment variable settings, add exactly these
three (names only - get the real values from your Supabase project's
dashboard under Project Settings > API):

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`
- `NUXT_SUPABASE_SERVICE_ROLE_KEY` (server-only secret - never expose this
  to the client or commit it)

## 4. Domain, DNS, and SSL

1. Point a dedicated production subdomain at this SiteGround Node.js
   Project (through Site Tools' domain/subdomain management).
2. Issue an SSL certificate for that subdomain through Site Tools (SSL
   Manager) and enable forced HTTPS.
3. In your Supabase project's Auth settings, update the Site URL and
   redirect URLs, and any configured CORS/allowed origins, to point at the
   production subdomain.

## 5. First deploy

Push to the connected branch and watch Site Tools' own deployment logs for
the build to complete and the project to restart.

## 6. Post-deploy smoke test

- Visit the production homepage and `/join` - both should load.
- Create an Administrator if you haven't already:
  `node --env-file=.env scripts/create-admin.mjs --email <email> --password <password>`
  (run this against the same Supabase project the production app uses, not
  from the production server itself).
- Log in at `/admin/login` with that account.
- Run the RLS smoke check against the same Supabase project:
  `node --env-file=.env scripts/check-rls.mjs`
- Open a live event's attendee page and confirm it reaches "Live" (not
  "Reconnecting...") - this confirms the production deploy can reach
  Supabase Realtime.

## 7. Recommended before real usage

Run the load test (`scripts/load-test.mjs`, see `AGENTS.md`'s Commands
section) against the production URL and a dedicated, non-production test
event - once at `--clients 100`, once at `--clients 150`-`200` - before
directing real attendees at this deployment.
