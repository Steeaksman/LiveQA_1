import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../utils/supabase'

interface SubmitQuestionBody {
  eventId?: string
  token?: string
  text?: string
}

const EVENT_NOT_FOUND_ERROR = 'Event not found.'
const SUBMISSIONS_CLOSED_ERROR = 'Submissions are currently closed.'
const NOT_JOINED_ERROR = 'Please join the event before asking a question.'
const TEXT_REQUIRED_ERROR = 'Please enter a question.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const body = await readBody<SubmitQuestionBody>(event)
  const eventId = body?.eventId ?? ''
  const token = body?.token ?? ''

  if (!eventId || !token) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: sourceEvent } = await supabase
    .from('events')
    .select('id, status, submissions_open')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sourceEvent || sourceEvent.status !== 'live') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  if (!sourceEvent.submissions_open) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: SUBMISSIONS_CLOSED_ERROR }
  }

  const { data: attendee } = await supabase
    .from('attendees')
    .select('id')
    .eq('event_id', eventId)
    .eq('token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (!attendee) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NOT_JOINED_ERROR }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('question_max_length, moderation_mode')
    .eq('event_id', eventId)
    .single()

  const questionMaxLength = settings?.question_max_length ?? 500
  const text = (body?.text ?? '').trim()

  if (!text) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: TEXT_REQUIRED_ERROR }
  }

  if (text.length > questionMaxLength) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: `Your question is too long (max ${questionMaxLength} characters).` }
  }

  const isImmediate = settings?.moderation_mode === 'immediate'

  const { data: created, error } = await supabase
    .from('questions')
    .insert({
      event_id: eventId,
      topic_id: null,
      attendee_id: attendee.id,
      text,
      anonymous: false,
      approval_status: isImmediate ? 'approved' : 'pending',
      visibility: isImmediate ? 'public' : 'hidden'
    })
    .select('id')
    .single()

  if (error || !created) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: { questionId: created.id }, error: null }
})
