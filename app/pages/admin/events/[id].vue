<script setup lang="ts">
import type { AuthenticatedProfile } from '~/composables/useAuthSession'

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
const activeTab = ref<'details' | 'attendee-types' | 'settings' | 'qr-codes' | 'signage' | 'branding'>('details')

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

      <UCard v-if="activeTab === 'details'">
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
