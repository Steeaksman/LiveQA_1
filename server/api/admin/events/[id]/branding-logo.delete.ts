import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'

interface RemoveBrandingLogoBody {
  slot?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const INVALID_SLOT_ERROR = 'Invalid logo slot.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const BUCKET = 'event-branding'

const SLOT_COLUMNS = {
  logo: 'logo_storage_path',
  sponsor_logo: 'sponsor_logo_storage_path'
} as const

type Slot = keyof typeof SLOT_COLUMNS

function isSlot(value: string): value is Slot {
  return value === 'logo' || value === 'sponsor_logo'
}

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<RemoveBrandingLogoBody>(event)
  const slotValue = body?.slot ?? ''

  if (!isSlot(slotValue)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: INVALID_SLOT_ERROR }
  }

  const supabase = useSupabaseServiceRole()
  const column = SLOT_COLUMNS[slotValue]

  const { data: settings } = await supabase
    .from('event_settings')
    .select(column)
    .eq('event_id', eventId)
    .single()

  const existingPath = settings ? (settings as Record<string, string | null>)[column] : null

  if (!existingPath) {
    return { success: true, data: null, error: null }
  }

  await supabase.storage.from(BUCKET).remove([existingPath])

  const { error: updateError } = await supabase
    .from('event_settings')
    .update({ [column]: null })
    .eq('event_id', eventId)

  if (updateError) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'branding_logo_removed', eventId, { slot: slotValue })

  return { success: true, data: null, error: null }
})
