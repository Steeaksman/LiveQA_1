<script setup lang="ts">
interface AttendeeTypeOption {
  id: string
  label: string
}

interface EventContext {
  id: string
  name: string
  welcomeText: string | null
  accentColor: string | null
  backgroundColor: string | null
  themeMode: 'light' | 'dark' | 'system'
  requireAttendeeName: boolean
  requireAttendeeType: boolean
  attendeeTypes: AttendeeTypeOption[]
}

interface EventContextResponse {
  success: boolean
  data: EventContext | null
  error: string | null
}

interface JoinResponse {
  success: boolean
  data: { attendeeId: string } | null
  error: string | null
}

const route = useRoute()
const slug = route.params.slug as string

const { data: response } = await useFetch<EventContextResponse>(`/api/events/${slug}`)

const context = computed(() => response.value?.data ?? null)
const notFound = computed(() => !response.value?.success)

const joined = ref(false)
const displayName = ref('')
const attendeeTypeId = ref<string | null>(null)
const joining = ref(false)
const joinError = ref<string | null>(null)

onMounted(() => {
  if (context.value) {
    joined.value = getDeviceIdentity(context.value.id).joined
  }
})

async function join() {
  if (!context.value) return
  joinError.value = null

  if (context.value.requireAttendeeName && !displayName.value.trim()) {
    joinError.value = 'Please enter your name.'
    return
  }

  if (context.value.requireAttendeeType && context.value.attendeeTypes.length > 0 && !attendeeTypeId.value) {
    joinError.value = 'Please choose your attendee type.'
    return
  }

  joining.value = true

  try {
    const identity = getDeviceIdentity(context.value.id)

    const result = await $fetch<JoinResponse>('/api/attendees/join', {
      method: 'POST',
      body: {
        eventId: context.value.id,
        token: identity.token,
        displayName: displayName.value.trim() || undefined,
        attendeeTypeId: attendeeTypeId.value ?? undefined
      }
    })

    if (!result.success) {
      joinError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    markDeviceJoined(context.value.id)
    joined.value = true
  } catch (err) {
    const data = (err as { data?: JoinResponse })?.data
    joinError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <p v-if="notFound">
      Event not found.
    </p>

    <div v-else-if="context">
      <h1 class="mb-4 text-xl font-semibold">
        {{ context.name }}
      </h1>

      <UCard v-if="joined">
        <p>You're in! Check back soon.</p>
      </UCard>

      <UCard v-else>
        <div class="flex flex-col gap-3">
          <p v-if="context.welcomeText">
            {{ context.welcomeText }}
          </p>
          <UFormField label="Your name" :required="context.requireAttendeeName">
            <UInput v-model="displayName" />
          </UFormField>
          <UFormField
            v-if="context.attendeeTypes.length > 0"
            label="Attendee type"
            :required="context.requireAttendeeType"
          >
            <USelect
              v-model="attendeeTypeId"
              :items="context.attendeeTypes.map(t => ({ label: t.label, value: t.id }))"
              value-key="value"
            />
          </UFormField>
          <UAlert v-if="joinError" color="error" variant="subtle" :title="joinError" />
          <UButton :loading="joining" label="Join" class="self-start" @click="join" />
        </div>
      </UCard>
    </div>
  </div>
</template>
