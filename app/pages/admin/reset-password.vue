<script setup lang="ts">
const supabase = useSupabase()
const checking = ref(true)
const hasRecoverySession = ref(false)
const errorMessage = ref<string | null>(null)
const loading = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)

const state = reactive({
  password: '',
  confirmPassword: ''
})

let unsubscribe: (() => void) | undefined

onMounted(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) hasRecoverySession.value = true
    checking.value = false
  })
  unsubscribe = () => subscription.unsubscribe()

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) hasRecoverySession.value = true
    checking.value = false
  })
})

onUnmounted(() => unsubscribe?.())

async function onSubmit() {
  errorMessage.value = null

  if (state.password !== state.confirmPassword) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  loading.value = true

  try {
    const { error } = await supabase.auth.updateUser({ password: state.password })

    if (error) {
      errorMessage.value = error.message
      return
    }

    const profile = await getAuthenticatedProfile(supabase)
    if (!profile) {
      errorMessage.value = 'Something went wrong. Please try again.'
      return
    }

    await navigateTo('/admin')
  } catch {
    errorMessage.value = 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="bg-gray-900 px-6 py-4">
      <div class="mx-auto max-w-5xl">
        <span class="text-lg font-semibold text-white">LiveQA Admin</span>
      </div>
    </header>

    <div class="login-hero flex flex-1 flex-col items-center justify-center px-4 py-16">
      <h1 class="mb-8 text-center text-2xl font-bold text-white sm:text-3xl">
        Set a new LiveQA Admin password
      </h1>

      <UCard class="w-full max-w-xl" :ui="{ body: 'p-8' }">
        <UForm v-if="!checking && hasRecoverySession" :state="state" class="flex flex-col gap-5" @submit="onSubmit">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="New password" name="password" required :ui="{ label: 'font-semibold text-primary' }">
              <UInput
                v-model="state.password"
                :type="showPassword ? 'text' : 'password'"
                class="w-full"
                autocomplete="new-password"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    :aria-pressed="showPassword"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </UInput>
            </UFormField>

            <UFormField label="Confirm new password" name="confirmPassword" required :ui="{ label: 'font-semibold text-primary' }">
              <UInput
                v-model="state.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                class="w-full"
                autocomplete="new-password"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="showConfirmPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'"
                    :aria-pressed="showConfirmPassword"
                    @click="showConfirmPassword = !showConfirmPassword"
                  />
                </template>
              </UInput>
            </UFormField>
          </div>

          <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

          <UButton
            type="submit"
            variant="outline"
            block
            size="lg"
            :loading="loading"
            label="RESET PASSWORD"
            class="font-semibold tracking-wide"
          />
        </UForm>

        <div v-else-if="!checking" class="flex flex-col items-center gap-2 text-center">
          <h2 class="text-lg font-semibold">
            This link is invalid or expired
          </h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Request a new password reset link and try again.
          </p>
          <NuxtLink to="/admin/forgot-password" class="mt-2 text-sm underline">
            Request a new link
          </NuxtLink>
        </div>
      </UCard>
    </div>
  </div>
</template>

<style scoped>
.login-hero {
  background: linear-gradient(135deg, #7c3aed 0%, #ec4899 30%, #f97316 55%, #3b82f6 80%, #84cc16 100%);
}
</style>
