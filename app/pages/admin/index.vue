<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const supabase = useSupabase()
const email = ref<string | null>(null)

onMounted(async () => {
  const session = await getAdministratorSession(supabase)
  email.value = session?.email ?? null
})

async function logout() {
  await supabase.auth.signOut()
  await navigateTo('/admin/login')
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4">
    <p>Logged in as {{ email }} (Administrator)</p>
    <UButton label="Log out" @click="logout" />
  </div>
</template>
