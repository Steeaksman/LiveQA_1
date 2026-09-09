export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/admin/login') return

  const supabase = useSupabase()
  const profile = await getAuthenticatedProfile(supabase)

  if (!profile) return navigateTo('/admin/login')
})
