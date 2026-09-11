import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { useSupabaseServiceRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  if (!token) {
    return { success: true, data: { questions: [] }, error: null }
  }

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('id, status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live') {
    return { success: true, data: { questions: [] }, error: null }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('attendee_edit_window_minutes')
    .eq('event_id', found.id)
    .single()

  const editWindowMinutes = settings?.attendee_edit_window_minutes ?? 0

  const { data: attendee } = await supabase
    .from('attendees')
    .select('id')
    .eq('event_id', found.id)
    .eq('token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (!attendee) {
    return { success: true, data: { questions: [] }, error: null }
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('id, text, approval_status, visibility, created_at')
    .eq('event_id', found.id)
    .eq('attendee_id', attendee.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const questionIds = (questions ?? []).map(q => q.id)

  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, question_id, storage_path, mime_type, size_bytes')
    .in('question_id', questionIds.length ? questionIds : [''])
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const paths = (attachments ?? []).map(a => a.storage_path)
  const { data: signedUrls } = paths.length
    ? await supabase.storage.from('question-attachments').createSignedUrls(paths, 3600)
    : { data: [] }

  const signedUrlByPath = new Map((signedUrls ?? []).map(s => [s.path, s.signedUrl]))

  const attachmentsByQuestionId = new Map<string, { id: string, mimeType: string, sizeBytes: number, viewUrl: string | null }[]>()
  for (const a of attachments ?? []) {
    const list = attachmentsByQuestionId.get(a.question_id) ?? []
    list.push({
      id: a.id,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      viewUrl: signedUrlByPath.get(a.storage_path) ?? null
    })
    attachmentsByQuestionId.set(a.question_id, list)
  }

  const now = Date.now()

  const result = (questions ?? []).map(q => {
    const ageMinutes = (now - new Date(q.created_at).getTime()) / 60000
    const canModify = editWindowMinutes > 0 && ageMinutes <= editWindowMinutes

    return {
      id: q.id,
      text: q.text,
      approvalStatus: q.approval_status,
      visibility: q.visibility,
      canModify,
      attachments: attachmentsByQuestionId.get(q.id) ?? []
    }
  })

  return { success: true, data: { questions: result }, error: null }
})
