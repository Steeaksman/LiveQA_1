<script setup lang="ts">
import type { AuthenticatedProfile } from '~/composables/useAuthSession'
import type { RealtimeChannel } from '@supabase/supabase-js'

definePageMeta({ middleware: 'admin' })

interface AttendeeTypeRow {
  id: string
  label: string
}

const route = useRoute()
const eventId = route.params.id as string
const supabase = useSupabase()

const loading = ref(true)
const notFound = ref(false)
const activeTab = ref<'dashboard' | 'questions' | 'reports' | 'backup' | 'readiness' | 'details' | 'attendee-types' | 'settings' | 'qr-codes' | 'signage' | 'branding'>('details')

const profile = ref<AuthenticatedProfile | null>(null)
const duplicating = ref(false)
const duplicateError = ref<string | null>(null)

const name = ref('')
const slug = ref('')
const joinCode = ref('')
const status = ref('')
const detailsError = ref<string | null>(null)
const slugError = ref<string | null>(null)
const joinCodeError = ref<string | null>(null)
const savingDetails = ref(false)

const newLabel = ref('')
const addingLabel = ref(false)
const attendeeTypes = ref<AttendeeTypeRow[]>([])
const attendeeTypesError = ref<string | null>(null)

const moderationOptions = [
  { label: 'Immediate publish', value: 'immediate' },
  { label: 'Approval queue', value: 'queue' }
]
const questionMaxLength = ref(500)
const moderationMode = ref<'immediate' | 'queue'>('queue')
const hideVoteCounts = ref(false)
const submissionsOpen = ref(false)
const votingOpen = ref(false)
const moderatorAccessEnabled = ref(false)
const requireAttendeeName = ref(false)
const requireAttendeeType = ref(false)
const duplicateCheckOptions = [
  { label: 'Off', value: 'off' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' }
]
const duplicateCheckStrictness = ref<'off' | 'low' | 'medium' | 'high'>('off')
const attendeeEditWindowMinutes = ref(0)
const anonymityOptions = [
  { label: 'Never anonymous', value: 'named' },
  { label: 'Attendee chooses', value: 'optional' },
  { label: 'Always anonymous', value: 'always' }
]
const anonymityMode = ref<'named' | 'optional' | 'always'>('always')
const showAttendeeType = ref(false)
const attachmentMaxCount = ref(0)
const attachmentMaxSizeBytes = ref(5242880)
const abuseProtectionOptions = [
  { label: 'Open', value: 'open' },
  { label: 'Standard', value: 'standard' },
  { label: 'Strict', value: 'strict' }
]
const abuseProtectionTier = ref<'open' | 'standard' | 'strict'>('standard')
const settingsError = ref<string | null>(null)
const savingSettings = ref(false)

const moderatorPassword = ref('')
const moderatorPasswordError = ref<string | null>(null)
const moderatorPasswordSuccess = ref(false)
const savingModeratorPassword = ref(false)

const themeModeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Match visitor device', value: 'system' }
]
const accentColor = ref('')
const backgroundColor = ref('')
const welcomeText = ref('')
const themeMode = ref<'light' | 'dark' | 'system'>('system')
const accentColorError = ref<string | null>(null)
const backgroundColorError = ref<string | null>(null)
const brandingError = ref<string | null>(null)
const savingBranding = ref(false)

const logoUrl = ref<string | null>(null)
const sponsorLogoUrl = ref<string | null>(null)
const selectedLogoFiles = ref<{ logo: File | null, sponsor_logo: File | null }>({ logo: null, sponsor_logo: null })
const uploadingSlot = ref<'logo' | 'sponsor_logo' | null>(null)
const removingSlot = ref<'logo' | 'sponsor_logo' | null>(null)
const logoUploadError = ref<string | null>(null)

const audienceUrl = computed(() => `${location.origin}/e/${slug.value}`)
const moderatorUrl = computed(() => `${location.origin}/m/${slug.value}`)

interface DashboardData {
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  publicCount: number
  answeredCount: number
  archivedCount: number
  topVotedQuestion: { id: string, text: string, voteCount: number } | null
  currentTopic: { name: string } | null
}

interface DashboardResponse {
  success: boolean
  data: DashboardData | null
  error: string | null
}

const dashboardData = ref<DashboardData | null>(null)
const dashboardError = ref<string | null>(null)
const activeAttendeeCount = ref(0)
const activeModeratorCount = ref(0)
let dashboardPollTimer: ReturnType<typeof setInterval> | undefined
let dashboardPresenceChannel: RealtimeChannel | undefined

async function fetchDashboard() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  try {
    const response = await $fetch<DashboardResponse>(`/api/admin/events/${eventId}/dashboard`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (response.success) {
      dashboardData.value = response.data
    } else {
      dashboardError.value = response.error ?? 'Something went wrong. Please try again.'
    }
  } catch {
    dashboardError.value = 'Something went wrong. Please try again.'
  }
}

function updateDashboardPresenceCounts() {
  if (!dashboardPresenceChannel) return
  const presences = Object.values(dashboardPresenceChannel.presenceState()).flat() as { role?: string }[]
  activeAttendeeCount.value = presences.filter(p => p.role === 'attendee').length
  activeModeratorCount.value = presences.filter(p => p.role === 'moderator').length
}

function startDashboardLiveUpdates() {
  dashboardError.value = null
  fetchDashboard()
  dashboardPollTimer = setInterval(fetchDashboard, 15000)

  dashboardPresenceChannel = supabase
    .channel(`event:${eventId}:questions`)
    .on('presence', { event: 'sync' }, updateDashboardPresenceCounts)
    .on('presence', { event: 'join' }, updateDashboardPresenceCounts)
    .on('presence', { event: 'leave' }, updateDashboardPresenceCounts)
    .subscribe()
}

function stopDashboardLiveUpdates() {
  if (dashboardPollTimer) {
    clearInterval(dashboardPollTimer)
    dashboardPollTimer = undefined
  }
  if (dashboardPresenceChannel) {
    supabase.removeChannel(dashboardPresenceChannel)
    dashboardPresenceChannel = undefined
  }
  activeAttendeeCount.value = 0
  activeModeratorCount.value = 0
}

watch(activeTab, (value) => {
  if (value === 'dashboard') {
    startDashboardLiveUpdates()
  } else {
    stopDashboardLiveUpdates()
  }

  if (value === 'questions') {
    fetchQuestions()
  }

  if (value === 'reports') {
    fetchReports()
  }
})

onUnmounted(stopDashboardLiveUpdates)

interface QuestionRevision {
  id: string
  originalText: string
  revisedText: string
  editedByEmail: string | null
  createdAt: string
}

interface AdminQuestionRow {
  id: string
  text: string
  createdAt: string
  approvalStatus: string
  visibility: string
  answered: boolean
  archived: boolean
  displayName: string | null
  revisions: QuestionRevision[]
}

interface QuestionsResponse {
  success: boolean
  data: { questions: AdminQuestionRow[], deletedQuestions: AdminQuestionRow[] } | null
  error: string | null
}

interface EditQuestionResponse {
  success: boolean
  data: { questionId: string } | null
  error: string | null
}

interface QuestionActionResponse {
  success: boolean
  data: { questionId: string } | null
  error: string | null
}

const questions = ref<AdminQuestionRow[]>([])
const deletedQuestions = ref<AdminQuestionRow[]>([])
const questionsError = ref<string | null>(null)
const editingQuestionId = ref<string | null>(null)
const editingText = ref('')
const savingQuestionId = ref<string | null>(null)
const expandedRevisionsId = ref<string | null>(null)
const questionActionId = ref<string | null>(null)

async function fetchQuestions() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  try {
    const response = await $fetch<QuestionsResponse>(`/api/admin/events/${eventId}/questions`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (response.success && response.data) {
      questions.value = response.data.questions
      deletedQuestions.value = response.data.deletedQuestions
    } else {
      questionsError.value = response.error ?? 'Something went wrong. Please try again.'
    }
  } catch {
    questionsError.value = 'Something went wrong. Please try again.'
  }
}

async function performQuestionAction(routeName: 'soft-delete' | 'restore' | 'permanent-delete', questionId: string) {
  questionsError.value = null
  questionActionId.value = questionId

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      questionsError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<QuestionActionResponse>(`/api/admin/events/${eventId}/questions/${routeName}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { questionId }
    })

    if (!response.success) {
      questionsError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    await fetchQuestions()
  } catch (err) {
    const data = (err as { data?: QuestionActionResponse })?.data
    questionsError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    questionActionId.value = null
  }
}

function deleteQuestion(questionId: string) {
  performQuestionAction('soft-delete', questionId)
}

function restoreQuestion(questionId: string) {
  performQuestionAction('restore', questionId)
}

function permanentlyDeleteQuestion(question: AdminQuestionRow) {
  const confirmed = window.confirm(`Permanently delete "${question.text}"? This cannot be undone.`)
  if (!confirmed) return
  performQuestionAction('permanent-delete', question.id)
}

function startEditingQuestion(question: AdminQuestionRow) {
  editingQuestionId.value = question.id
  editingText.value = question.text
}

function cancelEditingQuestion() {
  editingQuestionId.value = null
  editingText.value = ''
}

async function saveQuestionEdit(questionId: string) {
  questionsError.value = null
  savingQuestionId.value = questionId

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      questionsError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<EditQuestionResponse>(`/api/admin/events/${eventId}/questions/edit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { questionId, text: editingText.value }
    })

    if (!response.success) {
      questionsError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    cancelEditingQuestion()
    await fetchQuestions()
  } catch (err) {
    const data = (err as { data?: EditQuestionResponse })?.data
    questionsError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    savingQuestionId.value = null
  }
}

function toggleRevisions(questionId: string) {
  expandedRevisionsId.value = expandedRevisionsId.value === questionId ? null : questionId
}

interface ReportRow {
  id: string
  reportType: 'combined' | 'topic_by_topic'
  format: 'csv' | 'html' | 'pdf'
  generatedByEmail: string | null
  createdAt: string
  url: string | null
}

interface ReportsResponse {
  success: boolean
  data: { reports: ReportRow[] } | null
  error: string | null
}

interface GenerateReportResponse {
  success: boolean
  data: { reportId: string, url: string | null } | null
  error: string | null
}

const reportTypeOptions = [
  { label: 'Combined', value: 'combined' },
  { label: 'Topic by topic', value: 'topic_by_topic' }
]
const reportFormatOptions = [
  { label: 'CSV', value: 'csv' },
  { label: 'Printable HTML', value: 'html' },
  { label: 'Branded PDF', value: 'pdf' }
]

const selectedReportType = ref<'combined' | 'topic_by_topic'>('combined')
const selectedReportFormat = ref<'csv' | 'html' | 'pdf'>('csv')
const reports = ref<ReportRow[]>([])
const reportsError = ref<string | null>(null)
const generatingReport = ref(false)

async function fetchReports() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  try {
    const response = await $fetch<ReportsResponse>(`/api/admin/events/${eventId}/reports`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (response.success && response.data) {
      reports.value = response.data.reports
    } else {
      reportsError.value = response.error ?? 'Something went wrong. Please try again.'
    }
  } catch {
    reportsError.value = 'Something went wrong. Please try again.'
  }
}

async function generateReport() {
  reportsError.value = null
  generatingReport.value = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      reportsError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<GenerateReportResponse>(`/api/admin/events/${eventId}/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { reportType: selectedReportType.value, format: selectedReportFormat.value }
    })

    if (!response.success) {
      reportsError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    if (response.data?.url) {
      window.open(response.data.url, '_blank')
    }

    await fetchReports()
  } catch (err) {
    const data = (err as { data?: GenerateReportResponse })?.data
    reportsError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    generatingReport.value = false
  }
}

interface ExportResponse {
  success: boolean
  data: Record<string, unknown> | null
  error: string | null
}

const backupError = ref<string | null>(null)
const downloadingBackup = ref(false)

async function downloadBackup() {
  backupError.value = null
  downloadingBackup.value = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      backupError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<ExportResponse>(`/api/admin/events/${eventId}/export`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (!response.success || !response.data) {
      backupError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    const json = JSON.stringify(response.data, null, 2)
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
    const date = new Date().toISOString().slice(0, 10)
    downloadDataUrl(dataUrl, `${slug.value}-backup-${date}.json`)
  } catch (err) {
    const data = (err as { data?: ExportResponse })?.data
    backupError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    downloadingBackup.value = false
  }
}

type CheckStatus = 'ok' | 'warning' | 'fail'

interface ReadinessData {
  supabaseAuth: { status: CheckStatus }
  database: { status: CheckStatus }
  storage: { status: CheckStatus, buckets: { branding: CheckStatus, attachments: CheckStatus, reports: CheckStatus } }
  qrAndJoinCode: { status: CheckStatus, eventLive: boolean, slugValid: boolean, joinCodeValid: boolean }
  moderatorAuth: { status: CheckStatus, accessEnabled: boolean, passwordSet: boolean, lockedOut: boolean }
  configuration: { status: string, submissionsOpen: boolean, votingOpen: boolean, moderatorAccessEnabled: boolean }
}

interface ReadinessResponse {
  success: boolean
  data: ReadinessData | null
  error: string | null
}

const READINESS_STATUS_LABELS: Record<CheckStatus, string> = {
  ok: 'OK',
  warning: 'Warning',
  fail: 'Fail'
}

const READINESS_STATUS_COLORS: Record<CheckStatus, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  warning: 'warning',
  fail: 'error'
}

const readinessData = ref<ReadinessData | null>(null)
const realtimeStatus = ref<CheckStatus | null>(null)
const readinessError = ref<string | null>(null)
const runningReadinessCheck = ref(false)

const overallReadinessStatus = computed<CheckStatus | null>(() => {
  if (!readinessData.value || realtimeStatus.value === null) return null
  const statuses: CheckStatus[] = [
    readinessData.value.supabaseAuth.status,
    readinessData.value.database.status,
    readinessData.value.storage.status,
    readinessData.value.qrAndJoinCode.status,
    readinessData.value.moderatorAuth.status,
    realtimeStatus.value
  ]
  if (statuses.includes('fail')) return 'fail'
  if (statuses.includes('warning')) return 'warning'
  return 'ok'
})

function probeRealtime(): Promise<CheckStatus> {
  return new Promise((resolve) => {
    let settled = false
    const channel = supabase.channel(`readiness-check:${eventId}:${Date.now()}`)

    const finish = (status: CheckStatus) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      supabase.removeChannel(channel)
      resolve(status)
    }

    const timer = setTimeout(() => finish('fail'), 5000)

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        finish('ok')
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        finish('fail')
      }
    })
  })
}

async function runReadinessCheck() {
  readinessError.value = null
  readinessData.value = null
  realtimeStatus.value = null
  runningReadinessCheck.value = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      readinessError.value = 'Your session expired. Please log in again.'
      return
    }

    const [response, realtimeResult] = await Promise.all([
      $fetch<ReadinessResponse>(`/api/admin/events/${eventId}/readiness`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      }),
      probeRealtime()
    ])

    if (!response.success || !response.data) {
      readinessError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    readinessData.value = response.data
    realtimeStatus.value = realtimeResult
  } catch (err) {
    const data = (err as { data?: ReadinessResponse })?.data
    readinessError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    runningReadinessCheck.value = false
  }
}

onMounted(async () => {
  profile.value = await getAuthenticatedProfile(supabase)

  const { data: event } = await supabase
    .from('events')
    .select('id, name, slug, join_code, status')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) {
    notFound.value = true
    loading.value = false
    return
  }

  name.value = event.name
  slug.value = event.slug
  joinCode.value = event.join_code
  status.value = event.status

  const [settingsResult, attendeeTypesResult] = await Promise.all([
    supabase
      .from('event_settings')
      .select('question_max_length, moderation_mode, hide_vote_counts, accent_color, background_color, welcome_text, theme_mode, require_attendee_name, require_attendee_type, duplicate_check_strictness, attendee_edit_window_minutes, anonymity_mode, show_attendee_type, attachment_max_count, attachment_max_size_bytes, abuse_protection_tier')
      .eq('event_id', eventId)
      .single(),
    supabase
      .from('attendee_types')
      .select('id, label')
      .eq('event_id', eventId)
      .is('deleted_at', null)
  ])

  if (settingsResult.data) {
    questionMaxLength.value = settingsResult.data.question_max_length
    moderationMode.value = settingsResult.data.moderation_mode
    hideVoteCounts.value = settingsResult.data.hide_vote_counts
    accentColor.value = settingsResult.data.accent_color ?? ''
    backgroundColor.value = settingsResult.data.background_color ?? ''
    welcomeText.value = settingsResult.data.welcome_text ?? ''
    themeMode.value = settingsResult.data.theme_mode
    requireAttendeeName.value = settingsResult.data.require_attendee_name
    requireAttendeeType.value = settingsResult.data.require_attendee_type
    duplicateCheckStrictness.value = settingsResult.data.duplicate_check_strictness
    attendeeEditWindowMinutes.value = settingsResult.data.attendee_edit_window_minutes
    anonymityMode.value = settingsResult.data.anonymity_mode
    showAttendeeType.value = settingsResult.data.show_attendee_type
    attachmentMaxCount.value = settingsResult.data.attachment_max_count
    attachmentMaxSizeBytes.value = settingsResult.data.attachment_max_size_bytes
    abuseProtectionTier.value = settingsResult.data.abuse_protection_tier
  }
  submissionsOpen.value = false
  votingOpen.value = false
  moderatorAccessEnabled.value = false
  const { data: eventOpenState } = await supabase
    .from('events')
    .select('submissions_open, voting_open, moderator_access_enabled')
    .eq('id', eventId)
    .single()
  if (eventOpenState) {
    submissionsOpen.value = eventOpenState.submissions_open
    votingOpen.value = eventOpenState.voting_open
    moderatorAccessEnabled.value = eventOpenState.moderator_access_enabled
  }

  attendeeTypes.value = attendeeTypesResult.data ?? []
  loading.value = false

  fetchBrandingLogos()
})

async function saveDetails() {
  detailsError.value = null
  slugError.value = null
  joinCodeError.value = null

  if (!name.value.trim()) {
    detailsError.value = 'Name is required.'
    return
  }

  const normalizedSlug = normalizeSlug(slug.value)
  if (!isValidSlug(normalizedSlug)) {
    slugError.value = 'Slug must be 1-63 characters: lowercase letters, numbers, and hyphens only, no leading or trailing hyphen.'
    return
  }

  const normalizedJoinCode = normalizeJoinCode(joinCode.value)
  if (!isValidJoinCode(normalizedJoinCode)) {
    joinCodeError.value = 'Join code must be exactly 6 letters and/or numbers.'
    return
  }

  savingDetails.value = true

  try {
    const { error, data } = await supabase
      .from('events')
      .update({ name: name.value.trim(), slug: normalizedSlug, join_code: normalizedJoinCode })
      .eq('id', eventId)
      .select('id')

    if (error) {
      detailsError.value = error.code === '23505'
        ? 'That slug or join code is already in use. Please choose different values.'
        : 'Something went wrong. Please try again.'
      return
    }

    if (!data?.length) {
      detailsError.value = 'Something went wrong. Please try again.'
      return
    }

    slug.value = normalizedSlug
    joinCode.value = normalizedJoinCode
  } finally {
    savingDetails.value = false
  }
}

async function duplicateEvent() {
  duplicateError.value = null
  duplicating.value = true

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      duplicateError.value = 'Your session expired. Please log in again.'
      return
    }

    const [settingsResult, attendeeTypesResult] = await Promise.all([
      supabase
        .from('event_settings')
        .select('question_max_length, moderation_mode, hide_vote_counts')
        .eq('event_id', eventId)
        .single(),
      supabase
        .from('attendee_types')
        .select('label')
        .eq('event_id', eventId)
        .is('deleted_at', null)
    ])

    const sourceSettings = settingsResult.data
    const sourceLabels = (attendeeTypesResult.data ?? []).map(t => t.label)

    let attempt = 0
    while (attempt < 5) {
      attempt++

      const { data: newEvent, error } = await supabase
        .from('events')
        .insert({
          name: `${name.value} (Copy)`,
          slug: slugify(name.value),
          join_code: generateJoinCode(),
          created_by: user.id
        })
        .select('id')
        .single()

      if (!error && newEvent) {
        const { error: settingsError } = await supabase
          .from('event_settings')
          .insert({
            event_id: newEvent.id,
            question_max_length: sourceSettings?.question_max_length ?? 500,
            moderation_mode: sourceSettings?.moderation_mode ?? 'queue',
            hide_vote_counts: sourceSettings?.hide_vote_counts ?? false
          })

        if (settingsError) {
          duplicateError.value = 'Something went wrong. Please try again.'
          return
        }

        if (sourceLabels.length) {
          const { error: typesError } = await supabase
            .from('attendee_types')
            .insert(sourceLabels.map(label => ({ event_id: newEvent.id, label })))

          if (typesError) {
            duplicateError.value = 'Something went wrong. Please try again.'
            return
          }
        }

        await navigateTo(`/admin/events/${newEvent.id}`)
        return
      }

      if (error?.code !== '23505') {
        duplicateError.value = 'Something went wrong. Please try again.'
        return
      }
    }

    duplicateError.value = 'Something went wrong. Please try again.'
  } finally {
    duplicating.value = false
  }
}

async function addAttendeeType() {
  if (!newLabel.value.trim()) return
  addingLabel.value = true
  attendeeTypesError.value = null

  const { data, error } = await supabase
    .from('attendee_types')
    .insert({ event_id: eventId, label: newLabel.value.trim() })
    .select('id, label')
    .single()

  if (error) {
    attendeeTypesError.value = 'Could not add that attendee type. Please try again.'
  } else if (data) {
    attendeeTypes.value.push(data)
    newLabel.value = ''
  }

  addingLabel.value = false
}

async function removeAttendeeType(id: string) {
  attendeeTypesError.value = null

  const { error } = await supabase
    .from('attendee_types')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    attendeeTypesError.value = 'Could not remove that attendee type. Please try again.'
    return
  }

  attendeeTypes.value = attendeeTypes.value.filter(t => t.id !== id)
}

async function saveSettings() {
  settingsError.value = null

  if (!Number.isInteger(questionMaxLength.value) || questionMaxLength.value <= 0) {
    settingsError.value = 'Max question length must be a positive whole number.'
    return
  }

  if (!Number.isInteger(attendeeEditWindowMinutes.value) || attendeeEditWindowMinutes.value < 0) {
    settingsError.value = 'Attendee edit window must be a whole number of minutes, 0 or more.'
    return
  }

  if (!Number.isInteger(attachmentMaxCount.value) || attachmentMaxCount.value < 0) {
    settingsError.value = 'Max attachments per question must be a whole number, 0 or more.'
    return
  }

  if (!Number.isInteger(attachmentMaxSizeBytes.value) || attachmentMaxSizeBytes.value < 0) {
    settingsError.value = 'Max attachment size must be a whole number of bytes, 0 or more.'
    return
  }

  savingSettings.value = true

  try {
    const [settingsResult, eventResult] = await Promise.all([
      supabase
        .from('event_settings')
        .update({
          question_max_length: questionMaxLength.value,
          moderation_mode: moderationMode.value,
          hide_vote_counts: hideVoteCounts.value,
          require_attendee_name: requireAttendeeName.value,
          require_attendee_type: requireAttendeeType.value,
          duplicate_check_strictness: duplicateCheckStrictness.value,
          attendee_edit_window_minutes: attendeeEditWindowMinutes.value,
          anonymity_mode: anonymityMode.value,
          show_attendee_type: showAttendeeType.value,
          attachment_max_count: attachmentMaxCount.value,
          attachment_max_size_bytes: attachmentMaxSizeBytes.value,
          abuse_protection_tier: abuseProtectionTier.value
        })
        .eq('event_id', eventId)
        .select('event_id'),
      supabase
        .from('events')
        .update({
          submissions_open: submissionsOpen.value,
          voting_open: votingOpen.value,
          moderator_access_enabled: moderatorAccessEnabled.value
        })
        .eq('id', eventId)
        .select('id')
    ])

    if (settingsResult.error || eventResult.error || !settingsResult.data?.length || !eventResult.data?.length) {
      settingsError.value = 'Something went wrong. Please try again.'
    }
  } finally {
    savingSettings.value = false
  }
}

interface ModeratorPasswordResponse {
  success: boolean
  data: null
  error: string | null
}

async function saveModeratorPassword() {
  moderatorPasswordError.value = null
  moderatorPasswordSuccess.value = false

  savingModeratorPassword.value = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      moderatorPasswordError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<ModeratorPasswordResponse>(`/api/admin/events/${eventId}/moderator-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { password: moderatorPassword.value }
    })

    if (!response.success) {
      moderatorPasswordError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    moderatorPassword.value = ''
    moderatorPasswordSuccess.value = true
  } catch (err) {
    const data = (err as { data?: ModeratorPasswordResponse })?.data
    moderatorPasswordError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    savingModeratorPassword.value = false
  }
}

async function saveBranding() {
  brandingError.value = null
  accentColorError.value = null
  backgroundColorError.value = null

  const trimmedAccentColor = accentColor.value.trim()
  if (trimmedAccentColor && !isValidHexColor(trimmedAccentColor)) {
    accentColorError.value = 'Enter a hex color like #2563EB, or leave blank.'
    return
  }

  const trimmedBackgroundColor = backgroundColor.value.trim()
  if (trimmedBackgroundColor && !isValidHexColor(trimmedBackgroundColor)) {
    backgroundColorError.value = 'Enter a hex color like #2563EB, or leave blank.'
    return
  }

  savingBranding.value = true

  try {
    const { error, data } = await supabase
      .from('event_settings')
      .update({
        accent_color: trimmedAccentColor || null,
        background_color: trimmedBackgroundColor || null,
        welcome_text: welcomeText.value.trim() || null,
        theme_mode: themeMode.value
      })
      .eq('event_id', eventId)
      .select('event_id')

    if (error || !data?.length) {
      brandingError.value = 'Something went wrong. Please try again.'
    }
  } finally {
    savingBranding.value = false
  }
}

interface BrandingLogoGetResponse {
  success: boolean
  data: { logoUrl: string | null, sponsorLogoUrl: string | null } | null
  error: string | null
}

interface BrandingLogoPostResponse {
  success: boolean
  data: { url: string | null } | null
  error: string | null
}

interface BrandingLogoDeleteResponse {
  success: boolean
  data: null
  error: string | null
}

async function fetchBrandingLogos() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  try {
    const response = await $fetch<BrandingLogoGetResponse>(`/api/admin/events/${eventId}/branding-logo`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (response.success && response.data) {
      logoUrl.value = response.data.logoUrl
      sponsorLogoUrl.value = response.data.sponsorLogoUrl
    }
  } catch {
    // Preview stays empty; the Branding tab's upload/remove controls remain usable.
  }
}

function onLogoFileSelected(slot: 'logo' | 'sponsor_logo', e: Event) {
  const input = e.target as HTMLInputElement
  selectedLogoFiles.value[slot] = input.files?.[0] ?? null
}

async function uploadBrandingLogo(slot: 'logo' | 'sponsor_logo') {
  const file = selectedLogoFiles.value[slot]
  if (!file) return

  logoUploadError.value = null
  uploadingSlot.value = slot

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      logoUploadError.value = 'Your session expired. Please log in again.'
      return
    }

    const formData = new FormData()
    formData.append('slot', slot)
    formData.append('file', file)

    const response = await $fetch<BrandingLogoPostResponse>(`/api/admin/events/${eventId}/branding-logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData
    })

    if (!response.success) {
      logoUploadError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    if (slot === 'logo') {
      logoUrl.value = response.data?.url ?? null
    } else {
      sponsorLogoUrl.value = response.data?.url ?? null
    }
    selectedLogoFiles.value[slot] = null
  } catch (err) {
    const data = (err as { data?: BrandingLogoPostResponse })?.data
    logoUploadError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    uploadingSlot.value = null
  }
}

async function removeBrandingLogo(slot: 'logo' | 'sponsor_logo') {
  logoUploadError.value = null
  removingSlot.value = slot

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      logoUploadError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<BrandingLogoDeleteResponse>(`/api/admin/events/${eventId}/branding-logo`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { slot }
    })

    if (!response.success) {
      logoUploadError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    if (slot === 'logo') {
      logoUrl.value = null
    } else {
      sponsorLogoUrl.value = null
    }
  } catch (err) {
    const data = (err as { data?: BrandingLogoDeleteResponse })?.data
    logoUploadError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    removingSlot.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <div v-if="loading">
      Loading...
    </div>
    <p v-else-if="notFound">
      Event not found.
    </p>
    <div v-else>
      <div class="mb-4 flex items-center justify-between">
        <h1 class="text-xl font-semibold">
          {{ name }}
        </h1>
        <UButton
          v-if="profile?.role === 'administrator'"
          size="sm"
          variant="subtle"
          :loading="duplicating"
          label="Duplicate"
          @click="duplicateEvent"
        />
      </div>
      <UAlert v-if="duplicateError" color="error" variant="subtle" :title="duplicateError" class="mb-4" />

      <div class="mb-4 flex gap-2">
        <UButton
          :variant="activeTab === 'dashboard' ? 'solid' : 'ghost'"
          label="Dashboard"
          @click="activeTab = 'dashboard'"
        />
        <UButton
          :variant="activeTab === 'questions' ? 'solid' : 'ghost'"
          label="Questions"
          @click="activeTab = 'questions'"
        />
        <UButton
          :variant="activeTab === 'reports' ? 'solid' : 'ghost'"
          label="Reports"
          @click="activeTab = 'reports'"
        />
        <UButton
          :variant="activeTab === 'backup' ? 'solid' : 'ghost'"
          label="Backup"
          @click="activeTab = 'backup'"
        />
        <UButton
          :variant="activeTab === 'readiness' ? 'solid' : 'ghost'"
          label="Readiness"
          @click="activeTab = 'readiness'"
        />
        <UButton
          :variant="activeTab === 'details' ? 'solid' : 'ghost'"
          label="Details"
          @click="activeTab = 'details'"
        />
        <UButton
          :variant="activeTab === 'attendee-types' ? 'solid' : 'ghost'"
          label="Attendee types"
          @click="activeTab = 'attendee-types'"
        />
        <UButton
          :variant="activeTab === 'settings' ? 'solid' : 'ghost'"
          label="Settings"
          @click="activeTab = 'settings'"
        />
        <UButton
          :variant="activeTab === 'qr-codes' ? 'solid' : 'ghost'"
          label="QR codes"
          @click="activeTab = 'qr-codes'"
        />
        <UButton
          :variant="activeTab === 'signage' ? 'solid' : 'ghost'"
          label="Signage"
          @click="activeTab = 'signage'"
        />
        <UButton
          :variant="activeTab === 'branding' ? 'solid' : 'ghost'"
          label="Branding"
          @click="activeTab = 'branding'"
        />
      </div>

      <UCard v-if="activeTab === 'dashboard'">
        <div class="flex flex-col gap-3">
          <UAlert v-if="dashboardError" color="error" variant="subtle" :title="dashboardError" />
          <div class="flex gap-4">
            <p>Active attendees: {{ activeAttendeeCount }}</p>
            <p>Active moderators: {{ activeModeratorCount }}</p>
          </div>
          <div v-if="dashboardData" class="flex flex-col gap-1">
            <p>Pending: {{ dashboardData.pendingCount }}</p>
            <p>Approved: {{ dashboardData.approvedCount }}</p>
            <p>Rejected: {{ dashboardData.rejectedCount }}</p>
            <p>Public: {{ dashboardData.publicCount }}</p>
            <p>Answered: {{ dashboardData.answeredCount }}</p>
            <p>Archived: {{ dashboardData.archivedCount }}</p>
            <p>
              Top-voted question:
              <template v-if="dashboardData.topVotedQuestion">
                "{{ dashboardData.topVotedQuestion.text }}" ({{ dashboardData.topVotedQuestion.voteCount }} votes)
              </template>
              <template v-else>
                No votes yet.
              </template>
            </p>
            <p>Current topic: {{ dashboardData.currentTopic?.name ?? 'None set.' }}</p>
            <p>Submissions open: {{ submissionsOpen ? 'Yes' : 'No' }}</p>
            <p>Voting open: {{ votingOpen ? 'Yes' : 'No' }}</p>
          </div>
        </div>
      </UCard>

      <div v-else-if="activeTab === 'questions'" class="flex flex-col gap-3">
        <UAlert v-if="questionsError" color="error" variant="subtle" :title="questionsError" />
        <UCard v-for="question in questions" :key="question.id">
          <p class="text-sm text-gray-500">
            {{ question.displayName ?? 'Anonymous' }} -
            {{ question.approvalStatus }} - {{ question.visibility }}
            <template v-if="question.answered"> - answered</template>
            <template v-if="question.archived"> - archived</template>
          </p>

          <div v-if="editingQuestionId === question.id" class="mt-2 flex flex-col gap-2">
            <UTextarea v-model="editingText" />
            <div class="flex gap-2">
              <UButton size="sm" label="Save" :loading="savingQuestionId === question.id" @click="saveQuestionEdit(question.id)" />
              <UButton size="sm" variant="ghost" label="Cancel" @click="cancelEditingQuestion" />
            </div>
          </div>
          <div v-else class="mt-2 flex items-center justify-between gap-2">
            <p>{{ question.text }}</p>
            <UButton size="xs" variant="ghost" label="Edit" @click="startEditingQuestion(question)" />
          </div>

          <UButton
            size="xs"
            variant="ghost"
            class="mt-2"
            :label="`Show revisions (${question.revisions.length})`"
            @click="toggleRevisions(question.id)"
          />
          <div v-if="expandedRevisionsId === question.id" class="mt-2 flex flex-col gap-1 border-l pl-3">
            <p v-for="revision in question.revisions" :key="revision.id" class="text-sm text-gray-500">
              {{ revision.editedByEmail ?? 'Unknown' }} ({{ new Date(revision.createdAt).toLocaleString() }}):
              "{{ revision.originalText }}" -&gt; "{{ revision.revisedText }}"
            </p>
            <p v-if="question.revisions.length === 0" class="text-sm text-gray-500">
              No edits yet.
            </p>
          </div>

          <div class="mt-2 flex gap-2">
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              label="Delete"
              :loading="questionActionId === question.id"
              @click="deleteQuestion(question.id)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              label="Permanently delete"
              :loading="questionActionId === question.id"
              @click="permanentlyDeleteQuestion(question)"
            />
          </div>
        </UCard>
        <p v-if="questions.length === 0" class="text-sm text-gray-500">
          No questions yet.
        </p>

        <h2 class="mt-4 font-medium">
          Deleted questions
        </h2>
        <UCard v-for="question in deletedQuestions" :key="question.id">
          <p class="text-sm text-gray-500">
            {{ question.displayName ?? 'Anonymous' }} -
            {{ question.approvalStatus }} - {{ question.visibility }}
          </p>
          <p class="mt-2">
            {{ question.text }}
          </p>
          <div class="mt-2 flex gap-2">
            <UButton
              size="xs"
              label="Restore"
              :loading="questionActionId === question.id"
              @click="restoreQuestion(question.id)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              label="Permanently delete"
              :loading="questionActionId === question.id"
              @click="permanentlyDeleteQuestion(question)"
            />
          </div>
        </UCard>
        <p v-if="deletedQuestions.length === 0" class="text-sm text-gray-500">
          No deleted questions.
        </p>
      </div>

      <div v-else-if="activeTab === 'reports'" class="flex flex-col gap-3">
        <UCard>
          <div class="flex flex-col gap-3">
            <UFormField label="Report type">
              <USelect v-model="selectedReportType" :items="reportTypeOptions" value-key="value" />
            </UFormField>
            <UFormField label="Format">
              <USelect v-model="selectedReportFormat" :items="reportFormatOptions" value-key="value" />
            </UFormField>
            <UAlert v-if="reportsError" color="error" variant="subtle" :title="reportsError" />
            <UButton :loading="generatingReport" label="Generate" class="self-start" @click="generateReport" />
          </div>
        </UCard>

        <h2 class="font-medium">
          Past reports
        </h2>
        <UCard v-for="report in reports" :key="report.id">
          <p class="text-sm text-gray-500">
            {{ report.reportType }} - {{ report.format }} - {{ report.generatedByEmail ?? 'Unknown' }} -
            {{ new Date(report.createdAt).toLocaleString() }}
          </p>
          <a v-if="report.url" :href="report.url" target="_blank" rel="noopener noreferrer" class="underline">Download</a>
        </UCard>
        <p v-if="reports.length === 0" class="text-sm text-gray-500">
          No reports generated yet.
        </p>
      </div>

      <UCard v-else-if="activeTab === 'backup'">
        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500">
            Download a JSON backup of this event's configuration, attendee types, topics, questions, replies, votes, attendees, and report metadata.
          </p>
          <UAlert v-if="backupError" color="error" variant="subtle" :title="backupError" />
          <UButton :loading="downloadingBackup" label="Download backup" class="self-start" @click="downloadBackup" />
        </div>
      </UCard>

      <UCard v-else-if="activeTab === 'readiness'">
        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-500">
            Runs a live check of app subsystems, QR/join-code resolution, moderator login, and current submission/voting configuration for this event.
          </p>
          <UAlert v-if="readinessError" color="error" variant="subtle" :title="readinessError" />
          <UButton :loading="runningReadinessCheck" label="Run readiness check" class="self-start" @click="runReadinessCheck" />

          <template v-if="readinessData && realtimeStatus && overallReadinessStatus">
            <UAlert
              :color="READINESS_STATUS_COLORS[overallReadinessStatus]"
              variant="subtle"
              :title="`Overall: ${READINESS_STATUS_LABELS[overallReadinessStatus]}`"
            />

            <div class="flex items-center justify-between border-t pt-3">
              <span>Supabase Auth</span>
              <UBadge :color="READINESS_STATUS_COLORS[readinessData.supabaseAuth.status]">
                {{ READINESS_STATUS_LABELS[readinessData.supabaseAuth.status] }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span>Database</span>
              <UBadge :color="READINESS_STATUS_COLORS[readinessData.database.status]">
                {{ READINESS_STATUS_LABELS[readinessData.database.status] }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span>Realtime</span>
              <UBadge :color="READINESS_STATUS_COLORS[realtimeStatus]">
                {{ READINESS_STATUS_LABELS[realtimeStatus] }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span>Storage</span>
              <UBadge :color="READINESS_STATUS_COLORS[readinessData.storage.status]">
                {{ READINESS_STATUS_LABELS[readinessData.storage.status] }}
              </UBadge>
            </div>
            <div class="ml-4 flex flex-col gap-1 text-sm text-gray-500">
              <div class="flex items-center justify-between">
                <span>Branding bucket</span>
                <span>{{ READINESS_STATUS_LABELS[readinessData.storage.buckets.branding] }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>Attachments bucket</span>
                <span>{{ READINESS_STATUS_LABELS[readinessData.storage.buckets.attachments] }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>Reports bucket</span>
                <span>{{ READINESS_STATUS_LABELS[readinessData.storage.buckets.reports] }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between border-t pt-3">
              <span>QR codes & join code</span>
              <UBadge :color="READINESS_STATUS_COLORS[readinessData.qrAndJoinCode.status]">
                {{ READINESS_STATUS_LABELS[readinessData.qrAndJoinCode.status] }}
              </UBadge>
            </div>
            <p v-if="!readinessData.qrAndJoinCode.eventLive" class="text-sm text-gray-500">
              Event is not live - the audience URL, QR codes, and join code will not resolve for attendees until it is.
            </p>
            <div class="flex items-center justify-between border-t pt-3">
              <span>Moderator login</span>
              <UBadge :color="READINESS_STATUS_COLORS[readinessData.moderatorAuth.status]">
                {{ READINESS_STATUS_LABELS[readinessData.moderatorAuth.status] }}
              </UBadge>
            </div>
            <p v-if="!readinessData.moderatorAuth.accessEnabled" class="text-sm text-gray-500">
              Moderator access is turned off for this event.
            </p>
            <p v-else-if="!readinessData.moderatorAuth.passwordSet" class="text-sm text-gray-500">
              Moderator access is on, but no moderator password is set - no one can log in.
            </p>
            <p v-else-if="readinessData.moderatorAuth.lockedOut" class="text-sm text-gray-500">
              Moderator login is temporarily locked from recent failed attempts.
            </p>

            <div class="flex flex-col gap-1 border-t pt-3 text-sm text-gray-500">
              <p>Status: {{ readinessData.configuration.status }}</p>
              <p>Submissions open: {{ readinessData.configuration.submissionsOpen ? 'Yes' : 'No' }}</p>
              <p>Voting open: {{ readinessData.configuration.votingOpen ? 'Yes' : 'No' }}</p>
              <p>Moderator access enabled: {{ readinessData.configuration.moderatorAccessEnabled ? 'Yes' : 'No' }}</p>
            </div>
          </template>
        </div>
      </UCard>

      <UCard v-else-if="activeTab === 'details'">
        <div class="flex flex-col gap-3">
          <UFormField label="Event name" required>
            <UInput v-model="name" />
          </UFormField>
          <UFormField label="Slug" :error="slugError ?? undefined">
            <UInput v-model="slug" />
          </UFormField>
          <UFormField label="Join code" :error="joinCodeError ?? undefined">
            <UInput v-model="joinCode" />
          </UFormField>
          <p class="text-sm text-gray-500">
            Status: {{ status }}
          </p>
          <UAlert v-if="detailsError" color="error" variant="subtle" :title="detailsError" />
          <UButton :loading="savingDetails" label="Save" class="self-start" @click="saveDetails" />
        </div>
      </UCard>

      <UCard v-else-if="activeTab === 'attendee-types'">
        <div class="mb-3 flex gap-2">
          <UInput v-model="newLabel" placeholder="e.g. Student, Staff" @keyup.enter="addAttendeeType" />
          <UButton :loading="addingLabel" label="Add" @click="addAttendeeType" />
        </div>
        <UAlert v-if="attendeeTypesError" color="error" variant="subtle" :title="attendeeTypesError" class="mb-3" />
        <div class="flex flex-col gap-2">
          <div v-for="type in attendeeTypes" :key="type.id" class="flex items-center justify-between">
            <span>{{ type.label }}</span>
            <UButton size="xs" color="error" variant="ghost" label="Remove" @click="removeAttendeeType(type.id)" />
          </div>
          <p v-if="attendeeTypes.length === 0" class="text-sm text-gray-500">
            No attendee types yet.
          </p>
        </div>
      </UCard>

      <UCard v-else-if="activeTab === 'settings'">
        <div class="flex flex-col gap-3">
          <UFormField label="Max question length">
            <UInput v-model.number="questionMaxLength" type="number" />
          </UFormField>
          <UFormField label="Moderation mode">
            <USelect v-model="moderationMode" :items="moderationOptions" value-key="value" />
          </UFormField>
          <div class="flex items-center justify-between">
            <span>Hide vote counts</span>
            <USwitch v-model="hideVoteCounts" />
          </div>
          <div class="flex items-center justify-between">
            <span>Submissions open</span>
            <USwitch v-model="submissionsOpen" />
          </div>
          <div class="flex items-center justify-between">
            <span>Voting open</span>
            <USwitch v-model="votingOpen" />
          </div>
          <div class="flex items-center justify-between">
            <span>Moderator access enabled</span>
            <USwitch v-model="moderatorAccessEnabled" />
          </div>
          <div class="flex items-center justify-between">
            <span>Require attendee name</span>
            <USwitch v-model="requireAttendeeName" />
          </div>
          <div class="flex items-center justify-between">
            <span>Require attendee type</span>
            <USwitch v-model="requireAttendeeType" />
          </div>
          <UFormField label="Duplicate check strictness">
            <USelect v-model="duplicateCheckStrictness" :items="duplicateCheckOptions" value-key="value" />
          </UFormField>
          <UFormField label="Attendee edit window (minutes, 0 = disabled)">
            <UInput v-model.number="attendeeEditWindowMinutes" type="number" />
          </UFormField>
          <UFormField label="Anonymity mode">
            <USelect v-model="anonymityMode" :items="anonymityOptions" value-key="value" />
          </UFormField>
          <div class="flex items-center justify-between">
            <span>Show attendee type publicly</span>
            <USwitch v-model="showAttendeeType" />
          </div>
          <UFormField label="Max attachments per question (0 = disabled)">
            <UInput v-model.number="attachmentMaxCount" type="number" />
          </UFormField>
          <UFormField label="Max attachment size (bytes)">
            <UInput v-model.number="attachmentMaxSizeBytes" type="number" />
          </UFormField>
          <UFormField label="Abuse protection">
            <USelect v-model="abuseProtectionTier" :items="abuseProtectionOptions" value-key="value" />
          </UFormField>
          <UAlert v-if="settingsError" color="error" variant="subtle" :title="settingsError" />
          <UButton :loading="savingSettings" label="Save" class="self-start" @click="saveSettings" />

          <UFormField label="Moderator password" :error="moderatorPasswordError ?? undefined">
            <UInput v-model="moderatorPassword" type="password" placeholder="Leave blank to keep unchanged" />
          </UFormField>
          <UAlert v-if="moderatorPasswordSuccess" color="success" variant="subtle" title="Moderator password updated." />
          <UButton :loading="savingModeratorPassword" label="Set password" class="self-start" @click="saveModeratorPassword" />
        </div>
      </UCard>

      <div v-else-if="activeTab === 'qr-codes'" class="flex flex-col gap-4">
        <QrCodeCard label="Audience" :url="audienceUrl" />
        <QrCodeCard label="Moderator" :url="moderatorUrl" />
      </div>

      <div v-else-if="activeTab === 'signage'">
        <SignageExport :event-name="name" :url="audienceUrl" :join-code="joinCode" :logo-url="logoUrl" />
      </div>

      <UCard v-else>
        <div class="flex flex-col gap-3">
          <UFormField label="Accent color" :error="accentColorError ?? undefined">
            <UInput v-model="accentColor" placeholder="#2563EB" />
          </UFormField>
          <UFormField label="Background color" :error="backgroundColorError ?? undefined">
            <UInput v-model="backgroundColor" placeholder="#FFFFFF" />
          </UFormField>
          <UFormField label="Welcome text">
            <UTextarea v-model="welcomeText" placeholder="Welcome! Ask your question and vote for others." />
          </UFormField>
          <UFormField label="Theme mode">
            <USelect v-model="themeMode" :items="themeModeOptions" value-key="value" />
          </UFormField>
          <UAlert v-if="brandingError" color="error" variant="subtle" :title="brandingError" />
          <UButton :loading="savingBranding" label="Save" class="self-start" @click="saveBranding" />

          <UAlert v-if="logoUploadError" color="error" variant="subtle" :title="logoUploadError" />

          <div class="flex flex-col gap-2 border-t pt-3">
            <span class="font-medium">Logo</span>
            <img v-if="logoUrl" :src="logoUrl" alt="Event logo" class="max-h-24 max-w-xs">
            <p v-else class="text-sm text-gray-500">
              No logo set.
            </p>
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" @change="onLogoFileSelected('logo', $event)">
            <div class="flex gap-2">
              <UButton
                size="sm"
                :loading="uploadingSlot === 'logo'"
                :disabled="!selectedLogoFiles.logo"
                label="Upload"
                @click="uploadBrandingLogo('logo')"
              />
              <UButton
                v-if="logoUrl"
                size="sm"
                color="error"
                variant="ghost"
                :loading="removingSlot === 'logo'"
                label="Remove"
                @click="removeBrandingLogo('logo')"
              />
            </div>
          </div>

          <div class="flex flex-col gap-2 border-t pt-3">
            <span class="font-medium">Sponsor logo</span>
            <img v-if="sponsorLogoUrl" :src="sponsorLogoUrl" alt="Sponsor logo" class="max-h-24 max-w-xs">
            <p v-else class="text-sm text-gray-500">
              No logo set.
            </p>
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" @change="onLogoFileSelected('sponsor_logo', $event)">
            <div class="flex gap-2">
              <UButton
                size="sm"
                :loading="uploadingSlot === 'sponsor_logo'"
                :disabled="!selectedLogoFiles.sponsor_logo"
                label="Upload"
                @click="uploadBrandingLogo('sponsor_logo')"
              />
              <UButton
                v-if="sponsorLogoUrl"
                size="sm"
                color="error"
                variant="ghost"
                :loading="removingSlot === 'sponsor_logo'"
                label="Remove"
                @click="removeBrandingLogo('sponsor_logo')"
              />
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
