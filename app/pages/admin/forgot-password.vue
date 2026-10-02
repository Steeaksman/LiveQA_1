<script setup lang="ts">
const supabase = useSupabase()
const errorMessage = ref<string | null>(null)
const submitted = ref(false)
const loading = ref(false)

const state = reactive({
  email: ''
})

async function onSubmit() {
  errorMessage.value = null
  loading.value = true

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(state.email, {
      redirectTo: `${window.location.origin}/admin/reset-password`
    })

    if (error) {
      errorMessage.value = error.code === 'over_email_send_rate_limit'
        ? 'You\'ve already requested a reset link recently. Please wait a bit and try again.'
        : 'Something went wrong. Please try again.'
      return
    }

    submitted.value = true
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
        Reset your LiveQA Admin password
      </h1>

      <UCard class="w-full max-w-xl" :ui="{ body: 'p-8' }">
        <UForm v-if="!submitted" :state="state" class="flex flex-col gap-5" @submit="onSubmit">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Enter your email and we'll send you a link to reset your password.
          </p>

          <UFormField label="Email" name="email" required :ui="{ label: 'font-semibold text-primary' }">
            <UInput v-model="state.email" type="email" class="w-full" autocomplete="email" />
          </UFormField>

          <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

          <UButton
            type="submit"
            variant="outline"
            block
            size="lg"
            :loading="loading"
            label="SEND RESET LINK"
            class="font-semibold tracking-wide"
          />

          <NuxtLink to="/admin/login" class="text-center text-sm underline">
            Back to log in
          </NuxtLink>
        </UForm>

        <div v-else class="flex flex-col items-center gap-2 text-center">
          <h2 class="text-lg font-semibold">
            Check your email
          </h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            If an account exists for that email, we've sent a link to reset your
            password.
          </p>
          <NuxtLink to="/admin/login" class="mt-2 text-sm underline">
            Back to log in
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
