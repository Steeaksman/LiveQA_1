import { defineEventHandler, getQuery, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  const session = await verifyModeratorSession({ slug, token })

  if (!session.ok) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const [eventResult, settingsResult, questionsResult] = await Promise.all([
    supabase
      .from('events')
      .select('submissions_open, voting_open')
      .eq('id', session.eventId)
      .single(),
    supabase
      .from('event_settings')
      .select('show_attendee_type')
      .eq('event_id', session.eventId)
      .single(),
    supabase
      .from('questions')
      .select('id, text, created_at, attendee_id, anonymous, approval_status, visibility, answered, archived, topic_id, votes(count)')
      .eq('event_id', session.eventId)
      .is('deleted_at', null)
  ])

  const showAttendeeType = settingsResult.data?.show_attendee_type ?? false
  const questions = questionsResult.data ?? []

  const attendeeIds = [...new Set(questions.map(q => q.attendee_id))]

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

  const topicIds = [...new Set(questions.map(q => q.topic_id).filter((id): id is string => !!id))]

  const { data: topicRows } = await supabase
    .from('topics')
    .select('id, name')
    .in('id', topicIds.length ? topicIds : [''])
    .is('deleted_at', null)

  const topicNameById = new Map((topicRows ?? []).map(t => [t.id, t.name]))

  const result = questions
    .map(q => {
      const submitter = submittersById.get(q.attendee_id)
      const attendeeTypeLabel = submitter?.attendee_type_id ? attendeeTypeLabelById.get(submitter.attendee_type_id) : undefined

      return {
        id: q.id,
        text: q.text,
        createdAt: q.created_at,
        approvalStatus: q.approval_status,
        visibility: q.visibility,
        answered: q.answered,
        archived: q.archived,
        voteCount: q.votes?.[0]?.count ?? 0,
        displayName: q.anonymous ? null : submitter?.display_name ?? null,
        attendeeType: (q.anonymous || !showAttendeeType) ? null : attendeeTypeLabel ?? null,
        topicName: q.topic_id ? topicNameById.get(q.topic_id) ?? null : null
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    success: true,
    data: {
      questions: result,
      submissionsOpen: eventResult.data?.submissions_open ?? false,
      votingOpen: eventResult.data?.voting_open ?? false
    },
    error: null
  }
})
