import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../../utils/supabase'
import { findEditableQuestion, EVENT_NOT_FOUND_ERROR } from '../../utils/find-editable-question'

interface EditQuestionBody {
  eventId?: string
  token?: string
  questionId?: string
  text?: string
}

const TEXT_REQUIRED_ERROR = 'Please enter a question.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const body = await readBody<EditQuestionBody>(event)
  const eventId = body?.eventId ?? ''
  const token = body?.token ?? ''
  const questionId = body?.questionId ?? ''

  const result = await findEditableQuestion({ eventId, token, questionId })

  if (!result.ok) {
    setResponseStatus(event, result.error === EVENT_NOT_FOUND_ERROR ? 404 : 400)
    return { success: false, data: null, error: result.error }
  }

  const text = (body?.text ?? '').trim()

  if (!text) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: TEXT_REQUIRED_ERROR }
  }

  if (text.length > result.question.questionMaxLength) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: `Your question is too long (max ${result.question.questionMaxLength} characters).` }
  }

  const isImmediate = result.question.moderationMode === 'immediate'
  const supabase = useSupabaseServiceRole()

  const { error, data } = await supabase
    .from('questions')
    .update({
      text,
      approval_status: isImmediate ? 'approved' : 'pending',
      visibility: isImmediate ? 'public' : 'hidden'
    })
    .eq('id', result.question.id)
    .select('id')

  if (error || !data?.length) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: { questionId: result.question.id }, error: null }
})
