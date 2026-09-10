<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

const supabase = useSupabase()

const name = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

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

async function createTemplate() {
  createError.value = null

  if (!name.value.trim()) {
    createError.value = 'Name is required.'
    return
  }

  if (!Number.isInteger(questionMaxLength.value) || questionMaxLength.value <= 0) {
    createError.value = 'Max question length must be a positive whole number.'
    return
  }

  creating.value = true

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      createError.value = 'Your session expired. Please log in again.'
      return
    }

    const { error } = await supabase
      .from('event_templates')
      .insert({
        name: name.value.trim(),
        created_by: user.id,
        config: {
          questionMaxLength: questionMaxLength.value,
          moderationMode: moderationMode.value,
          hideVoteCounts: hideVoteCounts.value,
          attendeeTypes: attendeeTypeLabels.value
        }
      })

    if (error) {
      createError.value = 'Something went wrong. Please try again.'
      return
    }

    await navigateTo('/admin/templates')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Create template
    </h1>

    <UCard>
      <div class="flex flex-col gap-3">
        <UFormField label="Template name" required>
          <UInput v-model="name" />
        </UFormField>
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

        <h2 class="mt-2 font-medium">
          Attendee types
        </h2>
        <div class="flex gap-2">
          <UInput v-model="newLabel" placeholder="e.g. Student, Staff" @keyup.enter="addAttendeeTypeLabel" />
          <UButton label="Add" @click="addAttendeeTypeLabel" />
        </div>
        <UAlert v-if="attendeeTypesError" color="error" variant="subtle" :title="attendeeTypesError" />
        <div class="flex flex-col gap-2">
          <div v-for="label in attendeeTypeLabels" :key="label" class="flex items-center justify-between">
            <span>{{ label }}</span>
            <UButton size="xs" color="error" variant="ghost" label="Remove" @click="removeAttendeeTypeLabel(label)" />
          </div>
          <p v-if="attendeeTypeLabels.length === 0" class="text-sm text-gray-500">
            No attendee types added - optional.
          </p>
        </div>

        <UAlert v-if="createError" color="error" variant="subtle" :title="createError" />
        <UButton :loading="creating" label="Create" class="self-start" @click="createTemplate" />
      </div>
    </UCard>
  </div>
</template>
