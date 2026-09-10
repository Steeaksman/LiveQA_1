import { useSupabaseServiceRole } from './supabase'

interface VerifyModeratorSessionInput {
  slug: string
  token: string
}

type VerifyModeratorSessionResult =
  | { ok: true, eventId: string }
  | { ok: false }

/**
 * Resolves the event by slug (must be live and have moderator access
 * enabled, both re-checked on every call) and confirms a non-revoked,
 * unexpired, non-soft-deleted `moderator_sessions` row exists for that
 * event and token. Never trusts a previously valid result - every caller
 * re-verifies the full chain each time, matching this app's established
 * never-trust-a-cached-state discipline.
 */
export async function verifyModeratorSession(input: VerifyModeratorSessionInput): Promise<VerifyModeratorSessionResult> {
  const { slug, token } = input
  if (!token) return { ok: false }

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('id, status, moderator_access_enabled')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live' || !found.moderator_access_enabled) {
    return { ok: false }
  }

  const { data: session } = await supabase
    .from('moderator_sessions')
    .select('expires_at, revoked_at')
    .eq('event_id', found.id)
    .eq('session_token', token)
    .is('deleted_at', null)
    .maybeSingle()

  const valid = !!session
    && session.revoked_at === null
    && new Date(session.expires_at).getTime() > Date.now()

  if (!valid) return { ok: false }

  return { ok: true, eventId: found.id }
}
