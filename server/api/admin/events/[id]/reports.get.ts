import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const BUCKET = 'event-reports'
const SIGNED_URL_TTL_SECONDS = 3600

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: reports } = await supabase
    .from('reports')
    .select('id, report_type, format, storage_path, created_at, generated_by')
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const generatorIds = [...new Set((reports ?? []).map(r => r.generated_by))]

  const { data: generators } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', generatorIds.length ? generatorIds : [''])

  const generatorEmailById = new Map((generators ?? []).map(p => [p.id, p.email]))

  const bucket = supabase.storage.from(BUCKET)

  const result = await Promise.all((reports ?? []).map(async (r) => {
    const url = r.storage_path
      ? (await bucket.createSignedUrl(r.storage_path, SIGNED_URL_TTL_SECONDS)).data?.signedUrl ?? null
      : null

    return {
      id: r.id,
      reportType: r.report_type,
      format: r.format,
      generatedByEmail: generatorEmailById.get(r.generated_by) ?? null,
      createdAt: r.created_at,
      url
    }
  }))

  return { success: true, data: { reports: result }, error: null }
})
