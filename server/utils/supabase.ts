import { createClient } from '@supabase/supabase-js'
import { useRuntimeConfig } from '#imports'

export function useSupabaseServiceRole() {
  const config = useRuntimeConfig()
  return createClient(config.public.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  })
}
