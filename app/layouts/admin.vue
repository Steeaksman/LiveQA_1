<script setup lang="ts">
import type { AuthenticatedProfile } from '~/composables/useAuthSession'

const supabase = useSupabase()
const profile = ref<AuthenticatedProfile | null>(null)

const roleLabel = computed(() => {
  if (!profile.value) return ''
  if (profile.value.role === 'administrator') return 'Administrator'
  return profile.value.emScope === 'global' ? 'Event Manager (Global)' : 'Event Manager (Restricted)'
})

const navItems = useAdminNav(profile)
const sidebarItems = computed(() => [
  { label: 'Home', icon: 'i-lucide-house', to: '/admin' },
  ...navItems.value
])

const userMenuItems = computed(() => [[
  { label: 'Log out', icon: 'i-lucide-log-out', onSelect: logout }
]])

onMounted(async () => {
  profile.value = await getAuthenticatedProfile(supabase)
})

async function logout() {
  await supabase.auth.signOut()
  await navigateTo('/admin/login')
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar>
      <template #header>
        <NuxtLink to="/admin" class="font-semibold">
          LiveQA Admin
        </NuxtLink>
      </template>
      <UNavigationMenu :items="sidebarItems" orientation="vertical" />
    </UDashboardSidebar>
    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar title="Admin">
          <template #right>
            <UDropdownMenu :items="userMenuItems">
              <UButton color="neutral" variant="ghost">
                <UUser :name="profile?.email ?? ''" :description="roleLabel" size="sm" />
              </UButton>
            </UDropdownMenu>
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
