<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface AttendeeTypeRow {
  id: string
  label: string
}

const supabase = useSupabase()

const step = ref<'details' | 'attendee-types'>('details')
const eventId = ref<string | null>(null)

const name = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

const newLabel = ref('')
const addingLabel = ref(false)
const attendeeTypes = ref<AttendeeTypeRow[]>([])
const attendeeTypesError = ref<string | null>(null)

async function createEvent() {
  createError.value = null

  if (!name.value.trim()) {
    createError.value = 'Name is required.'
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
        .select('id')
        .single()

      if (!error && data) {
        const { error: settingsError } = await supabase
          .from('event_settings')
          .insert({ event_id: data.id })

        if (settingsError) {
          createError.value = 'Something went wrong. Please try again.'
          return
        }

        eventId.value = data.id
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

async function finish() {
  await navigateTo('/admin/events')
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Create event
    </h1>

    <UCard v-if="step === 'details'">
      <UForm :state="{}" class="flex flex-col gap-3" @submit="createEvent">
        <UFormField label="Event name" required>
          <UInput v-model="name" />
        </UFormField>
        <UAlert v-if="createError" color="error" variant="subtle" :title="createError" />
        <UButton type="submit" :loading="creating" label="Create" class="self-start" />
      </UForm>
    </UCard>

    <UCard v-else>
      <h2 class="mb-3 font-medium">
        Attendee types
      </h2>
      <div class="mb-3 flex gap-2">
        <UInput v-model="newLabel" placeholder="e.g. Student, Staff" @keyup.enter="addAttendeeType" />
        <UButton :loading="addingLabel" label="Add" @click="addAttendeeType" />
      </div>
      <UAlert v-if="attendeeTypesError" color="error" variant="subtle" :title="attendeeTypesError" class="mb-3" />
      <div class="mb-4 flex flex-col gap-2">
        <div v-for="type in attendeeTypes" :key="type.id" class="flex items-center justify-between">
          <span>{{ type.label }}</span>
          <UButton size="xs" color="error" variant="ghost" label="Remove" @click="removeAttendeeType(type.id)" />
        </div>
        <p v-if="attendeeTypes.length === 0" class="text-sm text-gray-500">
          No attendee types added - optional.
        </p>
      </div>
      <UButton label="Done" @click="finish" />
    </UCard>
  </div>
</template>
