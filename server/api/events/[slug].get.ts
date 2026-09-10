import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../../utils/supabase'

const EVENT_NOT_FOUND_ERROR = 'Event not found.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('id, name, status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const [settingsResult, attendeeTypesResult] = await Promise.all([
    supabase
      .from('event_settings')
      .select('welcome_text, accent_color, background_color, theme_mode, require_attendee_name, require_attendee_type')
      .eq('event_id', found.id)
      .single(),
    supabase
      .from('attendee_types')
      .select('id, label')
      .eq('event_id', found.id)
      .is('deleted_at', null)
  ])

  const settings = settingsResult.data

  return {
    success: true,
    data: {
      id: found.id,
      name: found.name,
      welcomeText: settings?.welcome_text ?? null,
      accentColor: settings?.accent_color ?? null,
      backgroundColor: settings?.background_color ?? null,
      themeMode: settings?.theme_mode ?? 'system',
      requireAttendeeName: settings?.require_attendee_name ?? false,
      requireAttendeeType: settings?.require_attendee_type ?? false,
      attendeeTypes: attendeeTypesResult.data ?? []
    },
    error: null
  }
})
