<script setup lang="ts">
import type { AuthenticatedProfile } from '~/composables/useAuthSession'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const supabase = useSupabase()
const profile = ref<AuthenticatedProfile | null>(null)

const roleLabel = computed(() => {
  if (!profile.value) return ''
  if (profile.value.role === 'administrator') return 'Administrator'
  return profile.value.emScope === 'global' ? 'Event Manager (Global)' : 'Event Manager (Restricted)'
})

const navItems = useAdminNav(profile)

onMounted(async () => {
  profile.value = await getAuthenticatedProfile(supabase)
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <p>Logged in as {{ profile?.email }} ({{ roleLabel }})</p>
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <UButton
        v-for="item in navItems"
        :key="String(item.to)"
        :to="item.to"
        color="neutral"
        variant="outline"
        class="h-24 flex-col items-center justify-center gap-2 text-center"
      >
        <UIcon :name="item.icon!" class="size-6" />
        <span class="text-sm">{{ item.label }}</span>
      </UButton>
    </div>
  </div>
</template>
