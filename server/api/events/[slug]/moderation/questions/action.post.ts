import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'
import { computeModerationUpdate, VALID_ACTIONS, type ModerationAction } from '../../../../../utils/moderation-actions'

interface ActionBody {
  token?: string
  questionId?: string
  action?: ModerationAction
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const QUESTION_NOT_FOUND_ERROR = 'Question not found.'
const INVALID_ACTION_ERROR = 'Invalid action.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<ActionBody>(event)
  const token = body?.token ?? ''

  const session = await verifyModeratorSession({ slug, token })

  if (!session.ok) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const questionId = body?.questionId ?? ''
  const action = body?.action

  if (!action || !VALID_ACTIONS.includes(action)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: INVALID_ACTION_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: question } = await supabase
    .from('questions')
    .select('id, approval_status, visibility, answered, archived')
    .eq('id', questionId)
    .eq('event_id', session.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!question) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: QUESTION_NOT_FOUND_ERROR }
  }

  const computed = computeModerationUpdate(question, action)

  if (!computed.ok) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: computed.error }
  }

  const { data: updated, error } = await supabase
    .from('questions')
    .update(computed.update)
    .eq('id', questionId)
    .select('id, approval_status, visibility, answered, archived')
    .single()

  if (error || !updated) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return {
    success: true,
    data: {
      questionId: updated.id,
      approvalStatus: updated.approval_status,
      visibility: updated.visibility,
      answered: updated.answered,
      archived: updated.archived
    },
    error: null
  }
})
