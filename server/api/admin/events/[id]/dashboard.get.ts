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

  const baseQuery = () => supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .is('deleted_at', null)

  const [
    pendingResult,
    approvedResult,
    rejectedResult,
    publicResult,
    answeredResult,
    archivedResult,
    topQuestionResult,
    currentTopicResult
  ] = await Promise.all([
    baseQuery().eq('approval_status', 'pending'),
    baseQuery().eq('approval_status', 'approved'),
    baseQuery().eq('approval_status', 'rejected'),
    baseQuery().eq('visibility', 'public'),
    baseQuery().eq('answered', true),
    baseQuery().eq('archived', true),
    supabase
      .from('questions')
      .select('id, text, created_at, votes(count)')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('topics')
      .select('name')
      .eq('event_id', eventId)
      .eq('is_current', true)
      .is('deleted_at', null)
      .maybeSingle()
  ])

  const questionsWithVotes = (topQuestionResult.data ?? []).map(q => ({
    id: q.id,
    text: q.text,
    voteCount: q.votes?.[0]?.count ?? 0
  }))

  const topVotedQuestion = questionsWithVotes.reduce<typeof questionsWithVotes[number] | null>((best, current) => {
    if (current.voteCount === 0) return best
    if (!best || current.voteCount > best.voteCount) return current
    return best
  }, null)

  return {
    success: true,
    data: {
      pendingCount: pendingResult.count ?? 0,
      approvedCount: approvedResult.count ?? 0,
      rejectedCount: rejectedResult.count ?? 0,
      publicCount: publicResult.count ?? 0,
      answeredCount: answeredResult.count ?? 0,
      archivedCount: archivedResult.count ?? 0,
      topVotedQuestion: topVotedQuestion ? { id: topVotedQuestion.id, text: topVotedQuestion.text, voteCount: topVotedQuestion.voteCount } : null,
      currentTopic: currentTopicResult.data ? { name: currentTopicResult.data.name } : null
    },
    error: null
  }
})
