import type { SupabaseClient } from '@supabase/supabase-js'

export interface AdministratorSession {
  userId: string
  email: string | null
}

/**
 * Returns the current administrator's session, or null if there is no
 * session, or the session belongs to an account that isn't an
 * administrator (in which case it is also signed out, so no
 * authenticated-but-unauthorized session lingers).
 */
export async function getAdministratorSession(supabase: SupabaseClient): Promise<AdministratorSession | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'administrator') {
    await supabase.auth.signOut()
    return null
  }

  return { userId: session.user.id, email: session.user.email ?? null }
}
