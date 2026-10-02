<script setup lang="ts">
const supabase = useSupabase()
const errorMessage = ref<string | null>(null)
const loading = ref(false)
const showPassword = ref(false)

const state = reactive({
  email: '',
  password: ''
})

onMounted(async () => {
  const profile = await getAuthenticatedProfile(supabase)
  if (profile) await navigateTo('/admin')
})

async function onSubmit() {
  errorMessage.value = null
  loading.value = true

  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: state.email,
      password: state.password
    })

    if (signInError) {
      errorMessage.value = 'Invalid email or password.'
      return
    }

    const profile = await getAuthenticatedProfile(supabase)
    if (!profile) {
      errorMessage.value = 'Invalid email or password.'
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
        Sign in to your LiveQA Admin
      </h1>

      <UCard class="w-full max-w-xl" :ui="{ body: 'p-8' }">
        <UForm :state="state" class="flex flex-col gap-5" @submit="onSubmit">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Email" name="email" required :ui="{ label: 'font-semibold text-primary' }">
              <UInput v-model="state.email" type="email" class="w-full" autocomplete="email" />
            </UFormField>

            <UFormField label="Password" name="password" required :ui="{ label: 'font-semibold text-primary' }">
              <UInput
                v-model="state.password"
                :type="showPassword ? 'text' : 'password'"
                class="w-full"
                autocomplete="current-password"
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
              <div class="mt-2 text-right">
                <NuxtLink to="/admin/forgot-password" class="text-sm underline">
                  Forgot password?
                </NuxtLink>
              </div>
            </UFormField>
          </div>

          <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

          <UButton
            type="submit"
            variant="outline"
            block
            size="lg"
            :loading="loading"
            label="SIGN IN"
            class="font-semibold tracking-wide"
          />
        </UForm>
      </UCard>
    </div>
  </div>
</template>

<style scoped>
.login-hero {
  background: linear-gradient(135deg, #7c3aed 0%, #ec4899 30%, #f97316 55%, #3b82f6 80%, #84cc16 100%);
}
</style>
