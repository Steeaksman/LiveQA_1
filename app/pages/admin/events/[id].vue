<script setup lang="ts">
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
const activeTab = ref<'details' | 'attendee-types' | 'settings'>('details')

const name = ref('')
const slug = ref('')
const joinCode = ref('')
const status = ref('')
const detailsError = ref<string | null>(null)
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
const settingsError = ref<string | null>(null)
const savingSettings = ref(false)

onMounted(async () => {
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
      .select('question_max_length, moderation_mode, hide_vote_counts')
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
  }
  submissionsOpen.value = false
  votingOpen.value = false
  const { data: eventOpenState } = await supabase
    .from('events')
    .select('submissions_open, voting_open')
    .eq('id', eventId)
    .single()
  if (eventOpenState) {
    submissionsOpen.value = eventOpenState.submissions_open
    votingOpen.value = eventOpenState.voting_open
  }

  attendeeTypes.value = attendeeTypesResult.data ?? []
  loading.value = false
})

async function saveDetails() {
  detailsError.value = null

  if (!name.value.trim()) {
    detailsError.value = 'Name is required.'
    return
  }

  savingDetails.value = true

  try {
    const { error, data } = await supabase
      .from('events')
      .update({ name: name.value.trim() })
      .eq('id', eventId)
      .select('id')

    if (error || !data?.length) {
      detailsError.value = 'Something went wrong. Please try again.'
    }
  } finally {
    savingDetails.value = false
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

  savingSettings.value = true

  try {
    const [settingsResult, eventResult] = await Promise.all([
      supabase
        .from('event_settings')
        .update({
          question_max_length: questionMaxLength.value,
          moderation_mode: moderationMode.value,
          hide_vote_counts: hideVoteCounts.value
        })
        .eq('event_id', eventId)
        .select('event_id'),
      supabase
        .from('events')
        .update({
          submissions_open: submissionsOpen.value,
          voting_open: votingOpen.value
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
      <h1 class="mb-4 text-xl font-semibold">
        {{ name }}
      </h1>

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
      </div>

      <UCard v-if="activeTab === 'details'">
        <div class="flex flex-col gap-3">
          <UFormField label="Event name" required>
            <UInput v-model="name" />
          </UFormField>
          <p class="text-sm text-gray-500">
            Slug: {{ slug }}
          </p>
          <p class="text-sm text-gray-500">
            Join code: {{ joinCode }}
          </p>
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

      <UCard v-else>
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
          <UAlert v-if="settingsError" color="error" variant="subtle" :title="settingsError" />
          <UButton :loading="savingSettings" label="Save" class="self-start" @click="saveSettings" />
        </div>
      </UCard>
    </div>
  </div>
</template>
