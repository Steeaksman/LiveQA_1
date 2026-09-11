import { defineEventHandler, getRouterParam, readMultipartFormData, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const INVALID_SLOT_ERROR = 'Invalid logo slot.'
const NO_FILE_ERROR = 'Please choose a file to upload.'
const UNSUPPORTED_TYPE_ERROR = 'Unsupported file type.'
const TOO_LARGE_ERROR = 'File is too large (max 2 MB).'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const BUCKET = 'event-branding'
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SIZE_BYTES = 2097152
const SIGNED_URL_TTL_SECONDS = 3600

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

  const parts = (await readMultipartFormData(event)) ?? []

  let slotValue = ''
  let file: { type?: string, data: Buffer } | undefined

  for (const part of parts) {
    if (part.name === 'file' && part.data?.length) {
      file = { type: part.type, data: part.data }
    } else if (part.name === 'slot') {
      slotValue = part.data.toString('utf-8')
    }
  }

  if (!isSlot(slotValue)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: INVALID_SLOT_ERROR }
  }

  if (!file) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NO_FILE_ERROR }
  }

  if (!file.type || !ALLOWED_MIME_TYPES.includes(file.type)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: UNSUPPORTED_TYPE_ERROR }
  }

  if (file.data.length > MAX_SIZE_BYTES) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: TOO_LARGE_ERROR }
  }

  const supabase = useSupabaseServiceRole()
  const storagePath = `${eventId}/${slotValue}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.data, { contentType: file.type, upsert: true })

  if (uploadError) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const column = SLOT_COLUMNS[slotValue]
  const { error: updateError } = await supabase
    .from('event_settings')
    .update({ [column]: storagePath })
    .eq('event_id', eventId)

  if (updateError) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  return { success: true, data: { url: signed?.signedUrl ?? null }, error: null }
})
