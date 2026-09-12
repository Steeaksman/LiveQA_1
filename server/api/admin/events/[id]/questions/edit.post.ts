import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'
import { logAuditAction } from '../../../../../utils/log-audit-action'

interface EditQuestionBody {
  questionId?: string
  text?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const QUESTION_NOT_FOUND_ERROR = 'Question not found.'
const TEXT_REQUIRED_ERROR = 'Please enter a question.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<EditQuestionBody>(event)
  const questionId = body?.questionId ?? ''
  const text = (body?.text ?? '').trim()

  const supabase = useSupabaseServiceRole()

  const { data: question } = await supabase
    .from('questions')
    .select('id, text')
    .eq('id', questionId)
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!question) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: QUESTION_NOT_FOUND_ERROR }
  }

  if (!text) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: TEXT_REQUIRED_ERROR }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('question_max_length')
    .eq('event_id', eventId)
    .single()

  const questionMaxLength = settings?.question_max_length ?? 500

  if (text.length > questionMaxLength) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: `Your question is too long (max ${questionMaxLength} characters).` }
  }

  const { error: revisionError } = await supabase
    .from('question_revisions')
    .insert({
      question_id: question.id,
      original_text: question.text,
      revised_text: text,
      edited_by: callerId
    })

  if (revisionError) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const { error: updateError } = await supabase
    .from('questions')
    .update({ text })
    .eq('id', question.id)

  if (updateError) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'question_edited', eventId, { questionId: question.id })

  return { success: true, data: { questionId: question.id }, error: null }
})
