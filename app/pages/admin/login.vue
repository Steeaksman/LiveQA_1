<script setup lang="ts">
const supabase = useSupabase()
const errorMessage = ref<string | null>(null)
const loading = ref(false)

onMounted(async () => {
  const session = await getAdministratorSession(supabase)
  if (session) await navigateTo('/admin')
})

const fields = [
  { name: 'email', type: 'email' as const, label: 'Email', required: true },
  { name: 'password', type: 'password' as const, label: 'Password', required: true }
]

async function onSubmit(payload: { data: { email: string, password: string } }) {
  errorMessage.value = null
  loading.value = true

  try {
    const { error: signInError } = await supabase.auth.signInWithPassword(payload.data)

    if (signInError) {
      errorMessage.value = 'Invalid email or password.'
      return
    }

    const session = await getAdministratorSession(supabase)
    if (!session) {
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
  <div class="flex min-h-screen items-center justify-center">
    <UAuthForm
      title="Administrator login"
      :fields="fields"
      :loading="loading"
      :submit="{ label: 'Log in' }"
      @submit="onSubmit"
    >
      <template v-if="errorMessage" #validation>
        <UAlert color="error" variant="subtle" :title="errorMessage" />
      </template>
    </UAuthForm>
  </div>
</template>
