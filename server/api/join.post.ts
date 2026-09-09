import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useSupabaseServiceRole } from '../utils/supabase'
import { isValidJoinCode, normalizeJoinCode } from '../../app/utils/generate-event-identifiers'

interface JoinBody {
  code?: string
}

const INVALID_CODE_ERROR = 'Invalid code.'

export default defineEventHandler(async (event) => {
  const body = await readBody<JoinBody>(event)
  const code = normalizeJoinCode(body?.code ?? '')

  if (!isValidJoinCode(code)) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: INVALID_CODE_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: found } = await supabase
    .from('events')
    .select('slug, status')
    .eq('join_code', code)
    .is('deleted_at', null)
    .maybeSingle()

  if (!found || found.status !== 'live') {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: INVALID_CODE_ERROR }
  }

  return { success: true, data: { slug: found.slug }, error: null }
})
