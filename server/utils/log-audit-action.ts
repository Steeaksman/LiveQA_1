import { useSupabaseServiceRole } from './supabase'

export async function logAuditAction(
  actorId: string,
  action: string,
  eventId: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = useSupabaseServiceRole()
    await supabase.from('audit_logs').insert({
      actor_id: actorId,
      event_id: eventId,
      action,
      details: details ?? null
    })
  } catch {
    // Best-effort: a failed audit-log write must never block the action it describes.
  }
}
