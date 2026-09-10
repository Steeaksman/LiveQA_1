import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { verifyModeratorSession } from '../../../utils/verify-moderator-session'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  const result = await verifyModeratorSession({ slug, token })

  return { success: true, data: { valid: result.ok }, error: null }
})
