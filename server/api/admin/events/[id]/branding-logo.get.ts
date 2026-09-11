import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const SIGNED_URL_TTL_SECONDS = 3600

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: settings } = await supabase
    .from('event_settings')
    .select('logo_storage_path, sponsor_logo_storage_path')
    .eq('event_id', eventId)
    .single()

  const bucket = supabase.storage.from('event-branding')

  const [logoUrl, sponsorLogoUrl] = await Promise.all([
    settings?.logo_storage_path
      ? bucket.createSignedUrl(settings.logo_storage_path, SIGNED_URL_TTL_SECONDS).then(r => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
    settings?.sponsor_logo_storage_path
      ? bucket.createSignedUrl(settings.sponsor_logo_storage_path, SIGNED_URL_TTL_SECONDS).then(r => r.data?.signedUrl ?? null)
      : Promise.resolve(null)
  ])

  return { success: true, data: { logoUrl, sponsorLogoUrl }, error: null }
})
