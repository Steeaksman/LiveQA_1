import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../../utils/supabase'

interface JoinBody {
  eventId?: string
  token?: string
  displayName?: string
  attendeeTypeId?: string
}

const EVENT_NOT_FOUND_ERROR = 'Event not found.'
const NAME_REQUIRED_ERROR = 'Please enter your name.'
const TYPE_REQUIRED_ERROR = 'Please choose your attendee type.'
const TYPE_INVALID_ERROR = 'Please choose a valid attendee type.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const MAX_DISPLAY_NAME_LENGTH = 100

export default defineEventHandler(async (event) => {
  const body = await readBody<JoinBody>(event)
  const eventId = body?.eventId ?? ''
  const token = body?.token ?? ''

  if (!eventId || !token) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: sourceEvent } = await supabase
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sourceEvent || sourceEvent.status !== 'live') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const { data: existingAttendee } = await supabase
    .from('attendees')
    .select('id')
    .eq('event_id', eventId)
    .eq('token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingAttendee) {
    return { success: true, data: { attendeeId: existingAttendee.id }, error: null }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('require_attendee_name, require_attendee_type')
    .eq('event_id', eventId)
    .single()

  const { data: attendeeTypes } = await supabase
    .from('attendee_types')
    .select('id')
    .eq('event_id', eventId)
    .is('deleted_at', null)

  const displayName = (body?.displayName ?? '').trim().slice(0, MAX_DISPLAY_NAME_LENGTH)
  if (settings?.require_attendee_name && !displayName) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NAME_REQUIRED_ERROR }
  }

  const attendeeTypeId = body?.attendeeTypeId ?? null
  const hasAttendeeTypes = (attendeeTypes ?? []).length > 0

  if (settings?.require_attendee_type && hasAttendeeTypes && !attendeeTypeId) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: TYPE_REQUIRED_ERROR }
  }

  if (attendeeTypeId && !(attendeeTypes ?? []).some(t => t.id === attendeeTypeId)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: TYPE_INVALID_ERROR }
  }

  const { data: created, error } = await supabase
    .from('attendees')
    .insert({
      event_id: eventId,
      token,
      display_name: displayName || null,
      attendee_type_id: attendeeTypeId
    })
    .select('id')
    .single()

  if (error || !created) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: { attendeeId: created.id }, error: null }
})
