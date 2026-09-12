## Feature 42: CAPTCHA integration

**Branch:** `feature/captcha-integration`
**Status:** verified

## Goal

Give Strict-tier events a real CAPTCHA challenge on attendee question and
reply submission - the exact gap Feature 30's own build-plan line named
("optional CAPTCHA") but explicitly deferred to this feature since no
provider was ever chosen.

**Resolved before writing this spec (each point below is inferred from
repository evidence or verified current documentation, not invented from
nothing):**

1. **Provider: Cloudflare Turnstile**, chosen and verified against
   Cloudflare's own current documentation (fetched while writing this
   spec, not relied on from training data): free at any volume, no
   dependency to add (a plain `<script>` tag plus `fetch` for server-side
   verification), and its default behavior is often an invisible/one-tap
   challenge rather than a puzzle - the better fit for this project's own
   stated "Attendee UI stays radically simpler than admin" principle,
   compared to a provider whose default is always a visible interactive
   puzzle.
2. **Scoped to question and reply submission only** - the exact two
   actions `enforceSubmissionRateLimit` already covers in
   `questions.post.ts`/`replies.post.ts`. Voting and joining are
   deliberately not in scope: voting only ever calls `isAttendeeBanned`
   (never the rate limiter), and joining calls neither - both are already
   treated as lighter-weight than content submission everywhere else in
   this codebase, and CAPTCHA follows that same existing line.
   Moderator-authored replies (`server/api/events/[slug]/moderation/replies.post.ts`,
   gated by `verifyModeratorSession`) never require it either - CAPTCHA is
   an anonymous-attendee anti-abuse measure, not something an
   already-authenticated moderator session needs.
3. **Active only when `event_settings.abuse_protection_tier === 'strict'`**
   - matching the build-plan's own "optional Strict-tier challenge"
   wording exactly; Open and Standard tiers are unaffected.
4. **If Turnstile isn't configured (no secret key set), submissions
   proceed as if the tier weren't Strict for CAPTCHA purposes** - `strict`
   already existed as a valid tier before this feature (Feature 30a), so
   an event already set to `strict` before an operator configures Turnstile
   keys must not have every submission start failing. CAPTCHA is additive
   protection layered onto Strict tier's existing rate-limiting and
   temporary-ban mechanisms, not a replacement that can lock out an entire
   event by its mere absence of configuration.
5. **Keys are app-wide environment variables, not a per-event admin
   setting** - a Turnstile site is registered per domain, and this app
   serves every event from one domain; requiring each admin to register
   their own Cloudflare account per event would be absurd. New env vars
   `NUXT_PUBLIC_TURNSTILE_SITE_KEY` (client-safe) and
   `NUXT_TURNSTILE_SECRET_KEY` (server-only secret) follow this project's
   existing `NUXT_PUBLIC_*`/`NUXT_*` naming and exposure convention exactly
   (`nuxt.config.ts`'s `runtimeConfig.public.turnstileSiteKey` /
   `runtimeConfig.turnstileSecretKey`).
6. **One shared widget/token per page, not one per form** - a long
   question feed can have many open reply boxes at once; rendering a
   separate Turnstile widget per reply box would be visually noisy and
   fights this project's own "radically simpler" attendee UI principle.
   One widget, rendered once when `captchaRequired` is true, produces the
   token used by whichever action (submit a question, or submit any
   reply) the attendee performs next. The widget resets after every
   submission attempt (success or failure) so a fresh token is required
   for the next one - safe regardless of whether Cloudflare would
   otherwise allow reusing a token.
7. **`server/api/events/[slug].get.ts` must expose a derived
   `captchaRequired: boolean`**, not the raw `abuse_protection_tier`
   string - the attendee page only ever needs to know whether to render
   the widget, and exposing the raw internal tier name to an unauthenticated
   public endpoint would be unnecessary disclosure with no legitimate use
   on the client.
8. **Server-side verification is the actual security boundary; the
   disabled Submit button while unverified is a UX nicety only** -
   matching this project's established pattern everywhere else
   (client-side checks are convenience, server-side checks are the real
   gate). `questions.post.ts` and `replies.post.ts` verify the token
   against Cloudflare's `siteverify` endpoint themselves before accepting
   a Strict-tier submission; a missing or failed token is rejected with a
   dedicated error message, the same as every other validation failure in
   those routes.

## In scope

- **`nuxt.config.ts` (edit).** Add `runtimeConfig.turnstileSecretKey: ''`
  and `runtimeConfig.public.turnstileSiteKey: ''`.
- **`.env.example` (edit).** Add `NUXT_PUBLIC_TURNSTILE_SITE_KEY` and
  `NUXT_TURNSTILE_SECRET_KEY`, both empty, with a comment noting they're
  only needed to enable the Strict-tier CAPTCHA challenge.
- **`server/utils/verify-turnstile-token.ts` (new).**
  `verifyTurnstileToken(token: string | undefined): Promise<boolean>` -
  returns `true` immediately if `NUXT_TURNSTILE_SECRET_KEY` is unset
  (per the resolved note above); otherwise POSTs `{ secret, response:
  token }` to `https://challenges.cloudflare.com/turnstile/v0/siteverify`
  and returns its `success` field (`false` if `token` is falsy or the
  request itself fails).
- **`server/api/questions.post.ts`, `server/api/replies.post.ts` (edit).**
  When the resolved `abuse_protection_tier` is `'strict'`, call
  `verifyTurnstileToken(body?.turnstileToken)`; on `false`, return 400
  with a new `CAPTCHA_FAILED_ERROR` ("Please complete the verification
  challenge and try again.") before any other content validation.
- **`server/api/events/[slug].get.ts` (edit).** Select
  `abuse_protection_tier` alongside the settings already fetched; add
  `captchaRequired: settings?.abuse_protection_tier === 'strict'` to the
  response.
- **`app/composables/useTurnstile.ts` (new).** Loads Cloudflare's
  `api.js?render=explicit` script once (only when actually called),
  exposes a function to render the widget into a given container with a
  site key, returning a reactive token ref plus a `reset()` function,
  using Turnstile's own verified `render()`/`callback`/`error-callback`/
  `reset()` API.
- **`app/pages/e/[slug].vue` (edit).** When `context.captchaRequired` is
  true and `joined && submissionsOpen`, render one widget container inside
  the question-submission card via `useTurnstile`. Disable the Submit
  button (question form) while no token is present. Include the current
  token as `turnstileToken` in both `submitQuestion()`'s and
  `submitReply()`'s request bodies. Reset the widget after every question
  or reply submission attempt, success or failure.

## Out of scope

- **Voting, joining, and moderator-authored replies** - per the resolved
  note above, none of these are in scope for CAPTCHA.
- **A per-event Turnstile site key** - one app-wide key pair, per the
  resolved note above.
- **Any new npm dependency** - a plain script tag and `fetch` are
  sufficient, matching this project's established zero-added-dependency
  pattern for infrastructure integrations.
- **Blocking submissions when Turnstile is unconfigured** - explicitly the
  opposite behavior, per the resolved note above.
- **A separate widget per reply box** - one shared page-level widget, per
  the resolved note above.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Server-side verification** - `nuxt.config.ts`, `.env.example`,
      `server/utils/verify-turnstile-token.ts`, and wiring into
      `questions.post.ts`/`replies.post.ts` per the contract above.
      **Done when:** code builds; a Strict-tier submission with a missing
      or failed token is rejected with `CAPTCHA_FAILED_ERROR`; a
      Strict-tier submission is accepted when Turnstile is unconfigured
      (no secret key set) or when the token verifies successfully; Open/
      Standard-tier submissions are entirely unaffected (confirmed by code
      review, since exercising a real Cloudflare Turnstile site is outside
      this skill).
- [x] 2. **Expose `captchaRequired` and the client composable** - edit
      `server/api/events/[slug].get.ts`; add
      `app/composables/useTurnstile.ts` per the contract above.
      **Done when:** code builds; the event-context response includes
      `captchaRequired` computed from the real tier value; the composable
      correctly loads the script once, renders via `turnstile.render()`,
      and exposes a token ref and `reset()` (confirmed by code review
      against Turnstile's documented client API).
- [x] 3. **Wire the widget into attendee submission** - edit
      `app/pages/e/[slug].vue` per the contract above.
      **Done when:** code builds; the widget renders only when
      `captchaRequired` and the attendee has joined with submissions open;
      the Submit button is disabled until a token exists; both
      `submitQuestion()` and `submitReply()` send `turnstileToken`; the
      widget resets after every submission attempt.

## Files / areas

- `nuxt.config.ts` (edit)
- `.env.example` (edit)
- `server/utils/verify-turnstile-token.ts` (new)
- `server/api/questions.post.ts` (edit)
- `server/api/replies.post.ts` (edit)
- `server/api/events/[slug].get.ts` (edit)
- `app/composables/useTurnstile.ts` (new)
- `app/pages/e/[slug].vue` (edit)

## Data / contracts

- **New env vars:** `NUXT_PUBLIC_TURNSTILE_SITE_KEY` (client-exposed),
  `NUXT_TURNSTILE_SECRET_KEY` (server-only secret) - both optional; their
  absence disables the CAPTCHA challenge entirely, per the resolved note
  above.
- **`GET /api/events/:slug` response:** adds `captchaRequired: boolean`.
- **`POST /api/questions`, `POST /api/replies` request body:** adds
  optional `turnstileToken?: string`, required (and verified) only when
  the event's tier is `'strict'` and Turnstile is configured.
- **Cloudflare Turnstile `siteverify` contract** (verified against
  Cloudflare's current docs): `POST
  https://challenges.cloudflare.com/turnstile/v0/siteverify` with `{
  secret, response }`, responding `{ success: boolean, "error-codes":
  string[], ... }`.
- **Response envelope:** `{ success, data, error }` throughout, matching
  every other server route in this project.

## Testing

No test runner configured; `npm run build` is the automated check for all
three steps. **Not yet exercised live:** an actual Cloudflare Turnstile
site (site key + secret key), a real widget render/verify round trip, and
the full Strict-tier submission flow against a live event - all require a
running server, a real Cloudflare Turnstile registration, and a real
Supabase project, the same caveat recorded for every prior feature that
could not start a server or reach a live external account from this
skill.

## Notes for the AI

- Do not add CAPTCHA to voting, joining, or moderator-authored replies -
  out of scope, per the resolved note above.
- Do not make a missing Turnstile configuration block Strict-tier
  submissions - the opposite is the correct, deliberate behavior.
- Do not add a new npm dependency for this - a script tag plus `fetch` is
  sufficient.
- Do not expose the raw `abuse_protection_tier` value from
  `GET /api/events/:slug` - only the derived `captchaRequired` boolean.
- Do not render more than one Turnstile widget per page.
- Reuse this project's existing `NUXT_PUBLIC_*`/`NUXT_*` runtime-config
  naming convention exactly for the two new env vars.
