import { useSupabaseServiceRole } from './supabase'

export async function containsBlockedTerm(text: string): Promise<boolean> {
  const supabase = useSupabaseServiceRole()

  const { data: blockedTerms } = await supabase
    .from('blocked_terms')
    .select('term')
    .is('deleted_at', null)

  const lowerText = text.toLowerCase()

  return (blockedTerms ?? []).some(row => lowerText.includes(row.term.toLowerCase()))
}
