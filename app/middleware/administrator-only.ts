export default defineNuxtRouteMiddleware(async () => {
  const supabase = useSupabase()
  const profile = await getAuthenticatedProfile(supabase)

  if (profile?.role !== 'administrator') return navigateTo('/admin')
})
