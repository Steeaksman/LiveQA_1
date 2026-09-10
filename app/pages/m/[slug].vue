<script setup lang="ts">
interface EventContext {
  id: string
  name: string
}

interface EventContextResponse {
  success: boolean
  data: EventContext | null
  error: string | null
}

interface ModeratorLoginResponse {
  success: boolean
  data: { sessionToken: string, expiresAt: string } | null
  error: string | null
}

interface ModeratorSessionResponse {
  success: boolean
  data: { valid: boolean } | null
  error: string | null
}

type ApprovalStatus = 'pending' | 'approved' | 'rejected'
type Visibility = 'hidden' | 'public'

interface ModerationQuestion {
  id: string
  text: string
  createdAt: string
  approvalStatus: ApprovalStatus
  visibility: Visibility
  answered: boolean
  archived: boolean
  voteCount: number
  displayName: string | null
  attendeeType: string | null
}

interface ModerationQuestionsResponse {
  success: boolean
  data: { questions: ModerationQuestion[], submissionsOpen: boolean, votingOpen: boolean } | null
  error: string | null
}

type ModerationAction =
  | 'approve'
  | 'reject'
  | 'hide'
  | 'publish'
  | 'mark_answered'
  | 'unmark_answered'
  | 'archive'
  | 'unarchive'

interface ModerationActionResponse {
  success: boolean
  data: { questionId: string, approvalStatus: ApprovalStatus, visibility: Visibility, answered: boolean, archived: boolean } | null
  error: string | null
}

interface EventControlsResponse {
  success: boolean
  data: null
  error: string | null
}

const route = useRoute()
const slug = route.params.slug as string

const { data: response } = await useFetch<EventContextResponse>(`/api/events/${slug}`)

const context = computed(() => response.value?.data ?? null)
const notFound = computed(() => !response.value?.success)

const checkingSession = ref(true)
const authenticated = ref(false)
const sessionToken = ref<string | null>(null)
const password = ref('')
const loggingIn = ref(false)
const loginError = ref<string | null>(null)

const questions = ref<ModerationQuestion[]>([])
const submissionsOpen = ref(false)
const votingOpen = ref(false)
const loadingQueue = ref(false)
const queueError = ref<string | null>(null)
const controlsError = ref<string | null>(null)
const actionErrors = ref<Record<string, string>>({})
const actioningQuestionId = ref<string | null>(null)

async function loadQueue() {
  if (!sessionToken.value) return
  loadingQueue.value = true
  queueError.value = null

  try {
    const result = await $fetch<ModerationQuestionsResponse>(`/api/events/${slug}/moderation/questions`, {
      query: { token: sessionToken.value }
    })

    if (!result.success || !result.data) {
      queueError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    questions.value = result.data.questions
    submissionsOpen.value = result.data.submissionsOpen
    votingOpen.value = result.data.votingOpen
  } catch (err) {
    const data = (err as { data?: ModerationQuestionsResponse })?.data
    queueError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    loadingQueue.value = false
  }
}

onMounted(async () => {
  if (!context.value) {
    checkingSession.value = false
    return
  }

  const stored = getStoredModeratorSession(context.value.id)

  if (stored) {
    try {
      const result = await $fetch<ModeratorSessionResponse>(`/api/events/${slug}/moderator-session`, {
        query: { token: stored.sessionToken }
      })

      if (result.data?.valid) {
        sessionToken.value = stored.sessionToken
        authenticated.value = true
        await loadQueue()
      } else {
        clearStoredModeratorSession(context.value.id)
      }
    } catch {
      clearStoredModeratorSession(context.value.id)
    }
  }

  checkingSession.value = false
})

function availableActions(q: ModerationQuestion): { action: ModerationAction, label: string }[] {
  const actions: { action: ModerationAction, label: string }[] = []

  if (q.approvalStatus !== 'approved') actions.push({ action: 'approve', label: 'Approve' })
  if (q.approvalStatus !== 'rejected') actions.push({ action: 'reject', label: 'Reject' })
  if (q.approvalStatus === 'approved' && q.visibility !== 'public') actions.push({ action: 'publish', label: 'Publish' })
  if (q.visibility !== 'hidden') actions.push({ action: 'hide', label: 'Hide' })
  if (q.approvalStatus === 'approved' && !q.answered) actions.push({ action: 'mark_answered', label: 'Mark answered' })
  if (q.answered) actions.push({ action: 'unmark_answered', label: 'Unmark answered' })
  if (!q.archived) actions.push({ action: 'archive', label: 'Archive' })
  if (q.archived) actions.push({ action: 'unarchive', label: 'Unarchive' })

  return actions
}

async function performAction(questionId: string, action: ModerationAction) {
  if (!sessionToken.value) return
  actionErrors.value = { ...actionErrors.value, [questionId]: '' }
  actioningQuestionId.value = questionId

  try {
    const result = await $fetch<ModerationActionResponse>(`/api/events/${slug}/moderation/questions/action`, {
      method: 'POST',
      body: { token: sessionToken.value, questionId, action }
    })

    if (!result.success) {
      actionErrors.value = { ...actionErrors.value, [questionId]: result.error ?? 'Something went wrong. Please try again.' }
      return
    }

    await loadQueue()
  } catch (err) {
    const data = (err as { data?: ModerationActionResponse })?.data
    actionErrors.value = { ...actionErrors.value, [questionId]: data?.error ?? 'Something went wrong. Please try again.' }
  } finally {
    actioningQuestionId.value = null
  }
}

async function updateControl(field: 'submissionsOpen' | 'votingOpen', value: boolean) {
  if (!sessionToken.value) return
  controlsError.value = null

  const previous = field === 'submissionsOpen' ? submissionsOpen.value : votingOpen.value
  if (field === 'submissionsOpen') submissionsOpen.value = value
  else votingOpen.value = value

  try {
    const result = await $fetch<EventControlsResponse>(`/api/events/${slug}/moderation/event-controls`, {
      method: 'POST',
      body: { token: sessionToken.value, [field]: value }
    })

    if (!result.success) {
      controlsError.value = result.error ?? 'Something went wrong. Please try again.'
      if (field === 'submissionsOpen') submissionsOpen.value = previous
      else votingOpen.value = previous
    }
  } catch (err) {
    const data = (err as { data?: EventControlsResponse })?.data
    controlsError.value = data?.error ?? 'Something went wrong. Please try again.'
    if (field === 'submissionsOpen') submissionsOpen.value = previous
    else votingOpen.value = previous
  }
}

async function login() {
  if (!context.value) return
  loginError.value = null
  loggingIn.value = true

  try {
    const result = await $fetch<ModeratorLoginResponse>(`/api/events/${slug}/moderator-login`, {
      method: 'POST',
      body: { password: password.value }
    })

    if (!result.success || !result.data) {
      loginError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    setStoredModeratorSession(context.value.id, {
      sessionToken: result.data.sessionToken,
      expiresAt: result.data.expiresAt
    })
    sessionToken.value = result.data.sessionToken
    authenticated.value = true
    await loadQueue()
  } catch (err) {
    const data = (err as { data?: ModeratorLoginResponse })?.data
    loginError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    loggingIn.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm p-6">
    <div v-if="notFound">
      <p>Event not found.</p>
    </div>

    <div v-else-if="checkingSession" />

    <div v-else-if="authenticated" class="mx-auto max-w-2xl">
      <h1 class="mb-4 text-xl font-semibold">
        {{ context?.name }}
      </h1>

      <div class="mb-4 flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span>Submissions open</span>
          <USwitch :model-value="submissionsOpen" @update:model-value="(value) => updateControl('submissionsOpen', value)" />
        </div>
        <div class="flex items-center justify-between">
          <span>Voting open</span>
          <USwitch :model-value="votingOpen" @update:model-value="(value) => updateControl('votingOpen', value)" />
        </div>
        <UAlert v-if="controlsError" color="error" variant="subtle" :title="controlsError" />
      </div>

      <UAlert v-if="queueError" color="error" variant="subtle" :title="queueError" class="mb-4" />

      <p v-if="!loadingQueue && questions.length === 0" class="text-sm text-gray-500">
        No questions yet.
      </p>

      <div class="flex flex-col gap-3">
        <UCard v-for="q in questions" :key="q.id">
          <p class="whitespace-pre-wrap">
            {{ q.text }}
          </p>
          <p v-if="q.displayName || q.attendeeType" class="text-sm text-gray-500">
            {{ [q.displayName, q.attendeeType].filter(Boolean).join(' - ') }}
          </p>
          <p class="text-sm text-gray-500">
            {{ q.approvalStatus }} - {{ q.visibility }}
            <template v-if="q.answered"> - answered</template>
            <template v-if="q.archived"> - archived</template>
            - {{ q.voteCount }} votes
          </p>
          <UAlert v-if="actionErrors[q.id]" color="error" variant="subtle" :title="actionErrors[q.id]" class="mt-2" />
          <div class="mt-2 flex flex-wrap gap-2">
            <UButton
              v-for="a in availableActions(q)"
              :key="a.action"
              size="sm"
              :label="a.label"
              :loading="actioningQuestionId === q.id"
              @click="performAction(q.id, a.action)"
            />
          </div>
        </UCard>
      </div>
    </div>

    <div v-else>
      <h1 class="mb-4 text-xl font-semibold">
        {{ context?.name }}
      </h1>
      <UForm :state="{}" class="flex flex-col gap-3" @submit="login">
        <UFormField label="Moderator password" required>
          <UInput v-model="password" type="password" @keyup.enter="login" />
        </UFormField>
        <UAlert v-if="loginError" color="error" variant="subtle" :title="loginError" />
        <UButton type="submit" :loading="loggingIn" label="Enter" class="self-start" />
      </UForm>
    </div>
  </div>
</template>
