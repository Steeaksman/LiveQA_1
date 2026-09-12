<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface AttendeeTypeRow {
  id: string
  label: string
}

interface TemplateOption {
  id: string
  name: string
}

interface TemplateConfig {
  questionMaxLength: number
  moderationMode: 'immediate' | 'queue'
  hideVoteCounts: boolean
  attendeeTypes: string[]
}

const supabase = useSupabase()

const step = ref<'details' | 'attendee-types' | 'settings' | 'review'>('details')
const eventId = ref<string | null>(null)
const eventSlug = ref('')
const eventJoinCode = ref('')

const name = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)
const createErrorField = ref<'name' | null>(null)

const templates = ref<TemplateOption[]>([])
const selectedTemplateId = ref<string | null>(null)
const templateOptions = computed(() => [
  { label: 'Blank', value: null },
  ...templates.value.map(t => ({ label: t.name, value: t.id }))
])

const newLabel = ref('')
const addingLabel = ref(false)
const attendeeTypes = ref<AttendeeTypeRow[]>([])
const attendeeTypesError = ref<string | null>(null)

onMounted(async () => {
  const { data } = await supabase
    .from('event_templates')
    .select('id, name')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  templates.value = data ?? []
})

async function createEvent() {
  createError.value = null
  createErrorField.value = null

  if (!name.value.trim()) {
    createError.value = 'Name is required.'
    createErrorField.value = 'name'
    return
  }

  creating.value = true

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      createError.value = 'Your session expired. Please log in again.'
      return
    }

    let attempt = 0
    while (attempt < 5) {
      attempt++

      const { data, error } = await supabase
        .from('events')
        .insert({
          name: name.value.trim(),
          slug: slugify(name.value),
          join_code: generateJoinCode(),
          created_by: user.id
        })
        .select('id, slug, join_code')
        .single()

      if (!error && data) {
        if (selectedTemplateId.value) {
          const { data: template } = await supabase
            .from('event_templates')
            .select('config')
            .eq('id', selectedTemplateId.value)
            .single()

          const config = template?.config as TemplateConfig | undefined

          const { error: settingsError } = await supabase
            .from('event_settings')
            .insert({
              event_id: data.id,
              question_max_length: config?.questionMaxLength ?? 500,
              moderation_mode: config?.moderationMode ?? 'queue',
              hide_vote_counts: config?.hideVoteCounts ?? false
            })

          if (settingsError) {
            createError.value = 'Something went wrong. Please try again.'
            return
          }

          if (config?.attendeeTypes?.length) {
            const { data: insertedTypes, error: typesError } = await supabase
              .from('attendee_types')
              .insert(config.attendeeTypes.map(label => ({ event_id: data.id, label })))
              .select('id, label')

            if (typesError) {
              createError.value = 'Something went wrong. Please try again.'
              return
            }

            attendeeTypes.value = insertedTypes ?? []
          }
        } else {
          const { error: settingsError } = await supabase
            .from('event_settings')
            .insert({ event_id: data.id })

          if (settingsError) {
            createError.value = 'Something went wrong. Please try again.'
            return
          }
        }

        eventId.value = data.id
        eventSlug.value = data.slug
        eventJoinCode.value = data.join_code
        step.value = 'attendee-types'
        return
      }

      if (error?.code !== '23505') {
        createError.value = 'Something went wrong. Please try again.'
        return
      }
      // 23505 = unique violation (slug or join code collision) - retry with fresh values.
    }

    createError.value = 'Something went wrong. Please try again.'
  } finally {
    creating.value = false
  }
}

async function addAttendeeType() {
  if (!newLabel.value.trim() || !eventId.value) return
  addingLabel.value = true
  attendeeTypesError.value = null

  const { data, error } = await supabase
    .from('attendee_types')
    .insert({ event_id: eventId.value, label: newLabel.value.trim() })
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
const settingsErrorField = ref<'questionMaxLength' | null>(null)
const savingSettings = ref(false)

async function goToSettings() {
  if (eventId.value) {
    const [settingsResult, eventResult] = await Promise.all([
      supabase
        .from('event_settings')
        .select('question_max_length, moderation_mode, hide_vote_counts')
        .eq('event_id', eventId.value)
        .single(),
      supabase
        .from('events')
        .select('submissions_open, voting_open')
        .eq('id', eventId.value)
        .single()
    ])

    if (settingsResult.data) {
      questionMaxLength.value = settingsResult.data.question_max_length
      moderationMode.value = settingsResult.data.moderation_mode
      hideVoteCounts.value = settingsResult.data.hide_vote_counts
    }
    if (eventResult.data) {
      submissionsOpen.value = eventResult.data.submissions_open
      votingOpen.value = eventResult.data.voting_open
    }
  }

  step.value = 'settings'
}

async function finish() {
  settingsError.value = null
  settingsErrorField.value = null

  if (!Number.isInteger(questionMaxLength.value) || questionMaxLength.value <= 0) {
    settingsError.value = 'Max question length must be a positive whole number.'
    settingsErrorField.value = 'questionMaxLength'
    return
  }

  if (!eventId.value) return
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
        .eq('event_id', eventId.value)
        .select('event_id'),
      supabase
        .from('events')
        .update({
          submissions_open: submissionsOpen.value,
          voting_open: votingOpen.value
        })
        .eq('id', eventId.value)
        .select('id')
    ])

    if (settingsResult.error || eventResult.error || !settingsResult.data?.length || !eventResult.data?.length) {
      settingsError.value = 'Something went wrong. Please try again.'
      return
    }

    step.value = 'review'
  } finally {
    savingSettings.value = false
  }
}

const moderationModeLabel = computed(() =>
  moderationOptions.find(o => o.value === moderationMode.value)?.label ?? moderationMode.value
)

const publishError = ref<string | null>(null)
const publishing = ref(false)

async function saveAsDraft() {
  await navigateTo('/admin/events')
}

async function publish() {
  if (!eventId.value) return
  publishError.value = null
  publishing.value = true

  try {
    const { error, data } = await supabase
      .from('events')
      .update({ status: 'live' })
      .eq('id', eventId.value)
      .select('id')

    if (error || !data?.length) {
      publishError.value = 'Something went wrong. Please try again.'
      return
    }

    await navigateTo('/admin/events')
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Create event
    </h1>

    <UCard v-if="step === 'details'">
      <UForm :state="{}" class="flex flex-col gap-3" @submit="createEvent">
        <UFormField label="Event name" required :error="createErrorField === 'name' ? createError ?? undefined : undefined">
          <UInput v-model="name" />
        </UFormField>
        <UFormField label="Start from template">
          <USelect v-model="selectedTemplateId" :items="templateOptions" value-key="value" />
        </UFormField>
        <UAlert v-if="createError && !createErrorField" color="error" variant="subtle" :title="createError" />
        <UButton type="submit" :loading="creating" label="Create" class="self-start" />
      </UForm>
    </UCard>

    <UCard v-else-if="step === 'attendee-types'">
      <h2 class="mb-3 font-medium">
        Attendee types
      </h2>
      <UFormField label="New attendee type" class="mb-3" :error="attendeeTypesError ?? undefined">
        <div class="flex gap-2">
          <UInput v-model="newLabel" placeholder="e.g. Student, Staff" @keyup.enter="addAttendeeType" />
          <UButton :loading="addingLabel" label="Add" @click="addAttendeeType" />
        </div>
      </UFormField>
      <div class="mb-4 flex flex-col gap-2">
        <div v-for="type in attendeeTypes" :key="type.id" class="flex items-center justify-between">
          <span>{{ type.label }}</span>
          <UButton size="xs" color="error" variant="ghost" label="Remove" :aria-label="`Remove attendee type: ${type.label}`" @click="removeAttendeeType(type.id)" />
        </div>
        <p v-if="attendeeTypes.length === 0" class="text-sm text-gray-500">
          No attendee types added - optional.
        </p>
      </div>
      <UButton label="Next" @click="goToSettings" />
    </UCard>

    <UCard v-else-if="step === 'settings'">
      <h2 class="mb-3 font-medium">
        Q&amp;A &amp; moderation settings
      </h2>
      <div class="flex flex-col gap-3">
        <UFormField label="Max question length" :error="settingsErrorField === 'questionMaxLength' ? settingsError ?? undefined : undefined">
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
        <UAlert v-if="settingsError && !settingsErrorField" color="error" variant="subtle" :title="settingsError" />
        <UButton :loading="savingSettings" label="Next" class="self-start" @click="finish" />
      </div>
    </UCard>

    <UCard v-else>
      <h2 class="mb-3 font-medium">
        Review &amp; publish
      </h2>
      <dl class="mb-4 flex flex-col gap-2 text-sm">
        <div class="flex justify-between"><dt>Name</dt><dd>{{ name }}</dd></div>
        <div class="flex justify-between"><dt>Slug</dt><dd>{{ eventSlug }}</dd></div>
        <div class="flex justify-between"><dt>Join code</dt><dd>{{ eventJoinCode }}</dd></div>
        <div class="flex justify-between">
          <dt>Attendee types</dt>
          <dd>{{ attendeeTypes.length ? attendeeTypes.map(t => t.label).join(', ') : 'None' }}</dd>
        </div>
        <div class="flex justify-between"><dt>Max question length</dt><dd>{{ questionMaxLength }}</dd></div>
        <div class="flex justify-between"><dt>Moderation mode</dt><dd>{{ moderationModeLabel }}</dd></div>
        <div class="flex justify-between"><dt>Hide vote counts</dt><dd>{{ hideVoteCounts ? 'Yes' : 'No' }}</dd></div>
        <div class="flex justify-between"><dt>Submissions open</dt><dd>{{ submissionsOpen ? 'Yes' : 'No' }}</dd></div>
        <div class="flex justify-between"><dt>Voting open</dt><dd>{{ votingOpen ? 'Yes' : 'No' }}</dd></div>
      </dl>
      <UAlert v-if="publishError" color="error" variant="subtle" :title="publishError" class="mb-3" />
      <div class="flex gap-2">
        <UButton color="neutral" variant="subtle" label="Save as draft" @click="saveAsDraft" />
        <UButton :loading="publishing" label="Publish" @click="publish" />
      </div>
    </UCard>
  </div>
</template>
