import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'

interface RemoveAttachmentBody {
  token?: string
  attachmentId?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const ATTACHMENT_NOT_FOUND_ERROR = 'Attachment not found.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<RemoveAttachmentBody>(event)
  const token = body?.token ?? ''

  const session = await verifyModeratorSession({ slug, token })

  if (!session.ok) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const attachmentId = body?.attachmentId ?? ''
  const supabase = useSupabaseServiceRole()

  const { data: attachment } = await supabase
    .from('attachments')
    .select('id, questions!inner(event_id)')
    .eq('id', attachmentId)
    .eq('questions.event_id', session.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!attachment) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: ATTACHMENT_NOT_FOUND_ERROR }
  }

  const { error } = await supabase
    .from('attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', attachmentId)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: { attachmentId }, error: null }
})
