// Simulates N concurrent attendees issuing rapid question/vote bursts
// against a real, already-live, dedicated test event - never a production
// event. Drives the app's real HTTP API exactly as a browser would, so it
// measures the actual deployed request path.
//
// Usage:
//   node --env-file=.env scripts/load-test.mjs --url http://localhost:3000 --slug my-test-event --clients 100 --duration 60
//
// The test event must already exist, be live, have submissions and voting
// open, and its abuse-protection tier set to "open" - otherwise the app's
// own rate limiter throttles simulated attendees and the test measures the
// rate limiter instead of real capacity.
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { createClient } from '@supabase/supabase-js'

function parseArgs(argv) {
  const args = { clients: 100, duration: 60 }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--url') args.url = argv[++i]
    else if (arg === '--slug') args.slug = argv[++i]
    else if (arg === '--clients') args.clients = Number(argv[++i])
    else if (arg === '--duration') args.duration = Number(argv[++i])
  }

  return args
}

const args = parseArgs(process.argv.slice(2))

if (!args.url || !args.slug) {
  console.error('Usage: node --env-file=.env scripts/load-test.mjs --url <app-base-url> --slug <test-event-slug> [--clients 100] [--duration 60]')
  process.exit(1)
}

const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing NUXT_PUBLIC_SUPABASE_URL or NUXT_PUBLIC_SUPABASE_ANON_KEY.')
  process.exit(1)
}

const stats = {
  join: [],
  list: [],
  questions: [],
  votes: [],
  realtimeConnect: []
}

const errors = {
  join: 0,
  list: 0,
  questions: 0,
  votes: 0,
  realtime: 0
}

function randomDelayMs() {
  return 200 + Math.random() * 1800
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function timedFetch(url, options, statKey) {
  const start = performance.now()

  try {
    const response = await fetch(url, options)
    const body = await response.json()
    stats[statKey].push(performance.now() - start)

    if (!response.ok || !body.success) {
      errors[statKey]++
      return null
    }

    return body.data
  } catch {
    stats[statKey].push(performance.now() - start)
    errors[statKey]++
    return null
  }
}

function connectRealtimePresence(eventId) {
  return new Promise((resolve) => {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
    const start = performance.now()
    let settled = false

    const channel = supabase.channel(`event:${eventId}:questions`)

    const finish = (connected) => {
      if (settled) return
      settled = true

      if (connected) {
        stats.realtimeConnect.push(performance.now() - start)
        channel.track({ role: 'attendee' })
      } else {
        errors.realtime++
      }

      resolve(() => supabase.removeChannel(channel))
    }

    const timer = setTimeout(() => finish(false), 10000)

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        finish(true)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer)
        finish(false)
      }
    })
  })
}

async function runClient(eventContext) {
  const token = randomUUID()

  const joinResult = await timedFetch(`${args.url}/api/attendees/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: eventContext.id, token })
  }, 'join')

  if (!joinResult) return

  const disconnectRealtime = await connectRealtimePresence(eventContext.id)

  const deadline = Date.now() + args.duration * 1000
  const knownQuestionIds = []

  while (Date.now() < deadline) {
    await sleep(randomDelayMs())

    const listResult = await timedFetch(`${args.url}/api/events/${args.slug}/questions?sort=newest&token=${encodeURIComponent(token)}`, {}, 'list')
    for (const q of listResult?.questions ?? []) {
      if (!knownQuestionIds.includes(q.id)) knownQuestionIds.push(q.id)
    }

    const submitQuestion = knownQuestionIds.length === 0 || Math.random() < 0.5

    if (submitQuestion) {
      const text = `Load test question ${randomUUID()}`.slice(0, eventContext.questionMaxLength)

      const result = await timedFetch(`${args.url}/api/questions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: eventContext.id, token, text })
      }, 'questions')

      if (result?.questionId) knownQuestionIds.push(result.questionId)
    } else {
      const questionId = knownQuestionIds[Math.floor(Math.random() * knownQuestionIds.length)]

      await timedFetch(`${args.url}/api/votes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: eventContext.id, token, questionId })
      }, 'votes')
    }
  }

  disconnectRealtime()
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * p))
  return sortedValues[index]
}

function summarizeLatency(label, values) {
  if (values.length === 0) {
    console.log(`${label}: no requests recorded`)
    return
  }

  const sorted = [...values].sort((a, b) => a - b)
  const fmt = ms => `${ms.toFixed(0)}ms`

  console.log(
    `${label}: ${values.length} requests - `
    + `p50 ${fmt(percentile(sorted, 0.5))}, `
    + `p95 ${fmt(percentile(sorted, 0.95))}, `
    + `p99 ${fmt(percentile(sorted, 0.99))}, `
    + `max ${fmt(sorted[sorted.length - 1])}`
  )
}

function printSummary() {
  console.log('\n--- Load test summary ---')
  summarizeLatency('Join', stats.join)
  console.log(`  errors: ${errors.join}`)
  summarizeLatency('List questions', stats.list)
  console.log(`  errors: ${errors.list}`)
  summarizeLatency('Questions', stats.questions)
  console.log(`  errors: ${errors.questions}`)
  summarizeLatency('Votes', stats.votes)
  console.log(`  errors: ${errors.votes}`)
  summarizeLatency('Realtime connect', stats.realtimeConnect)
  console.log(`  errors: ${errors.realtime}`)
}

async function main() {
  const eventResponse = await fetch(`${args.url}/api/events/${args.slug}`)
  const eventBody = await eventResponse.json()

  if (!eventResponse.ok || !eventBody.success) {
    console.error(`Could not resolve event "${args.slug}": ${eventBody.error ?? 'unknown error'}`)
    process.exit(1)
  }

  const eventContext = eventBody.data

  console.log(`Simulating ${args.clients} concurrent attendees for ${args.duration}s against "${args.slug}"...`)

  await Promise.all(
    Array.from({ length: args.clients }, () => runClient(eventContext))
  )

  console.log('Done.')
  printSummary()
  process.exit(0)
}

main()
