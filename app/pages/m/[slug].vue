<script setup lang="ts">
interface EventContext {
  id: string
  name: string
}

interface EventContextResponse {
  success: boolean
  data: EventContext | null
  error: string | null
}

interface ModeratorLoginResponse {
  success: boolean
  data: { sessionToken: string, expiresAt: string } | null
  error: string | null
}

interface ModeratorSessionResponse {
  success: boolean
  data: { valid: boolean } | null
  error: string | null
}

const route = useRoute()
const slug = route.params.slug as string

const { data: response } = await useFetch<EventContextResponse>(`/api/events/${slug}`)

const context = computed(() => response.value?.data ?? null)
const notFound = computed(() => !response.value?.success)

const checkingSession = ref(true)
const authenticated = ref(false)
const password = ref('')
const loggingIn = ref(false)
const loginError = ref<string | null>(null)

onMounted(async () => {
  if (!context.value) {
    checkingSession.value = false
    return
  }

  const stored = getStoredModeratorSession(context.value.id)

  if (stored) {
    try {
      const result = await $fetch<ModeratorSessionResponse>(`/api/events/${slug}/moderator-session`, {
        query: { token: stored.sessionToken }
      })

      if (result.data?.valid) {
        authenticated.value = true
      } else {
        clearStoredModeratorSession(context.value.id)
      }
    } catch {
      clearStoredModeratorSession(context.value.id)
    }
  }

  checkingSession.value = false
})

async function login() {
  if (!context.value) return
  loginError.value = null
  loggingIn.value = true

  try {
    const result = await $fetch<ModeratorLoginResponse>(`/api/events/${slug}/moderator-login`, {
      method: 'POST',
      body: { password: password.value }
    })

    if (!result.success || !result.data) {
      loginError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    setStoredModeratorSession(context.value.id, {
      sessionToken: result.data.sessionToken,
      expiresAt: result.data.expiresAt
    })
    authenticated.value = true
  } catch (err) {
    const data = (err as { data?: ModeratorLoginResponse })?.data
    loginError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    loggingIn.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm p-6">
    <div v-if="notFound">
      <p>Event not found.</p>
    </div>

    <div v-else-if="checkingSession" />

    <div v-else-if="authenticated">
      <h1 class="mb-2 text-xl font-semibold">
        {{ context?.name }}
      </h1>
      <p>You're in. The moderator queue is coming soon.</p>
    </div>

    <div v-else>
      <h1 class="mb-4 text-xl font-semibold">
        {{ context?.name }}
      </h1>
      <UForm :state="{}" class="flex flex-col gap-3" @submit="login">
        <UFormField label="Moderator password" required>
          <UInput v-model="password" type="password" @keyup.enter="login" />
        </UFormField>
        <UAlert v-if="loginError" color="error" variant="subtle" :title="loginError" />
        <UButton type="submit" :loading="loggingIn" label="Enter" class="self-start" />
      </UForm>
    </div>
  </div>
</template>
