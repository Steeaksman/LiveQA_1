export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/admin/login') return

  const supabase = useSupabase()
  const session = await getAdministratorSession(supabase)

  if (!session) return navigateTo('/admin/login')
})
