import { defineEventHandler, readBody, getRouterParam, setResponseStatus } from 'h3'
import { verifyModeratorSession } from '../../../../utils/verify-moderator-session'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

interface EventControlsBody {
  token?: string
  submissionsOpen?: boolean
  votingOpen?: boolean
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const NOTHING_TO_UPDATE_ERROR = 'Nothing to update.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody<EventControlsBody>(event)
  const token = body?.token ?? ''

  const session = await verifyModeratorSession({ slug, token })

  if (!session.ok) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const update: { submissions_open?: boolean, voting_open?: boolean } = {}

  if (typeof body?.submissionsOpen === 'boolean') update.submissions_open = body.submissionsOpen
  if (typeof body?.votingOpen === 'boolean') update.voting_open = body.votingOpen

  if (Object.keys(update).length === 0) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NOTHING_TO_UPDATE_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { error } = await supabase
    .from('events')
    .update(update)
    .eq('id', session.eventId)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  return { success: true, data: null, error: null }
})
