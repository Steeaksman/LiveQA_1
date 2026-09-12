import { useRuntimeConfig } from '#imports'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verifies a Cloudflare Turnstile token server-side. Returns true
 * immediately when no secret key is configured - CAPTCHA is additive
 * protection on top of Strict tier's existing rate limiting and bans, not
 * something whose absence should lock out an event that predates this
 * feature.
 */
export async function verifyTurnstileToken(token: string | undefined): Promise<boolean> {
  const secret = useRuntimeConfig().turnstileSecretKey

  if (!secret) return true
  if (!token) return false

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token })
    })

    const body = await response.json() as { success?: boolean }
    return body.success === true
  } catch {
    return false
  }
}
