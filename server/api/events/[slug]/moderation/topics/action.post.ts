import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'

type TopicAction = 'rename' | 'set_current' | 'delete' | 'move_up' | 'move_down'

interface TopicActionBody {
  token?: string
  topicId?: string
  action?: TopicAction
  name?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const TOPIC_NOT_FOUND_ERROR = 'Topic not found.'
const INVALID_ACTION_ERROR = 'Invalid action.'
const NAME_REQUIRED_ERROR = 'Please enter a topic name.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const MAX_NAME_LENGTH = 100

const VALID_ACTIONS: TopicAction[] = ['rename', 'set_current', 'delete', 'move_up', 'move_down']

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<TopicActionBody>(event)
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

  const topicId = body?.topicId ?? ''
  const supabase = useSupabaseServiceRole()

  const { data: topic } = await supabase
    .from('topics')
    .select('id, name, sort_order, is_current')
    .eq('id', topicId)
    .eq('event_id', session.eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!topic) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: TOPIC_NOT_FOUND_ERROR }
  }

  if (action === 'rename') {
    const name = (body?.name ?? '').trim().slice(0, MAX_NAME_LENGTH)

    if (!name) {
      setResponseStatus(event, 400)
      return { success: false, data: null, error: NAME_REQUIRED_ERROR }
    }

    const { error } = await supabase.from('topics').update({ name }).eq('id', topic.id)

    if (error) {
      setResponseStatus(event, 500)
      return { success: false, data: null, error: GENERIC_ERROR }
    }

    return { success: true, data: null, error: null }
  }

  if (action === 'set_current') {
    await supabase
      .from('topics')
      .update({ is_current: false })
      .eq('event_id', session.eventId)
      .eq('is_current', true)

    const { error } = await supabase.from('topics').update({ is_current: true }).eq('id', topic.id)

    if (error) {
      setResponseStatus(event, 500)
      return { success: false, data: null, error: GENERIC_ERROR }
    }

    return { success: true, data: null, error: null }
  }

  if (action === 'delete') {
    const { error } = await supabase
      .from('topics')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', topic.id)

    if (error) {
      setResponseStatus(event, 500)
      return { success: false, data: null, error: GENERIC_ERROR }
    }

    return { success: true, data: null, error: null }
  }

  // move_up / move_down
  const { data: siblings } = await supabase
    .from('topics')
    .select('id, sort_order')
    .eq('event_id', session.eventId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  const ordered = siblings ?? []
  const index = ordered.findIndex(t => t.id === topic.id)
  const neighborIndex = action === 'move_up' ? index - 1 : index + 1

  if (index === -1 || neighborIndex < 0 || neighborIndex >= ordered.length) {
    return { success: true, data: null, error: null }
  }

  const current = ordered[index]
  const neighbor = ordered[neighborIndex]

  const { error: firstError } = await supabase
    .from('topics')
    .update({ sort_order: neighbor.sort_order })
    .eq('id', current.id)

  const { error: secondError } = await supabase
    .from('topics')
    .update({ sort_order: current.sort_order })
    .eq('id', neighbor.id)

  if (firstError || secondError) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: null, error: null }
})
