import { useSupabaseServiceRole } from './supabase'

export type ReportType = 'combined' | 'topic_by_topic'

export interface ReportReply {
  text: string
  createdAt: string
  displayName: string
}

export interface ReportAttachment {
  mimeType: string
  sizeBytes: number
}

export interface QuestionReportRow {
  id: string
  text: string
  createdAt: string
  topicName: string | null
  displayName: string | null
  attendeeType: string | null
  approvalStatus: string
  visibility: string
  answered: boolean
  archived: boolean
  voteCount: number
  isTopVoted: boolean
  replies: ReportReply[]
  attachments: ReportAttachment[]
}

export interface CombinedReportData {
  participationCount: number
  generatedAt: string
  rows: QuestionReportRow[]
}

export interface TopicByTopicReportData {
  participationCount: number
  generatedAt: string
  topics: { topicName: string, rows: QuestionReportRow[] }[]
}

export async function buildEventReportData(eventId: string, reportType: ReportType): Promise<CombinedReportData | TopicByTopicReportData> {
  const supabase = useSupabaseServiceRole()

  const [
    { count: participationCount },
    { data: settings },
    { data: questions },
    { data: topics }
  ] = await Promise.all([
    supabase.from('attendees').select('id', { count: 'exact', head: true }).eq('event_id', eventId).is('deleted_at', null),
    supabase.from('event_settings').select('anonymity_mode, show_attendee_type').eq('event_id', eventId).single(),
    supabase
      .from('questions')
      .select('id, text, created_at, attendee_id, anonymous, topic_id, approval_status, visibility, answered, archived, votes(count)')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase.from('topics').select('id, name, sort_order').eq('event_id', eventId).is('deleted_at', null).order('sort_order', { ascending: true })
  ])

  const showAttendeeType = settings?.show_attendee_type ?? false
  const topicNameById = new Map((topics ?? []).map(t => [t.id, t.name]))

  const questionIds = (questions ?? []).map(q => q.id)
  const attendeeIds = [...new Set((questions ?? []).map(q => q.attendee_id))]

  const [{ data: submitters }, { data: replies }, { data: attachments }] = await Promise.all([
    supabase.from('attendees').select('id, display_name, attendee_type_id').in('id', attendeeIds.length ? attendeeIds : ['']),
    supabase
      .from('replies')
      .select('id, question_id, text, created_at, attendee_id')
      .in('question_id', questionIds.length ? questionIds : [''])
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('attachments')
      .select('question_id, mime_type, size_bytes')
      .in('question_id', questionIds.length ? questionIds : [''])
      .is('deleted_at', null)
  ])

  const attendeeTypeIds = [...new Set((submitters ?? []).map(a => a.attendee_type_id).filter((id): id is string => !!id))]
  const { data: attendeeTypeRows } = await supabase
    .from('attendee_types')
    .select('id, label')
    .in('id', attendeeTypeIds.length ? attendeeTypeIds : [''])

  const attendeeTypeLabelById = new Map((attendeeTypeRows ?? []).map(t => [t.id, t.label]))
  const submitterById = new Map((submitters ?? []).map(a => [a.id, a]))

  const replyAttendeeIds = [...new Set((replies ?? []).map(r => r.attendee_id).filter((id): id is string => !!id))]
  const { data: replyAuthors } = await supabase
    .from('attendees')
    .select('id, display_name')
    .in('id', replyAttendeeIds.length ? replyAttendeeIds : [''])

  const replyAuthorNameById = new Map((replyAuthors ?? []).map(a => [a.id, a.display_name]))

  const repliesByQuestionId = new Map<string, ReportReply[]>()
  for (const r of replies ?? []) {
    const list = repliesByQuestionId.get(r.question_id) ?? []
    list.push({
      text: r.text,
      createdAt: r.created_at,
      displayName: r.attendee_id ? replyAuthorNameById.get(r.attendee_id) ?? 'Unknown' : 'Moderator'
    })
    repliesByQuestionId.set(r.question_id, list)
  }

  const attachmentsByQuestionId = new Map<string, ReportAttachment[]>()
  for (const a of attachments ?? []) {
    const list = attachmentsByQuestionId.get(a.question_id) ?? []
    list.push({ mimeType: a.mime_type, sizeBytes: a.size_bytes })
    attachmentsByQuestionId.set(a.question_id, list)
  }

  const maxVoteCount = Math.max(0, ...(questions ?? []).map(q => q.votes?.[0]?.count ?? 0))

  const rows: QuestionReportRow[] = (questions ?? []).map((q) => {
    const submitter = submitterById.get(q.attendee_id)
    const voteCount = q.votes?.[0]?.count ?? 0

    return {
      id: q.id,
      text: q.text,
      createdAt: q.created_at,
      topicName: q.topic_id ? topicNameById.get(q.topic_id) ?? null : null,
      displayName: q.anonymous ? null : submitter?.display_name ?? null,
      attendeeType: (q.anonymous || !showAttendeeType)
        ? null
        : (submitter?.attendee_type_id ? attendeeTypeLabelById.get(submitter.attendee_type_id) ?? null : null),
      approvalStatus: q.approval_status,
      visibility: q.visibility,
      answered: q.answered,
      archived: q.archived,
      voteCount,
      isTopVoted: maxVoteCount > 0 && voteCount === maxVoteCount,
      replies: repliesByQuestionId.get(q.id) ?? [],
      attachments: attachmentsByQuestionId.get(q.id) ?? []
    }
  })

  const generatedAt = new Date().toISOString()

  if (reportType === 'combined') {
    return { participationCount: participationCount ?? 0, generatedAt, rows }
  }

  const rowsByTopicId = new Map<string | null, QuestionReportRow[]>()
  rows.forEach((row, index) => {
    const topicId = (questions ?? [])[index]?.topic_id ?? null
    const list = rowsByTopicId.get(topicId) ?? []
    list.push(row)
    rowsByTopicId.set(topicId, list)
  })

  const grouped: { topicName: string, rows: QuestionReportRow[] }[] = []
  const noTopicRows = rowsByTopicId.get(null) ?? []
  if (noTopicRows.length) grouped.push({ topicName: 'No topic', rows: noTopicRows })

  for (const topic of topics ?? []) {
    const topicRows = rowsByTopicId.get(topic.id) ?? []
    if (topicRows.length) grouped.push({ topicName: topic.name, rows: topicRows })
  }

  return { participationCount: participationCount ?? 0, generatedAt, topics: grouped }
}
