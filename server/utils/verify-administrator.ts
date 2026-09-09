import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { useSupabaseServiceRole } from './supabase'

/**
 * Verifies the request's bearer token belongs to a current, non-revoked
 * administrator. Never trusts a client-supplied id or role - re-derives
 * both from the token and a fresh, service-role (RLS-bypassing) lookup.
 * Returns the administrator's user id, or null if verification fails for
 * any reason.
 */
export async function verifyAdministrator(event: H3Event): Promise<string | null> {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  if (!token) return null

  const supabase = useSupabaseServiceRole()

  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, deleted_at')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'administrator' || profile.deleted_at !== null) return null

  return user.id
}
