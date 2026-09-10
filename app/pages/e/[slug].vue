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

interface QuestionRow {
  id: string
  text: string
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

const route = useRoute()
const slug = route.params.slug as string

const { data: response } = await useFetch<EventContextResponse>(`/api/events/${slug}`)
const { data: questionsResponse, refresh: refreshQuestions } = await useFetch<QuestionsResponse>(`/api/events/${slug}/questions`)

const context = computed(() => response.value?.data ?? null)
const notFound = computed(() => !response.value?.success)
const questions = computed(() => questionsResponse.value?.data?.questions ?? [])

const joined = ref(false)
const displayName = ref('')
const attendeeTypeId = ref<string | null>(null)
const joining = ref(false)
const joinError = ref<string | null>(null)

onMounted(() => {
  if (context.value) {
    joined.value = getDeviceIdentity(context.value.id).joined
  }
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
const submitting = ref(false)
const submitError = ref<string | null>(null)
const submitConfirmation = ref<string | null>(null)

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
        text: questionText.value.trim()
      }
    })

    if (!result.success) {
      submitError.value = result.error ?? 'Something went wrong. Please try again.'
      return
    }

    questionText.value = ''
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

      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-medium">
          Questions
        </h2>
        <UButton size="xs" variant="subtle" label="Refresh" @click="refreshQuestions" />
      </div>
      <div class="flex flex-col gap-2">
        <UCard v-for="question in questions" :key="question.id">
          <p class="whitespace-pre-wrap">
            {{ question.text }}
          </p>
        </UCard>
        <p v-if="questions.length === 0" class="text-sm text-gray-500">
          No questions yet - be the first to ask!
        </p>
      </div>
    </div>
  </div>
</template>
