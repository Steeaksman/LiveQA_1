import { defineEventHandler, getQuery, getRouterParam, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../../../utils/supabase'

const EVENT_NOT_FOUND_ERROR = 'Event not found.'

type SortOption = 'votes' | 'newest' | 'oldest'

function resolveSort(value: unknown): SortOption {
  return value === 'votes' || value === 'oldest' ? value : 'newest'
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const query = getQuery(event)
  const sort = resolveSort(query.sort)
  const token = typeof query.token === 'string' ? query.token : ''
  const search = typeof query.search === 'string' ? query.search.trim() : ''

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('id, status')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: EVENT_NOT_FOUND_ERROR }
  }

  const { data: settings } = await supabase
    .from('event_settings')
    .select('hide_vote_counts, show_attendee_type')
    .eq('event_id', found.id)
    .single()

  let questionsQuery = supabase
    .from('questions')
    .select('id, text, created_at, attendee_id, anonymous, votes(count)')
    .eq('event_id', found.id)
    .eq('visibility', 'public')
    .is('deleted_at', null)

  if (search) {
    questionsQuery = questionsQuery.ilike('text', `%${search}%`)
  }

  const { data: questions } = await questionsQuery

  const questionIds = (questions ?? []).map(q => q.id)

  const { data: publicReplies } = await supabase
    .from('replies')
    .select('id, question_id, text, created_at, attendee_id')
    .in('question_id', questionIds.length ? questionIds : [''])
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const replyIds = (publicReplies ?? []).map(r => r.id)

  let votedQuestionIds = new Set<string>()
  let reportedQuestionIds = new Set<string>()
  let reportedReplyIds = new Set<string>()

  if (token) {
    const { data: attendee } = await supabase
      .from('attendees')
      .select('id')
      .eq('event_id', found.id)
      .eq('token', token)
      .is('deleted_at', null)
      .maybeSingle()

    if (attendee) {
      const [votesResult, reportsResult, replyReportsResult] = await Promise.all([
        supabase
          .from('votes')
          .select('question_id')
          .eq('attendee_id', attendee.id)
          .in('question_id', questionIds),
        supabase
          .from('content_reports')
          .select('question_id')
          .eq('attendee_id', attendee.id)
          .in('question_id', questionIds),
        supabase
          .from('content_reports')
          .select('reply_id')
          .eq('attendee_id', attendee.id)
          .in('reply_id', replyIds.length ? replyIds : [''])
      ])

      votedQuestionIds = new Set((votesResult.data ?? []).map(v => v.question_id))
      reportedQuestionIds = new Set((reportsResult.data ?? []).filter(r => r.question_id).map(r => r.question_id as string))
      reportedReplyIds = new Set((replyReportsResult.data ?? []).filter(r => r.reply_id).map(r => r.reply_id as string))
    }
  }

  const hideVoteCounts = settings?.hide_vote_counts ?? false
  const showAttendeeType = settings?.show_attendee_type ?? false

  const attendeeIds = [...new Set((questions ?? []).map(q => q.attendee_id))]

  const { data: submitters } = await supabase
    .from('attendees')
    .select('id, display_name, attendee_type_id')
    .in('id', attendeeIds.length ? attendeeIds : [''])

  const attendeeTypeIds = [...new Set((submitters ?? []).map(a => a.attendee_type_id).filter((id): id is string => !!id))]

  const { data: attendeeTypeRows } = await supabase
    .from('attendee_types')
    .select('id, label')
    .in('id', attendeeTypeIds.length ? attendeeTypeIds : [''])

  const submittersById = new Map((submitters ?? []).map(a => [a.id, a]))
  const attendeeTypeLabelById = new Map((attendeeTypeRows ?? []).map(t => [t.id, t.label]))

  const replyAttendeeIds = [...new Set((publicReplies ?? []).map(r => r.attendee_id).filter((id): id is string => !!id))]

  const { data: replyAuthors } = await supabase
    .from('attendees')
    .select('id, display_name')
    .in('id', replyAttendeeIds.length ? replyAttendeeIds : [''])

  const replyAuthorNameById = new Map((replyAuthors ?? []).map(a => [a.id, a.display_name]))

  const repliesByQuestionId = new Map<string, { id: string, text: string, createdAt: string, displayName: string | null, reported: boolean }[]>()
  for (const r of publicReplies ?? []) {
    const list = repliesByQuestionId.get(r.question_id) ?? []
    list.push({
      id: r.id,
      text: r.text,
      createdAt: r.created_at,
      displayName: r.attendee_id ? replyAuthorNameById.get(r.attendee_id) ?? null : 'Moderator',
      reported: reportedReplyIds.has(r.id)
    })
    repliesByQuestionId.set(r.question_id, list)
  }

  const rows = (questions ?? []).map(q => ({
    id: q.id,
    text: q.text,
    createdAt: q.created_at,
    rawVoteCount: q.votes?.[0]?.count ?? 0,
    hasVoted: votedQuestionIds.has(q.id),
    reported: reportedQuestionIds.has(q.id),
    anonymous: q.anonymous,
    attendeeId: q.attendee_id
  }))

  rows.sort((a, b) => {
    if (sort === 'votes') return b.rawVoteCount - a.rawVoteCount
    if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt)
    return b.createdAt.localeCompare(a.createdAt)
  })

  const result = rows.map(r => {
    const submitter = submittersById.get(r.attendeeId)
    const attendeeTypeLabel = submitter?.attendee_type_id ? attendeeTypeLabelById.get(submitter.attendee_type_id) : undefined

    return {
      id: r.id,
      text: r.text,
      voteCount: hideVoteCounts ? null : r.rawVoteCount,
      hasVoted: r.hasVoted,
      reported: r.reported,
      displayName: r.anonymous ? null : submitter?.display_name ?? null,
      attendeeType: (r.anonymous || !showAttendeeType) ? null : attendeeTypeLabel ?? null,
      replies: repliesByQuestionId.get(r.id) ?? []
    }
  })

  return { success: true, data: { questions: result }, error: null }
})
