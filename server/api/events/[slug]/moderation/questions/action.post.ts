import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'

type ModerationAction =
  | 'approve'
  | 'reject'
  | 'hide'
  | 'publish'
  | 'mark_answered'
  | 'unmark_answered'
  | 'archive'
  | 'unarchive'

interface ActionBody {
  token?: string
  questionId?: string
  action?: ModerationAction
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const QUESTION_NOT_FOUND_ERROR = 'Question not found.'
const INVALID_ACTION_ERROR = 'Invalid action.'
const NOT_APPROVED_FOR_PUBLISH_ERROR = 'Approve the question before publishing it.'
const NOT_APPROVED_FOR_ANSWERED_ERROR = 'Approve the question before marking it answered.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const VALID_ACTIONS: ModerationAction[] = [
  'approve', 'reject', 'hide', 'publish', 'mark_answered', 'unmark_answered', 'archive', 'unarchive'
]

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

  const update: {
    approval_status?: 'pending' | 'approved' | 'rejected'
    visibility?: 'hidden' | 'public'
    answered?: boolean
    archived?: boolean
  } = {}

  switch (action) {
    case 'approve':
      update.approval_status = 'approved'
      break
    case 'reject':
      update.approval_status = 'rejected'
      update.visibility = 'hidden'
      break
    case 'hide':
      update.visibility = 'hidden'
      break
    case 'publish':
      if (question.approval_status !== 'approved') {
        setResponseStatus(event, 400)
        return { success: false, data: null, error: NOT_APPROVED_FOR_PUBLISH_ERROR }
      }
      update.visibility = 'public'
      break
    case 'mark_answered':
      if (question.approval_status !== 'approved') {
        setResponseStatus(event, 400)
        return { success: false, data: null, error: NOT_APPROVED_FOR_ANSWERED_ERROR }
      }
      update.answered = true
      break
    case 'unmark_answered':
      update.answered = false
      break
    case 'archive':
      update.archived = true
      break
    case 'unarchive':
      update.archived = false
      break
  }

  const { data: updated, error } = await supabase
    .from('questions')
    .update(update)
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
