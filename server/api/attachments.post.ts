import { randomUUID } from 'node:crypto'
import { defineEventHandler, readMultipartFormData, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../utils/supabase'

const EVENT_NOT_FOUND_ERROR = 'Event not found.'
const SUBMISSIONS_CLOSED_ERROR = 'Submissions are currently closed.'
const NOT_JOINED_ERROR = 'Please join the event before adding an attachment.'
const QUESTION_NOT_FOUND_ERROR = 'Question not found.'
const NOT_ENABLED_ERROR = 'Attachments are not enabled for this event.'
const COUNT_EXCEEDED_ERROR = 'You\'ve reached the maximum number of attachments for this question.'
const UNSUPPORTED_TYPE_ERROR = 'Unsupported file type.'
const NO_FILE_ERROR = 'Please choose a file to upload.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const BUCKET = 'question-attachments'
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

export default defineEventHandler(async (event) => {
  const parts = (await readMultipartFormData(event)) ?? []

  const fields = new Map<string, string>()
  let file: { filename?: string, type?: string, data: Buffer } | undefined

  for (const part of parts) {
    if (part.name === 'file' && part.data?.length) {
      file = { filename: part.filename, type: part.type, data: part.data }
    } else if (part.name) {
      fields.set(part.name, part.data.toString('utf-8'))
    }
  }

  const eventId = fields.get('eventId') ?? ''
  const token = fields.get('token') ?? ''
  const questionId = fields.get('questionId') ?? ''

  if (!eventId || !token || !questionId) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: sourceEvent } = await supabase
    .from('events')
    .select('id, status, submissions_open')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sourceEvent || sourceEvent.status !== 'live') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  if (!sourceEvent.submissions_open) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: SUBMISSIONS_CLOSED_ERROR }
  }

  const { data: attendee } = await supabase
    .from('attendees')
    .select('id')
    .eq('event_id', eventId)
    .eq('token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (!attendee) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NOT_JOINED_ERROR }
  }

  const { data: question } = await supabase
    .from('questions')
    .select('id')
    .eq('id', questionId)
    .eq('event_id', eventId)
    .eq('attendee_id', attendee.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!question) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: QUESTION_NOT_FOUND_ERROR }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('attachment_max_count, attachment_max_size_bytes')
    .eq('event_id', eventId)
    .single()

  const maxCount = settings?.attachment_max_count ?? 0
  const maxSizeBytes = settings?.attachment_max_size_bytes ?? 5242880

  if (maxCount === 0) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NOT_ENABLED_ERROR }
  }

  const { count: existingCount } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)
    .is('deleted_at', null)

  if ((existingCount ?? 0) >= maxCount) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: COUNT_EXCEEDED_ERROR }
  }

  if (!file) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NO_FILE_ERROR }
  }

  if (!file.type || !ALLOWED_MIME_TYPES.includes(file.type)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: UNSUPPORTED_TYPE_ERROR }
  }

  if (file.data.length > maxSizeBytes) {
    setResponseStatus(event, 400)
    const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(1)
    return { success: false, data: null, error: `File is too large (max ${maxMb} MB).` }
  }

  const storagePath = `${eventId}/${questionId}/${randomUUID()}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.data, { contentType: file.type })

  if (uploadError) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const { data: created, error } = await supabase
    .from('attachments')
    .insert({
      question_id: questionId,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.data.length
    })
    .select('id')
    .single()

  if (error || !created) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: { attachmentId: created.id }, error: null }
})
