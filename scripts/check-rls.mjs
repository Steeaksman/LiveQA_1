// Verifies the schema is live and RLS is actually enforced, using the real
// anon and service-role keys against the connected Supabase project. Run
// with `node --env-file=.env scripts/check-rls.mjs` after populating .env
// from .env.example.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceRoleKey) {
  console.error('Missing NUXT_PUBLIC_SUPABASE_URL, NUXT_PUBLIC_SUPABASE_ANON_KEY, or NUXT_SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const anon = createClient(url, anonKey, { auth: { persistSession: false } })
const serviceRole = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

let failed = false

function check(label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'} - ${label}`)
  if (!condition) failed = true
}

const anonSelect = await anon.from('profiles').select('id').limit(1)
check('anon key cannot read an administrator-only table', !!anonSelect.error)

const anonInsert = await anon.from('event_templates').insert({
  name: 'rls-smoke-check',
  created_by: '00000000-0000-0000-0000-000000000000'
})
check('anon key cannot insert into an administrator-only table', !!anonInsert.error)

const serviceSelect = await serviceRole.from('profiles').select('id').limit(1)
check('service-role key can read administrator-only tables (bypasses RLS)', !serviceSelect.error)

if (failed) {
  console.error('\nOne or more checks failed.')
  process.exit(1)
}

console.log('\nAll checks passed.')
