import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../utils/supabase'

interface UsageSettingsBody {
  activeCountWarningThreshold?: number
  activeCountCriticalThreshold?: number
  dbSizeWarningBytes?: number
  dbSizeCriticalBytes?: number
  storageWarningBytes?: number
  storageCriticalBytes?: number
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export default defineEventHandler(async (event) => {
  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<UsageSettingsBody>(event)

  const fields = [
    body?.activeCountWarningThreshold,
    body?.activeCountCriticalThreshold,
    body?.dbSizeWarningBytes,
    body?.dbSizeCriticalBytes,
    body?.storageWarningBytes,
    body?.storageCriticalBytes
  ]

  if (!fields.every(isNonNegativeInteger)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: 'Each threshold must be a non-negative whole number.' }
  }

  const [activeWarning, activeCritical, dbWarning, dbCritical, storageWarning, storageCritical] = fields as number[]

  if (activeWarning >= activeCritical) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: 'The active-count warning threshold must be less than the critical threshold.' }
  }

  if (dbWarning >= dbCritical) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: 'The database-size warning threshold must be less than the critical threshold.' }
  }

  if (storageWarning >= storageCritical) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: 'The storage warning threshold must be less than the critical threshold.' }
  }

  const supabase = useSupabaseServiceRole()

  const { data: existing } = await supabase
    .from('usage_guardrail_thresholds')
    .select('id')
    .single()

  if (!existing) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const { error } = await supabase
    .from('usage_guardrail_thresholds')
    .update({
      active_count_warning_threshold: activeWarning,
      active_count_critical_threshold: activeCritical,
      db_size_warning_bytes: dbWarning,
      db_size_critical_bytes: dbCritical,
      storage_warning_bytes: storageWarning,
      storage_critical_bytes: storageCritical
    })
    .eq('id', existing.id)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: null, error: null }
})
