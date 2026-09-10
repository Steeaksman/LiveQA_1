import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

interface ModeratorReplyBody {
  token?: string
  questionId?: string
  text?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const QUESTION_NOT_FOUND_ERROR = 'Question not found.'
const TEXT_REQUIRED_ERROR = 'Please enter a reply.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<ModeratorReplyBody>(event)
  const token = body?.token ?? ''

  const session = await verifyModeratorSession({ slug, token })

  if (!session.ok) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const questionId = body?.questionId ?? ''
  const supabase = useSupabaseServiceRole()

  const { data: question } = await supabase
    .from('questions')
    .select('id')
    .eq('id', questionId)
    .eq('event_id', session.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!question) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: QUESTION_NOT_FOUND_ERROR }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('question_max_length')
    .eq('event_id', session.eventId)
    .single()

  const questionMaxLength = settings?.question_max_length ?? 500
  const text = (body?.text ?? '').trim()

  if (!text) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: TEXT_REQUIRED_ERROR }
  }

  if (text.length > questionMaxLength) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: `Your reply is too long (max ${questionMaxLength} characters).` }
  }

  const { data: created, error } = await supabase
    .from('replies')
    .insert({
      question_id: questionId,
      attendee_id: null,
      text,
      approval_status: 'approved',
      visibility: 'public'
    })
    .select('id')
    .single()

  if (error || !created) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: { replyId: created.id }, error: null }
})
