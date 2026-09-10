import { defineEventHandler, getQuery, getRouterParam, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../../../utils/supabase'

const EVENT_NOT_FOUND_ERROR = 'Event not found.'
const MIN_QUERY_LENGTH = 5
const SUGGESTION_LIMIT = 5

const STRICTNESS_THRESHOLDS: Record<string, number> = {
  low: 0.5,
  medium: 0.35,
  high: 0.2
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const query = getQuery(event)
  const text = typeof query.text === 'string' ? query.text.trim() : ''

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

  if (text.length < MIN_QUERY_LENGTH) {
    return { success: true, data: { questions: [] }, error: null }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('duplicate_check_strictness')
    .eq('event_id', found.id)
    .single()

  const strictness = settings?.duplicate_check_strictness ?? 'off'
  const threshold = STRICTNESS_THRESHOLDS[strictness]

  if (!threshold) {
    return { success: true, data: { questions: [] }, error: null }
  }

  const { data: matches } = await supabase.rpc('find_similar_questions', {
    p_event_id: found.id,
    p_query: text,
    p_threshold: threshold,
    p_limit: SUGGESTION_LIMIT
  })

  return { success: true, data: { questions: matches ?? [] }, error: null }
})
