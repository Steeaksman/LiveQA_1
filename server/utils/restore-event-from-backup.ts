import { randomUUID } from 'node:crypto'
import { slugify, generateJoinCode } from '../../app/utils/generate-event-identifiers'
import { useSupabaseServiceRole } from './supabase'

type RestoreResult =
  | { ok: true, eventId: string, slug: string }
  | { ok: false, error: string }

const INVALID_BACKUP_ERROR = 'Invalid backup file.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const MAX_SLUG_ATTEMPTS = 5

function isBackupShapeValid(backup: unknown): backup is {
  exportVersion: number
  event: Record<string, unknown>
  eventSettings: Record<string, unknown>
  attendeeTypes: Record<string, unknown>[]
  topics: Record<string, unknown>[]
  attendees: Record<string, unknown>[]
  questions: Record<string, unknown>[]
  replies: Record<string, unknown>[]
  votes: Record<string, unknown>[]
} {
  if (!backup || typeof backup !== 'object') return false
  const b = backup as Record<string, unknown>

  if (b.exportVersion !== 1) return false
  if (!b.event || typeof b.event !== 'object') return false
  if (!b.eventSettings || typeof b.eventSettings !== 'object') return false

  for (const key of ['attendeeTypes', 'topics', 'attendees', 'questions', 'replies', 'votes']) {
    if (!Array.isArray(b[key])) return false
  }

  return true
}

export async function restoreEventFromBackup(backup: unknown, restoredBy: string): Promise<RestoreResult> {
  if (!isBackupShapeValid(backup)) {
    return { ok: false, error: INVALID_BACKUP_ERROR }
  }

  const supabase = useSupabaseServiceRole()
  const eventName = typeof backup.event.name === 'string' ? backup.event.name : 'Restored event'

  let newEventId: string | null = null
  let newSlug: string | null = null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !newEventId; attempt++) {
    const candidateSlug = slugify(eventName)
    const { data: created, error } = await supabase
      .from('events')
      .insert({
        name: eventName,
        slug: candidateSlug,
        join_code: generateJoinCode(),
        status: 'draft',
        submissions_open: false,
        voting_open: false,
        moderator_access_enabled: false,
        created_by: restoredBy
      })
      .select('id, slug')
      .single()

    if (!error && created) {
      newEventId = created.id
      newSlug = created.slug
    }
  }

  if (!newEventId || !newSlug) {
    return { ok: false, error: GENERIC_ERROR }
  }

  async function fail(): Promise<RestoreResult> {
    await supabase.from('events').delete().eq('id', newEventId as string)
    return { ok: false, error: GENERIC_ERROR }
  }

  const { id: _exportedSettingsId, ...eventSettingsFields } = backup.eventSettings
  const { error: settingsError } = await supabase
    .from('event_settings')
    .insert({ ...eventSettingsFields, event_id: newEventId })

  if (settingsError) return fail()

  const attendeeTypeIdMap = new Map<string, string>()
  if (backup.attendeeTypes.length) {
    const rows = backup.attendeeTypes.map((row) => {
      const newId = randomUUID()
      attendeeTypeIdMap.set(row.id as string, newId)
      return { ...row, id: newId, event_id: newEventId }
    })

    const { error } = await supabase.from('attendee_types').insert(rows)
    if (error) return fail()
  }

  const topicIdMap = new Map<string, string>()
  if (backup.topics.length) {
    const rows = backup.topics.map((row) => {
      const newId = randomUUID()
      topicIdMap.set(row.id as string, newId)
      return { ...row, id: newId, event_id: newEventId }
    })

    const { error } = await supabase.from('topics').insert(rows)
    if (error) return fail()
  }

  const attendeeIdMap = new Map<string, string>()
  if (backup.attendees.length) {
    const rows = backup.attendees.map((row) => {
      const newId = randomUUID()
      attendeeIdMap.set(row.id as string, newId)
      return {
        ...row,
        id: newId,
        event_id: newEventId,
        attendee_type_id: row.attendee_type_id ? attendeeTypeIdMap.get(row.attendee_type_id as string) ?? null : null,
        token: randomUUID()
      }
    })

    const { error } = await supabase.from('attendees').insert(rows)
    if (error) return fail()
  }

  const questionIdMap = new Map<string, string>()
  if (backup.questions.length) {
    const rows = backup.questions.map((row) => {
      const newId = randomUUID()
      questionIdMap.set(row.id as string, newId)
      return {
        ...row,
        id: newId,
        event_id: newEventId,
        topic_id: row.topic_id ? topicIdMap.get(row.topic_id as string) ?? null : null,
        attendee_id: attendeeIdMap.get(row.attendee_id as string)
      }
    })

    if (rows.some(r => !r.attendee_id)) return fail()

    const { error } = await supabase.from('questions').insert(rows)
    if (error) return fail()
  }

  if (backup.replies.length) {
    const rows = backup.replies.map((row) => ({
      ...row,
      id: randomUUID(),
      event_id: newEventId,
      question_id: questionIdMap.get(row.question_id as string),
      attendee_id: row.attendee_id ? attendeeIdMap.get(row.attendee_id as string) ?? null : null
    }))

    if (rows.some(r => !r.question_id)) return fail()

    const { error } = await supabase.from('replies').insert(rows)
    if (error) return fail()
  }

  if (backup.votes.length) {
    const rows = backup.votes.map((row) => ({
      ...row,
      id: randomUUID(),
      event_id: newEventId,
      question_id: questionIdMap.get(row.question_id as string),
      attendee_id: attendeeIdMap.get(row.attendee_id as string)
    }))

    if (rows.some(r => !r.question_id || !r.attendee_id)) return fail()

    const { error } = await supabase.from('votes').insert(rows)
    if (error) return fail()
  }

  return { ok: true, eventId: newEventId, slug: newSlug }
}
