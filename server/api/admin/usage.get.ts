import { defineEventHandler, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'

type UsageStatus = 'normal' | 'approaching_capacity' | 'consider_upgrading'

function computeStatus(value: number, warning: number, critical: number): UsageStatus {
  if (value >= critical) return 'consider_upgrading'
  if (value >= warning) return 'approaching_capacity'
  return 'normal'
}

export default defineEventHandler(async (event) => {
  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const [{ data: thresholds }, { data: liveEvents }, { data: dbSizeBytes }, { data: attachments }] = await Promise.all([
    supabase.from('usage_guardrail_thresholds').select('*').single(),
    supabase.from('events').select('id').eq('status', 'live').is('deleted_at', null),
    supabase.rpc('get_database_size_bytes'),
    supabase.from('attachments').select('size_bytes').is('deleted_at', null)
  ])

  const liveEventIds = (liveEvents ?? []).map(e => e.id)

  const { count: activeCount } = liveEventIds.length
    ? await supabase
        .from('attendees')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('event_id', liveEventIds)
    : { count: 0 }

  const storageBytes = (attachments ?? []).reduce((sum, a) => sum + (a.size_bytes ?? 0), 0)

  const resolvedActiveCount = activeCount ?? 0
  const resolvedDbSizeBytes = dbSizeBytes ?? 0

  return {
    success: true,
    data: {
      activeCount: resolvedActiveCount,
      dbSizeBytes: resolvedDbSizeBytes,
      storageBytes,
      thresholds,
      statuses: {
        activeCount: computeStatus(resolvedActiveCount, thresholds?.active_count_warning_threshold ?? 0, thresholds?.active_count_critical_threshold ?? 0),
        dbSize: computeStatus(resolvedDbSizeBytes, thresholds?.db_size_warning_bytes ?? 0, thresholds?.db_size_critical_bytes ?? 0),
        storage: computeStatus(storageBytes, thresholds?.storage_warning_bytes ?? 0, thresholds?.storage_critical_bytes ?? 0)
      }
    },
    error: null
  }
})
