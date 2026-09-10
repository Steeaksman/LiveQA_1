<script setup lang="ts">
interface AttendeeTypeOption {
  id: string
  label: string
}

interface EventContext {
  id: string
  name: string
  welcomeText: string | null
  accentColor: string | null
  backgroundColor: string | null
  themeMode: 'light' | 'dark' | 'system'
  requireAttendeeName: boolean
  requireAttendeeType: boolean
  attendeeTypes: AttendeeTypeOption[]
  moderationMode: 'immediate' | 'queue'
  questionMaxLength: number
  submissionsOpen: boolean
  votingOpen: boolean
  duplicateCheckStrictness: 'off' | 'low' | 'medium' | 'high'
  anonymityMode: 'named' | 'optional' | 'always'
}

interface EventContextResponse {
  success: boolean
  data: EventContext | null
  error: string | null
}

interface JoinResponse {
  success: boolean
  data: { attendeeId: string } | null
  error: string | null
}

interface ReplyRow {
  id: string
  text: string
  createdAt: string
  displayName: string | null
}

interface QuestionRow {
  id: string
  text: string
  voteCount: number | null
  hasVoted: boolean
  reported: boolean
  displayName: string | null
  attendeeType: string | null
  replies: ReplyRow[]
}

interface QuestionsResponse {
  success: boolean
  data: { questions: QuestionRow[] } | null
  error: string | null
}

interface SubmitQuestionResponse {
  success: boolean
  data: { questionId: string } | null
  error: string | null
}

interface VoteResponse {
  success: boolean
  data: { voted: boolean } | null
  error: string | null
}

interface ReportResponse {
  success: boolean
  data: { reported: boolean } | null
  error: string | null
}

interface SubmitReplyResponse {
  success: boolean
  data: { replyId: string } | null
  error: string | null
}

interface SimilarQuestion {
  id: string
  text: string
  score: number
}

interface DuplicateQuestionsResponse {
  success: boolean
  data: { questions: SimilarQuestion[] } | null
  error: string | null
}

interface MyQuestionRow {
  id: string
  text: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
  visibility: 'hidden' | 'public'
  canModify: boolean
}

interface MyQuestionsResponse {
  success: boolean
  data: { questions: MyQuestionRow[] } | null
  error: string | null
}

interface EditQuestionResponse {
  success: boolean
  data: { questionId: string } | null
  error: string | null
}

interface DeleteQuestionResponse {
  success: boolean
  data: { questionId: string } | null
  error: string | null
}

type SortOption = 'votes' | 'newest' | 'oldest'

const route = useRoute()
const slug = route.params.slug as string

const { data: response } = await useFetch<EventContextResponse>(`/api/events/${slug}`)

const sort = ref<SortOption>('newest')
const voteToken = ref<string | undefined>(undefined)
const searchInput = ref('')
const searchTerm = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

watch(searchInput, (value) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    searchTerm.value = value.trim()
  }, 400)
})

const { data: questionsResponse, refresh: refreshQuestions } = await useFetch<QuestionsResponse>(`/api/events/${slug}/questions`, {
  query: computed(() => ({ sort: sort.value, token: voteToken.value, search: searchTerm.value || undefined }))
})

const { data: myQuestionsResponse, refresh: refreshMyQuestions } = await useFetch<MyQuestionsResponse>(`/api/events/${slug}/my-questions`, {
  query: computed(() => ({ token: voteToken.value }))
})

const myQuestions = computed(() => myQuestionsResponse.value?.data?.questions ?? [])

const context = computed(() => response.value?.data ?? null)
const notFound = computed(() => !response.value?.success)
const questions = computed(() => questionsResponse.value?.data?.questions ?? [])

const sortOptions = [
  { label: 'Most votes', value: 'votes' },
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' }
]

const joined = ref(false)
const displayName = ref('')
const attendeeTypeId = ref<string | null>(null)
const joining = ref(false)
const joinError = ref<string | null>(null)

const connectionStatus = ref<'connected' | 'reconnecting'>('reconnecting')

onMounted(() => {
  if (context.value) {
    const identity = getDeviceIdentity(context.value.id)
    joined.value = identity.joined
    voteToken.value = identity.token
  }
})

onMounted(() => {
  if (!context.value) return

  const supabase = useSupabase()
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let fallbackPollTimer: ReturnType<typeof setInterval> | undefined
  let hasConnectedBefore = false

  function scheduleRefresh() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      refreshQuestions()
    }, 500)
  }

  function startFallbackPoll() {
    if (fallbackPollTimer) return
    fallbackPollTimer = setInterval(() => {
      refreshQuestions()
    }, 15000)
  }

  function stopFallbackPoll() {
    if (fallbackPollTimer) {
      clearInterval(fallbackPollTimer)
      fallbackPollTimer = undefined
    }
  }

  const channel = supabase
    .channel(`event:${context.value.id}:questions`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: `event_id=eq.${context.value.id}` }, scheduleRefresh)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `event_id=eq.${context.value.id}` }, scheduleRefresh)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        connectionStatus.value = 'connected'
        channel.track({ role: 'attendee' })
        stopFallbackPoll()
        if (hasConnectedBefore) refreshQuestions()
        hasConnectedBefore = true
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        connectionStatus.value = 'reconnecting'
        startFallbackPoll()
      }
    })

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    stopFallbackPoll()
    supabase.removeChannel(channel)
  })
})

async function join() {
  if (!context.value) return
  joinError.value = null

  if (context.value.requireAttendeeName && !displayName.value.trim()) {
    joinError.value = 'Please enter your name.'
    return
  }

  if (context.value.requireAttendeeType && context.value.attendeeTypes.length > 0 && !attendeeTypeId.value) {
    joinError.value = 'Please choose your attendee type.'
    return
  }

  joining.value = true

  try {
    const identity = getDeviceIdentity(context.value.id)

    const result = await $fetch<JoinResponse>('/api/attendees/join', {
      method: 'POST',
      body: {
        eventId: context.value.id,
        token: identity.token,
        displayName: displayName.value.trim() || undefined,
        attendeeTypeId: attendeeTypeId.value ?? undefined
      }
    })

    if (!result.success) {
      joinError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    markDeviceJoined(context.value.id)
    joined.value = true
  } catch (err) {
    const data = (err as { data?: JoinResponse })?.data
    joinError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    joining.value = false
  }
}

const questionText = ref('')
const askAnonymously = ref(false)
const submitting = ref(false)
const submitError = ref<string | null>(null)
const submitConfirmation = ref<string | null>(null)

const similarQuestions = ref<SimilarQuestion[]>([])
let duplicateCheckTimer: ReturnType<typeof setTimeout> | undefined

watch(questionText, (text) => {
  if (duplicateCheckTimer) clearTimeout(duplicateCheckTimer)

  if (!context.value || context.value.duplicateCheckStrictness === 'off' || text.trim().length < 5) {
    similarQuestions.value = []
    return
  }

  duplicateCheckTimer = setTimeout(async () => {
    const result = await $fetch<DuplicateQuestionsResponse>(`/api/events/${slug}/duplicate-questions`, {
      query: { text: text.trim() }
    })
    similarQuestions.value = result.data?.questions ?? []
  }, 400)
})

async function submitQuestion() {
  if (!context.value) return
  submitError.value = null
  submitConfirmation.value = null

  if (!questionText.value.trim()) {
    submitError.value = 'Please enter a question.'
    return
  }

  submitting.value = true

  try {
    const identity = getDeviceIdentity(context.value.id)

    const result = await $fetch<SubmitQuestionResponse>('/api/questions', {
      method: 'POST',
      body: {
        eventId: context.value.id,
        token: identity.token,
        text: questionText.value.trim(),
        anonymous: askAnonymously.value
      }
    })

    if (!result.success) {
      submitError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    questionText.value = ''
    askAnonymously.value = false
    similarQuestions.value = []
    submitConfirmation.value = context.value.moderationMode === 'immediate'
      ? 'Your question was submitted!'
      : 'Your question was submitted and will appear once approved.'
    await refreshQuestions()
  } catch (err) {
    const data = (err as { data?: SubmitQuestionResponse })?.data
    submitError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}

const votingQuestionId = ref<string | null>(null)
const voteError = ref<string | null>(null)

async function upvote(questionId: string) {
  if (!context.value) return
  voteError.value = null
  votingQuestionId.value = questionId

  try {
    const identity = getDeviceIdentity(context.value.id)

    const result = await $fetch<VoteResponse>('/api/votes', {
      method: 'POST',
      body: {
        eventId: context.value.id,
        token: identity.token,
        questionId
      }
    })

    if (!result.success) {
      voteError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    const target = questionsResponse.value?.data?.questions.find(q => q.id === questionId)
    if (target && !target.hasVoted) {
      target.hasVoted = true
      if (target.voteCount !== null) target.voteCount += 1
    }
  } catch (err) {
    const data = (err as { data?: VoteResponse })?.data
    voteError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    votingQuestionId.value = null
  }
}

const reportingQuestionId = ref<string | null>(null)
const reportError = ref<string | null>(null)

async function reportQuestion(questionId: string) {
  if (!context.value) return
  reportError.value = null
  reportingQuestionId.value = questionId

  try {
    const identity = getDeviceIdentity(context.value.id)

    const result = await $fetch<ReportResponse>('/api/questions/report', {
      method: 'POST',
      body: {
        eventId: context.value.id,
        token: identity.token,
        questionId
      }
    })

    if (!result.success) {
      reportError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    const target = questionsResponse.value?.data?.questions.find(q => q.id === questionId)
    if (target) target.reported = true
  } catch (err) {
    const data = (err as { data?: ReportResponse })?.data
    reportError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    reportingQuestionId.value = null
  }
}

const replyText = ref<Record<string, string>>({})
const submittingReplyQuestionId = ref<string | null>(null)
const replyError = ref<string | null>(null)

async function submitReply(questionId: string) {
  if (!context.value) return
  const text = (replyText.value[questionId] ?? '').trim()
  if (!text) return

  replyError.value = null
  submittingReplyQuestionId.value = questionId

  try {
    const identity = getDeviceIdentity(context.value.id)

    const result = await $fetch<SubmitReplyResponse>('/api/replies', {
      method: 'POST',
      body: {
        eventId: context.value.id,
        token: identity.token,
        questionId,
        text
      }
    })

    if (!result.success) {
      replyError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    replyText.value[questionId] = ''
    await refreshQuestions()
  } catch (err) {
    const data = (err as { data?: SubmitReplyResponse })?.data
    replyError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    submittingReplyQuestionId.value = null
  }
}

const editingQuestionId = ref<string | null>(null)
const editText = ref('')
const savingEdit = ref(false)
const editError = ref<string | null>(null)
const deletingQuestionId = ref<string | null>(null)
const deleteError = ref<string | null>(null)

function startEdit(question: MyQuestionRow) {
  editingQuestionId.value = question.id
  editText.value = question.text
  editError.value = null
}

function cancelEdit() {
  editingQuestionId.value = null
  editError.value = null
}

async function saveEdit(questionId: string) {
  if (!context.value) return
  editError.value = null

  if (!editText.value.trim()) {
    editError.value = 'Please enter a question.'
    return
  }

  savingEdit.value = true

  try {
    const identity = getDeviceIdentity(context.value.id)

    const result = await $fetch<EditQuestionResponse>('/api/questions/edit', {
      method: 'POST',
      body: {
        eventId: context.value.id,
        token: identity.token,
        questionId,
        text: editText.value.trim()
      }
    })

    if (!result.success) {
      editError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    editingQuestionId.value = null
    await Promise.all([refreshQuestions(), refreshMyQuestions()])
  } catch (err) {
    const data = (err as { data?: EditQuestionResponse })?.data
    editError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    savingEdit.value = false
  }
}

async function deleteQuestion(questionId: string) {
  if (!context.value) return
  deleteError.value = null
  deletingQuestionId.value = questionId

  try {
    const identity = getDeviceIdentity(context.value.id)

    const result = await $fetch<DeleteQuestionResponse>('/api/questions/delete', {
      method: 'POST',
      body: {
        eventId: context.value.id,
        token: identity.token,
        questionId
      }
    })

    if (!result.success) {
      deleteError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    await Promise.all([refreshQuestions(), refreshMyQuestions()])
  } catch (err) {
    const data = (err as { data?: DeleteQuestionResponse })?.data
    deleteError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    deletingQuestionId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <p v-if="notFound">
      Event not found.
    </p>

    <div v-else-if="context">
      <h1 class="mb-4 text-xl font-semibold">
        {{ context.name }}
      </h1>

      <UCard v-if="joined" class="mb-4">
        <div class="flex flex-col gap-3">
          <p v-if="context.welcomeText">
            {{ context.welcomeText }}
          </p>
          <p v-if="!context.submissionsOpen" class="text-sm text-gray-500">
            Submissions are currently closed.
          </p>
          <template v-else>
            <UFormField :label="`Ask a question (max ${context.questionMaxLength} characters)`">
              <UTextarea v-model="questionText" :maxlength="context.questionMaxLength" />
            </UFormField>
            <div v-if="context.anonymityMode === 'optional'" class="flex items-center justify-between">
              <span>Ask anonymously</span>
              <USwitch v-model="askAnonymously" />
            </div>
            <div v-if="similarQuestions.length > 0" class="flex flex-col gap-1">
              <p class="text-sm text-gray-500">
                Questions like this have already been asked:
              </p>
              <p v-for="similar in similarQuestions" :key="similar.id" class="text-sm text-gray-500">
                "{{ similar.text }}"
              </p>
            </div>
            <UAlert v-if="submitError" color="error" variant="subtle" :title="submitError" />
            <UAlert v-if="submitConfirmation" color="success" variant="subtle" :title="submitConfirmation" />
            <UButton :loading="submitting" label="Submit" class="self-start" @click="submitQuestion" />
          </template>
        </div>
      </UCard>

      <UCard v-else class="mb-4">
        <div class="flex flex-col gap-3">
          <p v-if="context.welcomeText">
            {{ context.welcomeText }}
          </p>
          <UFormField label="Your name" :required="context.requireAttendeeName">
            <UInput v-model="displayName" />
          </UFormField>
          <UFormField
            v-if="context.attendeeTypes.length > 0"
            label="Attendee type"
            :required="context.requireAttendeeType"
          >
            <USelect
              v-model="attendeeTypeId"
              :items="context.attendeeTypes.map(t => ({ label: t.label, value: t.id }))"
              value-key="value"
            />
          </UFormField>
          <UAlert v-if="joinError" color="error" variant="subtle" :title="joinError" />
          <UButton :loading="joining" label="Join" class="self-start" @click="join" />
        </div>
      </UCard>

      <div v-if="joined" class="mb-4">
        <h2 class="mb-3 font-medium">
          My Questions
        </h2>
        <UAlert v-if="editError" color="error" variant="subtle" :title="editError" class="mb-3" />
        <UAlert v-if="deleteError" color="error" variant="subtle" :title="deleteError" class="mb-3" />
        <div class="flex flex-col gap-2">
          <UCard v-for="question in myQuestions" :key="question.id">
            <div v-if="editingQuestionId === question.id" class="flex flex-col gap-2">
              <UTextarea v-model="editText" :maxlength="context.questionMaxLength" />
              <div class="flex gap-2">
                <UButton size="xs" :loading="savingEdit" label="Save" @click="saveEdit(question.id)" />
                <UButton size="xs" variant="ghost" label="Cancel" @click="cancelEdit" />
              </div>
            </div>
            <div v-else class="flex items-center justify-between gap-3">
              <div>
                <p class="whitespace-pre-wrap">
                  {{ question.text }}
                </p>
                <p class="text-sm text-gray-500">
                  {{ question.visibility === 'public' ? 'Public' : question.approvalStatus === 'rejected' ? 'Rejected' : 'Pending review' }}
                </p>
              </div>
              <div v-if="question.canModify" class="flex shrink-0 gap-2">
                <UButton size="xs" variant="subtle" label="Edit" @click="startEdit(question)" />
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  :loading="deletingQuestionId === question.id"
                  label="Delete"
                  @click="deleteQuestion(question.id)"
                />
              </div>
            </div>
          </UCard>
          <p v-if="myQuestions.length === 0" class="text-sm text-gray-500">
            You haven't asked anything yet.
          </p>
        </div>
      </div>

      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="font-medium">
          Questions
        </h2>
        <div class="flex items-center gap-2">
          <USelect v-model="sort" :items="sortOptions" value-key="value" size="sm" />
          <UButton size="xs" variant="subtle" label="Refresh" @click="refreshQuestions" />
        </div>
      </div>
      <p class="mb-3 text-sm text-gray-500">
        {{ connectionStatus === 'connected' ? 'Live' : 'Reconnecting...' }}
      </p>
      <UInput v-model="searchInput" placeholder="Search questions" class="mb-3 w-full" />
      <p v-if="!context.votingOpen" class="mb-3 text-sm text-gray-500">
        Voting is currently closed.
      </p>
      <UAlert v-if="voteError" color="error" variant="subtle" :title="voteError" class="mb-3" />
      <UAlert v-if="reportError" color="error" variant="subtle" :title="reportError" class="mb-3" />
      <UAlert v-if="replyError" color="error" variant="subtle" :title="replyError" class="mb-3" />
      <div class="flex flex-col gap-2">
        <UCard v-for="question in questions" :key="question.id">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="whitespace-pre-wrap">
                {{ question.text }}
              </p>
              <p v-if="question.displayName || question.attendeeType" class="text-sm text-gray-500">
                {{ [question.displayName, question.attendeeType].filter(Boolean).join(' - ') }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span v-if="question.voteCount !== null" class="text-sm text-gray-500">{{ question.voteCount }}</span>
              <UButton
                v-if="joined && context.votingOpen"
                size="xs"
                :variant="question.hasVoted ? 'subtle' : 'solid'"
                :disabled="question.hasVoted"
                :loading="votingQuestionId === question.id"
                :label="question.hasVoted ? 'Voted' : 'Upvote'"
                @click="upvote(question.id)"
              />
              <UButton
                v-if="joined"
                size="xs"
                variant="ghost"
                color="error"
                :disabled="question.reported"
                :loading="reportingQuestionId === question.id"
                :label="question.reported ? 'Reported' : 'Report'"
                @click="reportQuestion(question.id)"
              />
            </div>
          </div>

          <div v-if="question.replies.length > 0" class="mt-2 flex flex-col gap-1 border-l pl-3">
            <p v-for="reply in question.replies" :key="reply.id" class="text-sm">
              <span class="text-gray-500">{{ reply.displayName ?? 'Someone' }}:</span> {{ reply.text }}
            </p>
          </div>

          <div v-if="joined" class="mt-2 flex gap-2">
            <UInput v-model="replyText[question.id]" placeholder="Write a reply" size="sm" class="flex-1" @keyup.enter="submitReply(question.id)" />
            <UButton
              size="sm"
              label="Reply"
              :loading="submittingReplyQuestionId === question.id"
              @click="submitReply(question.id)"
            />
          </div>
        </UCard>
        <p v-if="questions.length === 0 && searchTerm" class="text-sm text-gray-500">
          No questions match your search.
        </p>
        <p v-else-if="questions.length === 0" class="text-sm text-gray-500">
          No questions yet - be the first to ask!
        </p>
      </div>
    </div>
  </div>
</template>
