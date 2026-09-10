export type ModerationAction =
  | 'approve'
  | 'reject'
  | 'hide'
  | 'publish'
  | 'mark_answered'
  | 'unmark_answered'
  | 'archive'
  | 'unarchive'

export const VALID_ACTIONS: ModerationAction[] = [
  'approve', 'reject', 'hide', 'publish', 'mark_answered', 'unmark_answered', 'archive', 'unarchive'
]

export const NOT_APPROVED_FOR_PUBLISH_ERROR = 'Approve the question before publishing it.'
export const NOT_APPROVED_FOR_ANSWERED_ERROR = 'Approve the question before marking it answered.'

export interface ModerationQuestionState {
  approval_status: 'pending' | 'approved' | 'rejected'
  visibility: 'hidden' | 'public'
  answered: boolean
  archived: boolean
}

export interface ModerationUpdate {
  approval_status?: 'pending' | 'approved' | 'rejected'
  visibility?: 'hidden' | 'public'
  answered?: boolean
  archived?: boolean
}

type ComputeModerationUpdateResult =
  | { ok: true, update: ModerationUpdate }
  | { ok: false, error: string }

/**
 * The single source of truth for what each moderation action does and
 * requires, given a question's current state. Shared by the
 * single-question and bulk action endpoints so their legality rules can
 * never drift apart.
 */
export function computeModerationUpdate(current: ModerationQuestionState, action: ModerationAction): ComputeModerationUpdateResult {
  switch (action) {
    case 'approve':
      return { ok: true, update: { approval_status: 'approved' } }
    case 'reject':
      return { ok: true, update: { approval_status: 'rejected', visibility: 'hidden' } }
    case 'hide':
      return { ok: true, update: { visibility: 'hidden' } }
    case 'publish':
      if (current.approval_status !== 'approved') return { ok: false, error: NOT_APPROVED_FOR_PUBLISH_ERROR }
      return { ok: true, update: { visibility: 'public' } }
    case 'mark_answered':
      if (current.approval_status !== 'approved') return { ok: false, error: NOT_APPROVED_FOR_ANSWERED_ERROR }
      return { ok: true, update: { answered: true } }
    case 'unmark_answered':
      return { ok: true, update: { answered: false } }
    case 'archive':
      return { ok: true, update: { archived: true } }
    case 'unarchive':
      return { ok: true, update: { archived: false } }
  }
}
