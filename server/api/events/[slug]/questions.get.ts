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

  let votedQuestionIds = new Set<string>()

  if (token) {
    const { data: attendee } = await supabase
      .from('attendees')
      .select('id')
      .eq('event_id', found.id)
      .eq('token', token)
      .is('deleted_at', null)
      .maybeSingle()

    if (attendee) {
      const { data: votes } = await supabase
        .from('votes')
        .select('question_id')
        .eq('attendee_id', attendee.id)
        .in('question_id', (questions ?? []).map(q => q.id))

      votedQuestionIds = new Set((votes ?? []).map(v => v.question_id))
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

  const rows = (questions ?? []).map(q => ({
    id: q.id,
    text: q.text,
    createdAt: q.created_at,
    rawVoteCount: q.votes?.[0]?.count ?? 0,
    hasVoted: votedQuestionIds.has(q.id),
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
      displayName: r.anonymous ? null : submitter?.display_name ?? null,
      attendeeType: (r.anonymous || !showAttendeeType) ? null : attendeeTypeLabel ?? null
    }
  })

  return { success: true, data: { questions: result }, error: null }
})
