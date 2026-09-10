import { defineEventHandler, getQuery, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  const session = await verifyModeratorSession({ slug, token })

  if (!session.ok) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: topics } = await supabase
    .from('topics')
    .select('id, name, sort_order, is_current')
    .eq('event_id', session.eventId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  const result = (topics ?? []).map(t => ({
    id: t.id,
    name: t.name,
    sortOrder: t.sort_order,
    isCurrent: t.is_current
  }))

  return { success: true, data: { topics: result }, error: null }
})
