import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../utils/supabase'

interface VoteBody {
  eventId?: string
  token?: string
  questionId?: string
}

const EVENT_NOT_FOUND_ERROR = 'Event not found.'
const VOTING_CLOSED_ERROR = 'Voting is currently closed.'
const NOT_JOINED_ERROR = 'Please join the event before voting.'
const QUESTION_NOT_FOUND_ERROR = 'Question not found.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const DUPLICATE_VOTE_CODE = '23505'

export default defineEventHandler(async (event) => {
  const body = await readBody<VoteBody>(event)
  const eventId = body?.eventId ?? ''
  const token = body?.token ?? ''
  const questionId = body?.questionId ?? ''

  if (!eventId || !token || !questionId) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: sourceEvent } = await supabase
    .from('events')
    .select('id, status, voting_open')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sourceEvent || sourceEvent.status !== 'live') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  if (!sourceEvent.voting_open) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: VOTING_CLOSED_ERROR }
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

  const { data: question } = await supabase
    .from('questions')
    .select('id')
    .eq('id', questionId)
    .eq('event_id', eventId)
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .maybeSingle()

  if (!question) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: QUESTION_NOT_FOUND_ERROR }
  }

  const { error } = await supabase
    .from('votes')
    .insert({ question_id: questionId, attendee_id: attendee.id, event_id: eventId })

  if (error && error.code !== DUPLICATE_VOTE_CODE) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: { voted: true }, error: null }
})
