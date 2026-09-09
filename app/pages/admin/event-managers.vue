<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface EventManagerRow {
  id: string
  email: string
  em_scope: 'global' | 'restricted'
  deleted_at: string | null
  assignments: { id: string, event_id: string, event_name: string }[]
}

const supabase = useSupabase()
const eventManagers = ref<EventManagerRow[]>([])
const events = ref<{ id: string, name: string }[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const scopeOptions = [
  { label: 'Global (all events)', value: 'global' },
  { label: 'Restricted (specific events)', value: 'restricted' }
]
const createEmail = ref('')
const createPassword = ref('')
const createScope = ref<'global' | 'restricted'>('global')
const createEventIds = ref<string[]>([])
const creating = ref(false)
const createError = ref<string | null>(null)

async function loadData() {
  loading.value = true
  errorMessage.value = null

  const [profilesResult, eventsResult, assignmentsResult] = await Promise.all([
    supabase.from('profiles').select('id, email, em_scope, deleted_at').eq('role', 'event_manager').order('email'),
    supabase.from('events').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('event_manager_assignments').select('id, event_manager_id, event_id, events(name)').is('deleted_at', null)
  ])

  if (profilesResult.error || eventsResult.error || assignmentsResult.error) {
    errorMessage.value = 'Could not load Event Managers.'
    loading.value = false
    return
  }

  events.value = eventsResult.data ?? []

  eventManagers.value = (profilesResult.data ?? []).map(profile => ({
    id: profile.id,
    email: profile.email ?? '(no email on record)',
    em_scope: profile.em_scope,
    deleted_at: profile.deleted_at,
    assignments: (assignmentsResult.data ?? [])
      .filter(a => a.event_manager_id === profile.id)
      .map(a => ({ id: a.id, event_id: a.event_id, event_name: (a.events as unknown as { name: string })?.name ?? 'Unknown event' }))
  }))

  loading.value = false
}

onMounted(loadData)

async function createEventManager() {
  createError.value = null

  if (!createEmail.value || !createPassword.value) {
    createError.value = 'Email and password are required.'
    return
  }

  creating.value = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      createError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<{ success: boolean, data: unknown, error: string | null }>('/api/admin/event-managers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        email: createEmail.value,
        password: createPassword.value,
        scope: createScope.value,
        eventIds: createScope.value === 'restricted' ? createEventIds.value : undefined
      }
    })

    if (!response.success) {
      createError.value = response.error ?? 'Could not create the Event Manager.'
      return
    }

    createEmail.value = ''
    createPassword.value = ''
    createScope.value = 'global'
    createEventIds.value = []
    await loadData()
  } catch {
    createError.value = 'Something went wrong. Please try again.'
  } finally {
    creating.value = false
  }
}

async function setScope(row: EventManagerRow, scope: 'global' | 'restricted') {
  await supabase.from('profiles').update({ em_scope: scope }).eq('id', row.id)
  await loadData()
}

async function toggleRevoked(row: EventManagerRow) {
  const deleted_at = row.deleted_at ? null : new Date().toISOString()
  await supabase.from('profiles').update({ deleted_at }).eq('id', row.id)
  await loadData()
}

async function addAssignment(row: EventManagerRow, eventId: string) {
  if (!eventId) return
  await supabase.from('event_manager_assignments').insert({
    event_manager_id: row.id,
    event_id: eventId,
    granted_by: (await supabase.auth.getUser()).data.user?.id
  })
  await loadData()
}

async function removeAssignment(assignmentId: string) {
  await supabase.from('event_manager_assignments').update({ deleted_at: new Date().toISOString() }).eq('id', assignmentId)
  await loadData()
}
</script>

<template>
  <div class="mx-auto max-w-3xl p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Event Managers
    </h1>

    <UCard class="mb-6">
      <h2 class="mb-3 font-medium">
        Create Event Manager
      </h2>
      <UForm :state="{}" class="flex flex-col gap-3" @submit="createEventManager">
        <UFormField label="Email" required>
          <UInput v-model="createEmail" type="email" />
        </UFormField>
        <UFormField label="Password" required>
          <UInput v-model="createPassword" type="password" />
        </UFormField>
        <UFormField label="Access">
          <USelect v-model="createScope" :items="scopeOptions" value-key="value" />
        </UFormField>
        <UFormField v-if="createScope === 'restricted'" label="Assign events">
          <USelectMenu
            v-model="createEventIds"
            :items="events"
            value-key="id"
            option-attribute="name"
            multiple
            placeholder="Optional - can be added later"
          />
        </UFormField>
        <UAlert v-if="createError" color="error" variant="subtle" :title="createError" />
        <UButton type="submit" :loading="creating" label="Create" class="self-start" />
      </UForm>
    </UCard>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" class="mb-4" />

    <div v-if="loading">
      Loading...
    </div>
    <div v-else class="flex flex-col gap-4">
      <UCard v-for="row in eventManagers" :key="row.id">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">
              {{ row.email }}
              <UBadge v-if="row.deleted_at" color="error" variant="subtle">Revoked</UBadge>
            </p>
            <p class="text-sm text-gray-500">
              {{ row.em_scope === 'global' ? 'Global access' : 'Restricted access' }}
            </p>
          </div>
          <div class="flex gap-2">
            <USelect
              :model-value="row.em_scope"
              :items="scopeOptions"
              value-key="value"
              @update:model-value="(v) => setScope(row, v as 'global' | 'restricted')"
            />
            <UButton :color="row.deleted_at ? 'primary' : 'error'" variant="subtle" @click="toggleRevoked(row)">
              {{ row.deleted_at ? 'Restore' : 'Revoke' }}
            </UButton>
          </div>
        </div>

        <div v-if="row.em_scope === 'restricted'" class="mt-3 flex flex-col gap-2">
          <div v-for="assignment in row.assignments" :key="assignment.id" class="flex items-center justify-between text-sm">
            <span>{{ assignment.event_name }}</span>
            <UButton size="xs" color="error" variant="ghost" @click="removeAssignment(assignment.id)">
              Remove
            </UButton>
          </div>
          <USelectMenu
            :items="events.filter(e => !row.assignments.some(a => a.event_id === e.id))"
            value-key="id"
            option-attribute="name"
            placeholder="Add an event"
            @update:model-value="(v) => addAssignment(row, v as string)"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>
