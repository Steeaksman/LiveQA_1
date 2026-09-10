import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../../../utils/supabase'

const EVENT_NOT_FOUND_ERROR = 'Event not found.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('id, status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('id, text')
    .eq('event_id', found.id)
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return { success: true, data: { questions: questions ?? [] }, error: null }
})
