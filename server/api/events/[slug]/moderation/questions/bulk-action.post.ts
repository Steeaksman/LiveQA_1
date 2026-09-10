import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'
import { computeModerationUpdate, VALID_ACTIONS, type ModerationAction } from '../../../../../utils/moderation-actions'

interface BulkActionBody {
  token?: string
  questionIds?: string[]
  action?: ModerationAction
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const INVALID_ACTION_ERROR = 'Invalid action.'
const NO_QUESTIONS_SELECTED_ERROR = 'No questions selected.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<BulkActionBody>(event)
  const token = body?.token ?? ''

  const session = await verifyModeratorSession({ slug, token })

  if (!session.ok) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const action = body?.action

  if (!action || !VALID_ACTIONS.includes(action)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: INVALID_ACTION_ERROR }
  }

  const questionIds = [...new Set((body?.questionIds ?? []).filter(id => typeof id === 'string' && id))]

  if (questionIds.length === 0) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NO_QUESTIONS_SELECTED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: candidates } = await supabase
    .from('questions')
    .select('id, approval_status, visibility, answered, archived')
    .in('id', questionIds)
    .eq('event_id', session.eventId)
    .is('deleted_at', null)

  let updatedCount = 0
  let skippedCount = questionIds.length - (candidates ?? []).length

  for (const question of candidates ?? []) {
    const computed = computeModerationUpdate(question, action)

    if (!computed.ok) {
      skippedCount++
      continue
    }

    const { error } = await supabase
      .from('questions')
      .update(computed.update)
      .eq('id', question.id)

    if (error) {
      skippedCount++
      continue
    }

    updatedCount++
  }

  return { success: true, data: { updatedCount, skippedCount }, error: null }
})
