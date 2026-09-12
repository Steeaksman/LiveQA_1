import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const [
    { data: eventRow },
    { data: eventSettings },
    { data: attendeeTypes },
    { data: topics },
    { data: attendees },
    { data: questions },
    { data: replies },
    { data: votes },
    { data: reports }
  ] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('event_settings').select('*').eq('event_id', eventId).single(),
    supabase.from('attendee_types').select('*').eq('event_id', eventId),
    supabase.from('topics').select('*').eq('event_id', eventId),
    supabase.from('attendees').select('*').eq('event_id', eventId),
    supabase.from('questions').select('*').eq('event_id', eventId),
    supabase.from('replies').select('*').eq('event_id', eventId),
    supabase.from('votes').select('*').eq('event_id', eventId),
    supabase.from('reports').select('*').eq('event_id', eventId)
  ])

  return {
    success: true,
    data: {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      event: eventRow,
      eventSettings,
      attendeeTypes: attendeeTypes ?? [],
      topics: topics ?? [],
      attendees: attendees ?? [],
      questions: questions ?? [],
      replies: replies ?? [],
      votes: votes ?? [],
      reports: reports ?? []
    },
    error: null
  }
})
