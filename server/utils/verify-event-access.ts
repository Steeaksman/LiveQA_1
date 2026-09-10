import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { useSupabaseServiceRole } from './supabase'

/**
 * Verifies the request's bearer token belongs to a current, non-revoked
 * Administrator, or an Event Manager with access to `eventId` (global
 * scope, or a matching non-deleted assignment) - mirroring
 * `is_event_manager_for`'s SQL predicate. Never trusts a client-supplied
 * id or role - re-derives both from the token and fresh, service-role
 * lookups. Returns the caller's profile id, or null if verification fails
 * for any reason.
 */
export async function verifyEventAccess(event: H3Event, eventId: string): Promise<string | null> {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  if (!token) return null

  const supabase = useSupabaseServiceRole()

  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, em_scope, deleted_at')
    .eq('id', user.id)
    .single()

  if (!profile || profile.deleted_at !== null) return null
  if (profile.role === 'administrator') return user.id

  if (profile.role === 'event_manager') {
    if (profile.em_scope === 'global') return user.id

    const { data: assignment } = await supabase
      .from('event_manager_assignments')
      .select('id')
      .eq('event_manager_id', user.id)
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .maybeSingle()

    if (assignment) return user.id
  }

  return null
}
