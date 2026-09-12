import { useSupabaseServiceRole } from './supabase'

export type AbuseProtectionTier = 'open' | 'standard' | 'strict'

interface TierConfig {
  rateLimitCount: number
  rateLimitWindowSeconds: number
  banThresholdCount: number
  banWindowSeconds: number
  banDurationSeconds: number
}

const TIER_CONFIG: Record<Exclude<AbuseProtectionTier, 'open'>, TierConfig> = {
  standard: {
    rateLimitCount: 5,
    rateLimitWindowSeconds: 30,
    banThresholdCount: 20,
    banWindowSeconds: 600,
    banDurationSeconds: 900
  },
  strict: {
    rateLimitCount: 3,
    rateLimitWindowSeconds: 30,
    banThresholdCount: 10,
    banWindowSeconds: 600,
    banDurationSeconds: 1800
  }
}

export const TEMPORARILY_RESTRICTED_ERROR = 'You have been temporarily restricted. Please try again later.'
export const RATE_LIMITED_ERROR = 'You\'re submitting too quickly. Please wait a moment and try again.'

export async function isAttendeeBanned(attendeeId: string): Promise<boolean> {
  const supabase = useSupabaseServiceRole()

  const { data: attendee } = await supabase
    .from('attendees')
    .select('banned_until')
    .eq('id', attendeeId)
    .maybeSingle()

  return !!attendee?.banned_until && new Date(attendee.banned_until) > new Date()
}

async function countSubmissionsSince(attendeeId: string, sinceIso: string): Promise<number> {
  const supabase = useSupabaseServiceRole()

  const [questions, replies] = await Promise.all([
    supabase.from('questions').select('id', { count: 'exact', head: true }).eq('attendee_id', attendeeId).gte('created_at', sinceIso),
    supabase.from('replies').select('id', { count: 'exact', head: true }).eq('attendee_id', attendeeId).gte('created_at', sinceIso)
  ])

  return (questions.count ?? 0) + (replies.count ?? 0)
}

export async function enforceSubmissionRateLimit(
  attendeeId: string,
  tier: AbuseProtectionTier
): Promise<{ allowed: true } | { allowed: false, error: string }> {
  if (await isAttendeeBanned(attendeeId)) {
    return { allowed: false, error: TEMPORARILY_RESTRICTED_ERROR }
  }

  if (tier === 'open') {
    return { allowed: true }
  }

  const config = TIER_CONFIG[tier]
  const now = new Date()

  const banWindowStart = new Date(now.getTime() - config.banWindowSeconds * 1000).toISOString()
  const banWindowCount = await countSubmissionsSince(attendeeId, banWindowStart)

  if (banWindowCount >= config.banThresholdCount) {
    const bannedUntil = new Date(now.getTime() + config.banDurationSeconds * 1000).toISOString()
    const supabase = useSupabaseServiceRole()
    await supabase.from('attendees').update({ banned_until: bannedUntil }).eq('id', attendeeId)
    return { allowed: false, error: TEMPORARILY_RESTRICTED_ERROR }
  }

  const rateLimitWindowStart = new Date(now.getTime() - config.rateLimitWindowSeconds * 1000).toISOString()
  const rateLimitWindowCount = await countSubmissionsSince(attendeeId, rateLimitWindowStart)

  if (rateLimitWindowCount >= config.rateLimitCount) {
    return { allowed: false, error: RATE_LIMITED_ERROR }
  }

  return { allowed: true }
}
