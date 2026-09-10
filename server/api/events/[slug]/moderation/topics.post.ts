import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

interface CreateTopicBody {
  token?: string
  name?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const NAME_REQUIRED_ERROR = 'Please enter a topic name.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const MAX_NAME_LENGTH = 100

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<CreateTopicBody>(event)
  const token = body?.token ?? ''

  const session = await verifyModeratorSession({ slug, token })

  if (!session.ok) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const name = (body?.name ?? '').trim().slice(0, MAX_NAME_LENGTH)

  if (!name) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NAME_REQUIRED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: existing } = await supabase
    .from('topics')
    .select('sort_order')
    .eq('event_id', session.eventId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSortOrder = existing ? existing.sort_order + 1 : 0

  const { data: created, error } = await supabase
    .from('topics')
    .insert({
      event_id: session.eventId,
      name,
      sort_order: nextSortOrder
    })
    .select('id, name, sort_order, is_current')
    .single()

  if (error || !created) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return {
    success: true,
    data: { id: created.id, name: created.name, sortOrder: created.sort_order, isCurrent: created.is_current },
    error: null
  }
})
