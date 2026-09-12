import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'
import { logAuditAction } from '../../../../../utils/log-audit-action'

interface SoftDeleteQuestionBody {
  questionId?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const QUESTION_NOT_FOUND_ERROR = 'Question not found.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<SoftDeleteQuestionBody>(event)
  const questionId = body?.questionId ?? ''

  const supabase = useSupabaseServiceRole()

  const { data: question } = await supabase
    .from('questions')
    .select('id')
    .eq('id', questionId)
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!question) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: QUESTION_NOT_FOUND_ERROR }
  }

  const { error } = await supabase
    .from('questions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', question.id)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'question_soft_deleted', eventId, { questionId: question.id })

  return { success: true, data: { questionId: question.id }, error: null }
})
