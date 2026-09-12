import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../../utils/verify-administrator'
import { logAuditAction } from '../../../utils/log-audit-action'
import { restoreEventFromBackup } from '../../../utils/restore-event-from-backup'

interface RestoreBody {
  backup?: unknown
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'

export default defineEventHandler(async (event) => {
  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<RestoreBody>(event)
  const result = await restoreEventFromBackup(body?.backup, administratorId)

  if (!result.ok) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: result.error }
  }

  const sourceEventName = (body?.backup as { event?: { name?: unknown } } | undefined)?.event?.name
  await logAuditAction(administratorId, 'event_restored_from_backup', result.eventId, {
    sourceEventName: typeof sourceEventName === 'string' ? sourceEventName : null
  })

  return { success: true, data: { eventId: result.eventId, slug: result.slug }, error: null }
})
