// Creates the first (or an additional) Administrator account. Operator-run
// only - never reachable from the app. Run with:
//   node --env-file=.env scripts/create-admin.mjs --email you@example.com --password '...'
import { createClient } from '@supabase/supabase-js'

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg, i, all) => {
    if (!arg.startsWith('--')) return []
    return [[arg.slice(2), all[i + 1]]]
  })
)

const { email, password } = args

if (!email || !password) {
  console.error('Usage: node --env-file=.env scripts/create-admin.mjs --email <email> --password <password>')
  process.exit(1)
}

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error('Missing NUXT_PUBLIC_SUPABASE_URL or NUXT_SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true
})

if (createError) {
  console.error(`Failed to create the auth user: ${createError.message}`)
  process.exit(1)
}

const { error: profileError } = await supabase
  .from('profiles')
  .insert({ id: created.user.id, role: 'administrator' })

if (profileError) {
  console.error(`Auth user created, but failed to create the profile: ${profileError.message}`)
  process.exit(1)
}

console.log(`Administrator created: ${email}`)
