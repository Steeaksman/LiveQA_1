import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { isValidJoinCode, isValidSlug } from '../../../../../app/utils/generate-event-identifiers'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const EVENT_NOT_FOUND_ERROR = 'Event not found.'

const STORAGE_BUCKETS = {
  branding: 'event-branding',
  attachments: 'question-attachments',
  reports: 'event-reports'
} as const

type CheckStatus = 'ok' | 'warning' | 'fail'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: eventRow } = await supabase
    .from('events')
    .select('status, slug, join_code, submissions_open, voting_open, moderator_access_enabled')
    .eq('id', eventId)
    .maybeSingle()

  if (!eventRow) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const [databaseProbe, authResult, settingsResult, brandingResult, attachmentsResult, reportsResult] = await Promise.all([
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
    supabase
      .from('event_settings')
      .select('moderator_password_hash, moderator_locked_until')
      .eq('event_id', eventId)
      .single(),
    supabase.storage.from(STORAGE_BUCKETS.branding).list('', { limit: 1 }),
    supabase.storage.from(STORAGE_BUCKETS.attachments).list('', { limit: 1 }),
    supabase.storage.from(STORAGE_BUCKETS.reports).list('', { limit: 1 })
  ])

  const database: { status: CheckStatus } = {
    status: databaseProbe.error ? 'fail' : 'ok'
  }

  const supabaseAuth: { status: CheckStatus } = {
    status: authResult.error ? 'fail' : 'ok'
  }

  const bucketStatus = (result: { error: unknown }): CheckStatus => result.error ? 'fail' : 'ok'
  const brandingBucketStatus = bucketStatus(brandingResult)
  const attachmentsBucketStatus = bucketStatus(attachmentsResult)
  const reportsBucketStatus = bucketStatus(reportsResult)

  const storage: { status: CheckStatus, buckets: Record<'branding' | 'attachments' | 'reports', CheckStatus> } = {
    status: [brandingBucketStatus, attachmentsBucketStatus, reportsBucketStatus].includes('fail') ? 'fail' : 'ok',
    buckets: {
      branding: brandingBucketStatus,
      attachments: attachmentsBucketStatus,
      reports: reportsBucketStatus
    }
  }

  const eventLive = eventRow.status === 'live'
  const slugValid = isValidSlug(eventRow.slug)
  const joinCodeValid = isValidJoinCode(eventRow.join_code)

  const qrAndJoinCode: { status: CheckStatus, eventLive: boolean, slugValid: boolean, joinCodeValid: boolean } = {
    status: eventLive && slugValid && joinCodeValid ? 'ok' : 'fail',
    eventLive,
    slugValid,
    joinCodeValid
  }

  const accessEnabled = eventRow.moderator_access_enabled
  const passwordSet = !!settingsResult.data?.moderator_password_hash
  const lockedUntil = settingsResult.data?.moderator_locked_until ? new Date(settingsResult.data.moderator_locked_until).getTime() : null
  const lockedOut = lockedUntil !== null && lockedUntil > Date.now()

  let moderatorAuthStatus: CheckStatus = 'ok'
  if (accessEnabled && !passwordSet) {
    moderatorAuthStatus = 'fail'
  } else if (!accessEnabled || lockedOut) {
    moderatorAuthStatus = 'warning'
  }

  const moderatorAuth: { status: CheckStatus, accessEnabled: boolean, passwordSet: boolean, lockedOut: boolean } = {
    status: moderatorAuthStatus,
    accessEnabled,
    passwordSet,
    lockedOut
  }

  const configuration = {
    status: eventRow.status,
    submissionsOpen: eventRow.submissions_open,
    votingOpen: eventRow.voting_open,
    moderatorAccessEnabled: eventRow.moderator_access_enabled
  }

  return {
    success: true,
    data: {
      supabaseAuth,
      database,
      storage,
      qrAndJoinCode,
      moderatorAuth,
      configuration
    },
    error: null
  }
})
