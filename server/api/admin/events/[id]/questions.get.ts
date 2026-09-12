import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: questions } = await supabase
    .from('questions')
    .select('id, text, created_at, attendee_id, approval_status, visibility, answered, archived')
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const questionIds = (questions ?? []).map(q => q.id)

  const attendeeIds = [...new Set((questions ?? []).map(q => q.attendee_id))]

  const { data: submitters } = await supabase
    .from('attendees')
    .select('id, display_name')
    .in('id', attendeeIds.length ? attendeeIds : [''])

  const submitterNameById = new Map((submitters ?? []).map(a => [a.id, a.display_name]))

  const { data: revisions } = await supabase
    .from('question_revisions')
    .select('id, question_id, original_text, revised_text, edited_by, created_at')
    .in('question_id', questionIds.length ? questionIds : [''])
    .order('created_at', { ascending: true })

  const editorIds = [...new Set((revisions ?? []).map(r => r.edited_by))]

  const { data: editors } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', editorIds.length ? editorIds : [''])

  const editorEmailById = new Map((editors ?? []).map(p => [p.id, p.email]))

  const revisionsByQuestionId = new Map<string, { id: string, originalText: string, revisedText: string, editedByEmail: string | null, createdAt: string }[]>()
  for (const r of revisions ?? []) {
    const list = revisionsByQuestionId.get(r.question_id) ?? []
    list.push({
      id: r.id,
      originalText: r.original_text,
      revisedText: r.revised_text,
      editedByEmail: editorEmailById.get(r.edited_by) ?? null,
      createdAt: r.created_at
    })
    revisionsByQuestionId.set(r.question_id, list)
  }

  const result = (questions ?? []).map(q => ({
    id: q.id,
    text: q.text,
    createdAt: q.created_at,
    approvalStatus: q.approval_status,
    visibility: q.visibility,
    answered: q.answered,
    archived: q.archived,
    displayName: submitterNameById.get(q.attendee_id) ?? null,
    revisions: revisionsByQuestionId.get(q.id) ?? []
  }))

  return { success: true, data: { questions: result }, error: null }
})
