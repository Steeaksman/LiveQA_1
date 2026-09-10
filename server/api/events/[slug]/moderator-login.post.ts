import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../../../utils/supabase'

interface ModeratorLoginBody {
  password?: string
}

const EVENT_NOT_FOUND_ERROR = 'Event not found.'
const INCORRECT_PASSWORD_ERROR = 'Incorrect password.'
const TOO_MANY_ATTEMPTS_ERROR = 'Too many attempts. Please try again later.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15
const SESSION_HOURS = 12

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false

  const [, saltHex, hashHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, salt, expected.length)

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<ModeratorLoginBody>(event)
  const password = body?.password ?? ''

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('id, status, moderator_access_enabled')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live' || !found.moderator_access_enabled) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('moderator_password_hash, moderator_failed_attempts, moderator_locked_until')
    .eq('event_id', found.id)
    .single()

  const now = Date.now()
  const lockedUntil = settings?.moderator_locked_until ? new Date(settings.moderator_locked_until).getTime() : null

  if (lockedUntil && lockedUntil > now) {
    setResponseStatus(event, 429)
    return { success: false, data: null, error: TOO_MANY_ATTEMPTS_ERROR }
  }

  const storedHash = settings?.moderator_password_hash ?? null
  const passwordMatches = storedHash ? verifyPassword(password, storedHash) : false

  if (!passwordMatches) {
    const failedAttempts = (lockedUntil ? 0 : settings?.moderator_failed_attempts ?? 0) + 1

    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      await supabase
        .from('event_settings')
        .update({
          moderator_failed_attempts: 0,
          moderator_locked_until: new Date(now + LOCKOUT_MINUTES * 60 * 1000).toISOString()
        })
        .eq('event_id', found.id)

      setResponseStatus(event, 429)
      return { success: false, data: null, error: TOO_MANY_ATTEMPTS_ERROR }
    }

    await supabase
      .from('event_settings')
      .update({
        moderator_failed_attempts: failedAttempts,
        moderator_locked_until: null
      })
      .eq('event_id', found.id)

    setResponseStatus(event, 400)
    return { success: false, data: null, error: INCORRECT_PASSWORD_ERROR }
  }

  await supabase
    .from('event_settings')
    .update({ moderator_failed_attempts: 0, moderator_locked_until: null })
    .eq('event_id', found.id)

  const expiresAt = new Date(now + SESSION_HOURS * 60 * 60 * 1000).toISOString()

  const { data: created, error } = await supabase
    .from('moderator_sessions')
    .insert({
      event_id: found.id,
      session_token: randomBytes(32).toString('hex'),
      expires_at: expiresAt
    })
    .select('session_token, expires_at')
    .single()

  if (error || !created) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: { sessionToken: created.session_token, expiresAt: created.expires_at }, error: null }
})
