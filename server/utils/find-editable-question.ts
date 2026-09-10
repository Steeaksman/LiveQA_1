import { useSupabaseServiceRole } from './supabase'

interface FindEditableQuestionInput {
  eventId: string
  token: string
  questionId: string
}

interface EditableQuestion {
  id: string
  questionMaxLength: number
  moderationMode: 'immediate' | 'queue'
}

type FindEditableQuestionResult =
  | { ok: true, question: EditableQuestion }
  | { ok: false, error: string }

export const EVENT_NOT_FOUND_ERROR = 'Event not found.'
export const NOT_JOINED_ERROR = 'Please join the event first.'
export const QUESTION_NOT_FOUND_ERROR = 'Question not found.'
export const WINDOW_CLOSED_ERROR = 'This question can no longer be edited or deleted.'

export async function findEditableQuestion(input: FindEditableQuestionInput): Promise<FindEditableQuestionResult> {
  const { eventId, token, questionId } = input

  if (!eventId || !token || !questionId) {
    return { ok: false, error: EVENT_NOT_FOUND_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: sourceEvent } = await supabase
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sourceEvent || sourceEvent.status !== 'live') {
    return { ok: false, error: EVENT_NOT_FOUND_ERROR }
  }

  const { data: attendee } = await supabase
    .from('attendees')
    .select('id')
    .eq('event_id', eventId)
    .eq('token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (!attendee) {
    return { ok: false, error: NOT_JOINED_ERROR }
  }

  const { data: question } = await supabase
    .from('questions')
    .select('id, attendee_id, created_at')
    .eq('id', questionId)
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!question || question.attendee_id !== attendee.id) {
    return { ok: false, error: QUESTION_NOT_FOUND_ERROR }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('question_max_length, moderation_mode, attendee_edit_window_minutes')
    .eq('event_id', eventId)
    .single()

  const editWindowMinutes = settings?.attendee_edit_window_minutes ?? 0
  const ageMinutes = (Date.now() - new Date(question.created_at).getTime()) / 60000

  if (editWindowMinutes <= 0 || ageMinutes > editWindowMinutes) {
    return { ok: false, error: WINDOW_CLOSED_ERROR }
  }

  return {
    ok: true,
    question: {
      id: question.id,
      questionMaxLength: settings?.question_max_length ?? 500,
      moderationMode: settings?.moderation_mode ?? 'queue'
    }
  }
}
