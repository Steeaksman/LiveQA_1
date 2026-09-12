import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../utils/supabase'
import { logAuditAction } from '../../utils/log-audit-action'

interface CreateEventManagerBody {
  email?: string
  password?: string
  scope?: 'global' | 'restricted'
  eventIds?: string[]
}

export default defineEventHandler(async (event) => {
  const administratorId = await verifyAdministrator(event)

  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: 'Not authorized.' }
  }

  const body = await readBody<CreateEventManagerBody>(event)
  const { email, password, scope, eventIds } = body ?? {}

  if (!email || !password || (scope !== 'global' && scope !== 'restricted')) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: 'Email, password, and scope are required.' }
  }

  const supabase = useSupabaseServiceRole()

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (createError) {
    setResponseStatus(event, 400)
    const message = createError.message.toLowerCase().includes('already')
      ? 'An account with this email already exists.'
      : 'Could not create the account.'
    return { success: false, data: null, error: message }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: created.user.id, role: 'event_manager', em_scope: scope, email })

  if (profileError) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: `Account created, but the profile failed: ${profileError.message}` }
  }

  if (scope === 'restricted' && eventIds?.length) {
    const { error: assignmentError } = await supabase
      .from('event_manager_assignments')
      .insert(eventIds.map(eventId => ({
        event_manager_id: created.user.id,
        event_id: eventId,
        granted_by: administratorId
      })))

    if (assignmentError) {
      setResponseStatus(event, 500)
      return { success: false, data: null, error: `Account created, but event assignment failed: ${assignmentError.message}` }
    }
  }

  await logAuditAction(administratorId, 'event_manager_created', null, { eventManagerId: created.user.id, email, scope })

  return { success: true, data: { id: created.user.id, email }, error: null }
})
