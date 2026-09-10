<script setup lang="ts">
import type { AuthenticatedProfile } from '~/composables/useAuthSession'

definePageMeta({ middleware: 'admin' })

const supabase = useSupabase()
const profile = ref<AuthenticatedProfile | null>(null)

const roleLabel = computed(() => {
  if (!profile.value) return ''
  if (profile.value.role === 'administrator') return 'Administrator'
  return profile.value.emScope === 'global' ? 'Event Manager (Global)' : 'Event Manager (Restricted)'
})

onMounted(async () => {
  profile.value = await getAuthenticatedProfile(supabase)
})

async function logout() {
  await supabase.auth.signOut()
  await navigateTo('/admin/login')
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4">
    <p>Logged in as {{ profile?.email }} ({{ roleLabel }})</p>
    <template v-if="profile?.role === 'administrator'">
      <NuxtLink to="/admin/events">
        Events
      </NuxtLink>
      <NuxtLink to="/admin/events/new">
        Create Event
      </NuxtLink>
      <NuxtLink to="/admin/event-managers">
        Event Managers
      </NuxtLink>
      <NuxtLink to="/admin/templates">
        Templates
      </NuxtLink>
    </template>
    <UButton label="Log out" @click="logout" />
  </div>
</template>
