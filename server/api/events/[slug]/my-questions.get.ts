import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { useSupabaseServiceRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  if (!token) {
    return { success: true, data: { questions: [] }, error: null }
  }

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('id, status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live') {
    return { success: true, data: { questions: [] }, error: null }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('attendee_edit_window_minutes')
    .eq('event_id', found.id)
    .single()

  const editWindowMinutes = settings?.attendee_edit_window_minutes ?? 0

  const { data: attendee } = await supabase
    .from('attendees')
    .select('id')
    .eq('event_id', found.id)
    .eq('token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (!attendee) {
    return { success: true, data: { questions: [] }, error: null }
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('id, text, approval_status, visibility, created_at')
    .eq('event_id', found.id)
    .eq('attendee_id', attendee.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const now = Date.now()

  const result = (questions ?? []).map(q => {
    const ageMinutes = (now - new Date(q.created_at).getTime()) / 60000
    const canModify = editWindowMinutes > 0 && ageMinutes <= editWindowMinutes

    return {
      id: q.id,
      text: q.text,
      approvalStatus: q.approval_status,
      visibility: q.visibility,
      canModify
    }
  })

  return { success: true, data: { questions: result }, error: null }
})
