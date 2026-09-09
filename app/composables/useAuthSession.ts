import type { SupabaseClient } from '@supabase/supabase-js'

export type AuthenticatedRole = 'administrator' | 'event_manager'

export interface AuthenticatedProfile {
  userId: string
  email: string | null
  role: AuthenticatedRole
  emScope: 'global' | 'restricted' | null
}

/**
 * Returns the current authenticated profile (Administrator or Event
 * Manager), or null if there is no session, no matching profile row, or
 * the profile's role isn't one of those two (in which case it is also
 * signed out, so no authenticated-but-unauthorized session lingers).
 */
export async function getAuthenticatedProfile(supabase: SupabaseClient): Promise<AuthenticatedProfile | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, em_scope')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'administrator' && profile?.role !== 'event_manager') {
    await supabase.auth.signOut()
    return null
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    role: profile.role,
    emScope: profile.em_scope ?? null
  }
}
