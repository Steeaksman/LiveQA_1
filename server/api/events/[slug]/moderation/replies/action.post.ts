import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'

type ReplyAction = 'approve' | 'reject' | 'hide' | 'publish'

interface ReplyActionBody {
  token?: string
  replyId?: string
  action?: ReplyAction
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const REPLY_NOT_FOUND_ERROR = 'Reply not found.'
const INVALID_ACTION_ERROR = 'Invalid action.'
const NOT_APPROVED_FOR_PUBLISH_ERROR = 'Approve the reply before publishing it.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const VALID_ACTIONS: ReplyAction[] = ['approve', 'reject', 'hide', 'publish']

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<ReplyActionBody>(event)
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

  const replyId = body?.replyId ?? ''
  const supabase = useSupabaseServiceRole()

  const { data: reply } = await supabase
    .from('replies')
    .select('id, approval_status, visibility')
    .eq('id', replyId)
    .eq('event_id', session.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!reply) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: REPLY_NOT_FOUND_ERROR }
  }

  const update: { approval_status?: 'pending' | 'approved' | 'rejected', visibility?: 'hidden' | 'public' } = {}

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
      if (reply.approval_status !== 'approved') {
        setResponseStatus(event, 400)
        return { success: false, data: null, error: NOT_APPROVED_FOR_PUBLISH_ERROR }
      }
      update.visibility = 'public'
      break
  }

  const { data: updated, error } = await supabase
    .from('replies')
    .update(update)
    .eq('id', replyId)
    .select('id, approval_status, visibility')
    .single()

  if (error || !updated) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return {
    success: true,
    data: { replyId: updated.id, approvalStatus: updated.approval_status, visibility: updated.visibility },
    error: null
  }
})
