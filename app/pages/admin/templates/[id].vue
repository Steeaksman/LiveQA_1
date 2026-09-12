<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface TemplateConfig {
  questionMaxLength: number
  moderationMode: 'immediate' | 'queue'
  hideVoteCounts: boolean
  attendeeTypes: string[]
}

const route = useRoute()
const templateId = route.params.id as string
const supabase = useSupabase()

const loading = ref(true)
const notFound = ref(false)

const name = ref('')
const saveError = ref<string | null>(null)
const saveErrorField = ref<'name' | 'questionMaxLength' | null>(null)
const saving = ref(false)

const moderationOptions = [
  { label: 'Immediate publish', value: 'immediate' },
  { label: 'Approval queue', value: 'queue' }
]
const questionMaxLength = ref(500)
const moderationMode = ref<'immediate' | 'queue'>('queue')
const hideVoteCounts = ref(false)

const newLabel = ref('')
const attendeeTypeLabels = ref<string[]>([])
const attendeeTypesError = ref<string | null>(null)

onMounted(async () => {
  const { data: template } = await supabase
    .from('event_templates')
    .select('id, name, config')
    .eq('id', templateId)
    .maybeSingle()

  if (!template) {
    notFound.value = true
    loading.value = false
    return
  }

  name.value = template.name
  const config = template.config as TemplateConfig
  questionMaxLength.value = config.questionMaxLength
  moderationMode.value = config.moderationMode
  hideVoteCounts.value = config.hideVoteCounts
  attendeeTypeLabels.value = config.attendeeTypes ?? []

  loading.value = false
})

function addAttendeeTypeLabel() {
  const label = newLabel.value.trim()
  attendeeTypesError.value = null

  if (!label) return

  if (attendeeTypeLabels.value.includes(label)) {
    attendeeTypesError.value = 'That attendee type is already in the list.'
    return
  }

  attendeeTypeLabels.value.push(label)
  newLabel.value = ''
}

function removeAttendeeTypeLabel(label: string) {
  attendeeTypeLabels.value = attendeeTypeLabels.value.filter(l => l !== label)
}

async function saveTemplate() {
  saveError.value = null
  saveErrorField.value = null

  if (!name.value.trim()) {
    saveError.value = 'Name is required.'
    saveErrorField.value = 'name'
    return
  }

  if (!Number.isInteger(questionMaxLength.value) || questionMaxLength.value <= 0) {
    saveError.value = 'Max question length must be a positive whole number.'
    saveErrorField.value = 'questionMaxLength'
    return
  }

  saving.value = true

  try {
    const { error, data } = await supabase
      .from('event_templates')
      .update({
        name: name.value.trim(),
        config: {
          questionMaxLength: questionMaxLength.value,
          moderationMode: moderationMode.value,
          hideVoteCounts: hideVoteCounts.value,
          attendeeTypes: attendeeTypeLabels.value
        }
      })
      .eq('id', templateId)
      .select('id')

    if (error || !data?.length) {
      saveError.value = 'Something went wrong. Please try again.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <div v-if="loading">
      Loading...
    </div>
    <p v-else-if="notFound">
      Template not found.
    </p>
    <div v-else>
      <h1 class="mb-4 text-xl font-semibold">
        {{ name }}
      </h1>

      <UCard>
        <div class="flex flex-col gap-3">
          <UFormField label="Template name" required :error="saveErrorField === 'name' ? saveError ?? undefined : undefined">
            <UInput v-model="name" />
          </UFormField>
          <UFormField label="Max question length" :error="saveErrorField === 'questionMaxLength' ? saveError ?? undefined : undefined">
            <UInput v-model.number="questionMaxLength" type="number" />
          </UFormField>
          <UFormField label="Moderation mode">
            <USelect v-model="moderationMode" :items="moderationOptions" value-key="value" />
          </UFormField>
          <div class="flex items-center justify-between">
            <span>Hide vote counts</span>
            <USwitch v-model="hideVoteCounts" />
          </div>

          <h2 class="mt-2 font-medium">
            Attendee types
          </h2>
          <UFormField label="New attendee type" :error="attendeeTypesError ?? undefined">
            <div class="flex gap-2">
              <UInput v-model="newLabel" placeholder="e.g. Student, Staff" @keyup.enter="addAttendeeTypeLabel" />
              <UButton label="Add" @click="addAttendeeTypeLabel" />
            </div>
          </UFormField>
          <div class="flex flex-col gap-2">
            <div v-for="label in attendeeTypeLabels" :key="label" class="flex items-center justify-between">
              <span>{{ label }}</span>
              <UButton size="xs" color="error" variant="ghost" label="Remove" :aria-label="`Remove attendee type: ${label}`" @click="removeAttendeeTypeLabel(label)" />
            </div>
            <p v-if="attendeeTypeLabels.length === 0" class="text-sm text-gray-500">
              No attendee types added - optional.
            </p>
          </div>

          <UAlert v-if="saveError && !saveErrorField" color="error" variant="subtle" :title="saveError" />
          <UButton :loading="saving" label="Save" class="self-start" @click="saveTemplate" />
        </div>
      </UCard>
    </div>
  </div>
</template>
