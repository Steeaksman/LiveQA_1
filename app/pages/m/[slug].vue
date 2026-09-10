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
  topicName: string | null
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

interface BulkActionResponse {
  success: boolean
  data: { updatedCount: number, skippedCount: number } | null
  error: string | null
}

interface Topic {
  id: string
  name: string
  sortOrder: number
  isCurrent: boolean
}

interface TopicsResponse {
  success: boolean
  data: { topics: Topic[] } | null
  error: string | null
}

interface CreateTopicResponse {
  success: boolean
  data: Topic | null
  error: string | null
}

type TopicAction = 'rename' | 'set_current' | 'delete' | 'move_up' | 'move_down'

interface TopicActionResponse {
  success: boolean
  data: null
  error: string | null
}

const ACTION_LABELS: Record<ModerationAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  hide: 'Hide',
  publish: 'Publish',
  mark_answered: 'Mark answered',
  unmark_answered: 'Unmark answered',
  archive: 'Archive',
  unarchive: 'Unarchive'
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

const topics = ref<Topic[]>([])
const topicsError = ref<string | null>(null)
const newTopicName = ref('')
const addingTopic = ref(false)
const topicActionLoading = ref<string | null>(null)
const renamingTopicId = ref<string | null>(null)
const renameTopicName = ref('')

async function loadTopics() {
  if (!sessionToken.value) return
  topicsError.value = null

  try {
    const result = await $fetch<TopicsResponse>(`/api/events/${slug}/moderation/topics`, {
      query: { token: sessionToken.value }
    })

    if (!result.success || !result.data) {
      topicsError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    topics.value = result.data.topics
  } catch (err) {
    const data = (err as { data?: TopicsResponse })?.data
    topicsError.value = data?.error ?? 'Something went wrong. Please try again.'
  }
}

async function addTopic() {
  if (!sessionToken.value || !newTopicName.value.trim()) return
  topicsError.value = null
  addingTopic.value = true

  try {
    const result = await $fetch<CreateTopicResponse>(`/api/events/${slug}/moderation/topics`, {
      method: 'POST',
      body: { token: sessionToken.value, name: newTopicName.value }
    })

    if (!result.success) {
      topicsError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    newTopicName.value = ''
    await loadTopics()
  } catch (err) {
    const data = (err as { data?: CreateTopicResponse })?.data
    topicsError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    addingTopic.value = false
  }
}

async function performTopicAction(topicId: string, action: TopicAction, name?: string) {
  if (!sessionToken.value) return
  topicsError.value = null
  topicActionLoading.value = topicId

  try {
    const result = await $fetch<TopicActionResponse>(`/api/events/${slug}/moderation/topics/action`, {
      method: 'POST',
      body: { token: sessionToken.value, topicId, action, name }
    })

    if (!result.success) {
      topicsError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    if (action === 'rename') renamingTopicId.value = null
    await loadTopics()
  } catch (err) {
    const data = (err as { data?: TopicActionResponse })?.data
    topicsError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    topicActionLoading.value = null
  }
}

function startRename(topic: Topic) {
  renamingTopicId.value = topic.id
  renameTopicName.value = topic.name
}

function submitRename(topicId: string) {
  if (!renameTopicName.value.trim()) return
  performTopicAction(topicId, 'rename', renameTopicName.value)
}

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
        await Promise.all([loadQueue(), loadTopics()])
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

const selectedIds = ref<Set<string>>(new Set())
const bulkApplying = ref(false)
const bulkError = ref<string | null>(null)
const bulkSummary = ref<string | null>(null)

const allSelected = computed(() => questions.value.length > 0 && selectedIds.value.size === questions.value.length)

function toggleSelected(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleSelectAll(checked: boolean) {
  selectedIds.value = checked ? new Set(questions.value.map(q => q.id)) : new Set()
}

async function runBulkAction(action: ModerationAction, questionIds: string[]) {
  if (!sessionToken.value || questionIds.length === 0) return
  bulkError.value = null
  bulkSummary.value = null
  bulkApplying.value = true

  try {
    const result = await $fetch<BulkActionResponse>(`/api/events/${slug}/moderation/questions/bulk-action`, {
      method: 'POST',
      body: { token: sessionToken.value, questionIds, action }
    })

    if (!result.success || !result.data) {
      bulkError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    bulkSummary.value = `Applied to ${result.data.updatedCount} of ${questionIds.length} selected.`
    selectedIds.value = new Set()
    await loadQueue()
  } catch (err) {
    const data = (err as { data?: BulkActionResponse })?.data
    bulkError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    bulkApplying.value = false
  }
}

function performBulkAction(action: ModerationAction) {
  runBulkAction(action, [...selectedIds.value])
}

const unansweredCount = computed(() => questions.value.filter(q => !q.answered && !q.archived).length)

function archiveAllUnanswered() {
  const ids = questions.value.filter(q => !q.answered && !q.archived).map(q => q.id)
  if (ids.length === 0) return
  if (!window.confirm(`Archive ${ids.length} unanswered questions? You can undo this by unarchiving them individually.`)) return
  runBulkAction('archive', ids)
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
    await Promise.all([loadQueue(), loadTopics()])
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

      <UCard class="mb-4">
        <h2 class="mb-2 font-semibold">
          Topics
        </h2>
        <div class="flex flex-col gap-2">
          <div v-for="(t, i) in topics" :key="t.id" class="flex items-center gap-2">
            <template v-if="renamingTopicId === t.id">
              <UInput v-model="renameTopicName" size="sm" @keyup.enter="submitRename(t.id)" />
              <UButton size="sm" label="Save" :loading="topicActionLoading === t.id" @click="submitRename(t.id)" />
              <UButton size="sm" variant="ghost" label="Cancel" @click="renamingTopicId = null" />
            </template>
            <template v-else>
              <span class="flex-1" :class="{ 'font-semibold': t.isCurrent }">{{ t.name }}</span>
              <span v-if="t.isCurrent" class="text-xs text-gray-500">Current</span>
              <UButton
                v-else
                size="sm"
                label="Set current"
                :loading="topicActionLoading === t.id"
                @click="performTopicAction(t.id, 'set_current')"
              />
              <UButton size="sm" variant="ghost" label="Up" :disabled="i === 0" @click="performTopicAction(t.id, 'move_up')" />
              <UButton size="sm" variant="ghost" label="Down" :disabled="i === topics.length - 1" @click="performTopicAction(t.id, 'move_down')" />
              <UButton size="sm" variant="ghost" label="Rename" @click="startRename(t)" />
              <UButton size="sm" variant="ghost" color="error" label="Delete" @click="performTopicAction(t.id, 'delete')" />
            </template>
          </div>
          <p v-if="topics.length === 0" class="text-sm text-gray-500">
            No topics yet.
          </p>
          <UAlert v-if="topicsError" color="error" variant="subtle" :title="topicsError" />
          <div class="flex gap-2">
            <UInput v-model="newTopicName" placeholder="New topic name" size="sm" @keyup.enter="addTopic" />
            <UButton size="sm" label="Add topic" :loading="addingTopic" @click="addTopic" />
          </div>
        </div>
      </UCard>

      <UButton
        label="Archive All Unanswered"
        color="error"
        variant="subtle"
        class="mb-4"
        :disabled="unansweredCount === 0"
        :loading="bulkApplying"
        @click="archiveAllUnanswered"
      />

      <UAlert v-if="queueError" color="error" variant="subtle" :title="queueError" class="mb-4" />

      <p v-if="!loadingQueue && questions.length === 0" class="text-sm text-gray-500">
        No questions yet.
      </p>

      <div v-if="questions.length > 0" class="mb-2 flex items-center gap-2">
        <UCheckbox :model-value="allSelected" @update:model-value="toggleSelectAll" />
        <span class="text-sm text-gray-500">Select all</span>
      </div>

      <div v-if="selectedIds.size > 0" class="mb-4 flex flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="(label, action) in ACTION_LABELS"
            :key="action"
            size="sm"
            :label="label"
            :loading="bulkApplying"
            @click="performBulkAction(action as ModerationAction)"
          />
        </div>
        <UAlert v-if="bulkError" color="error" variant="subtle" :title="bulkError" />
        <UAlert v-if="bulkSummary" color="success" variant="subtle" :title="bulkSummary" />
      </div>

      <div class="flex flex-col gap-3">
        <UCard v-for="q in questions" :key="q.id">
          <div class="flex items-start gap-2">
            <UCheckbox :model-value="selectedIds.has(q.id)" @update:model-value="(checked) => toggleSelected(q.id, !!checked)" />
            <p class="whitespace-pre-wrap">
              {{ q.text }}
            </p>
          </div>
          <p v-if="q.displayName || q.attendeeType" class="text-sm text-gray-500">
            {{ [q.displayName, q.attendeeType].filter(Boolean).join(' - ') }}
          </p>
          <p class="text-sm text-gray-500">
            {{ q.approvalStatus }} - {{ q.visibility }}
            <template v-if="q.answered"> - answered</template>
            <template v-if="q.archived"> - archived</template>
            <template v-if="q.topicName"> - {{ q.topicName }}</template>
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
