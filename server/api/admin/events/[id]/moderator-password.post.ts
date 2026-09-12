import { randomBytes, scryptSync } from 'node:crypto'
import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'

interface SetModeratorPasswordBody {
  password?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const PASSWORD_TOO_SHORT_ERROR = 'Password must be at least 8 characters.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const MIN_PASSWORD_LENGTH = 8

function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derivedKey = scryptSync(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`
}

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<SetModeratorPasswordBody>(event)
  const password = body?.password ?? ''

  if (password.length < MIN_PASSWORD_LENGTH) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: PASSWORD_TOO_SHORT_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { error } = await supabase
    .from('event_settings')
    .update({
      moderator_password_hash: hashPassword(password),
      moderator_failed_attempts: 0,
      moderator_locked_until: null
    })
    .eq('event_id', eventId)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'moderator_password_rotated', eventId, {})

  return { success: true, data: null, error: null }
})
