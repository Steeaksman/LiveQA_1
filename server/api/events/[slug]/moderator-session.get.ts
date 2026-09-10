import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { useSupabaseServiceRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('id, status, moderator_access_enabled')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live' || !found.moderator_access_enabled || !token) {
    return { success: true, data: { valid: false }, error: null }
  }

  const { data: session } = await supabase
    .from('moderator_sessions')
    .select('expires_at, revoked_at')
    .eq('event_id', found.id)
    .eq('session_token', token)
    .is('deleted_at', null)
    .maybeSingle()

  const valid = !!session
    && session.revoked_at === null
    && new Date(session.expires_at).getTime() > Date.now()

  return { success: true, data: { valid }, error: null }
})
