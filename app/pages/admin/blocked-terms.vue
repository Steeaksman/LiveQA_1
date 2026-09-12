<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface BlockedTermRow {
  id: string
  term: string
}

const supabase = useSupabase()
const blockedTerms = ref<BlockedTermRow[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const newTerm = ref('')
const adding = ref(false)
const addError = ref<string | null>(null)

const DUPLICATE_TERM_CODE = '23505'

async function loadData() {
  loading.value = true
  errorMessage.value = null

  const { data, error } = await supabase
    .from('blocked_terms')
    .select('id, term')
    .is('deleted_at', null)
    .order('term')

  if (error) {
    errorMessage.value = 'Could not load blocked terms.'
    loading.value = false
    return
  }

  blockedTerms.value = data ?? []
  loading.value = false
}

onMounted(loadData)

async function addTerm() {
  addError.value = null

  const term = newTerm.value.trim()
  if (!term) {
    addError.value = 'Enter a term to block.'
    return
  }

  adding.value = true

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      addError.value = 'Your session expired. Please log in again.'
      return
    }

    const { error } = await supabase
      .from('blocked_terms')
      .insert({ term, created_by: user.id })

    if (error) {
      addError.value = error.code === DUPLICATE_TERM_CODE
        ? 'That term is already blocked.'
        : 'Something went wrong. Please try again.'
      return
    }

    newTerm.value = ''
    await loadData()
  } finally {
    adding.value = false
  }
}

async function removeTerm(id: string) {
  await supabase.from('blocked_terms').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  await loadData()
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Blocked Terms
    </h1>

    <UCard class="mb-6">
      <div class="flex gap-2">
        <UInput v-model="newTerm" placeholder="Term to block" class="flex-1" @keyup.enter="addTerm" />
        <UButton :loading="adding" label="Add" @click="addTerm" />
      </div>
      <UAlert v-if="addError" color="error" variant="subtle" :title="addError" class="mt-3" />
    </UCard>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" class="mb-4" />

    <div v-if="loading">
      Loading...
    </div>
    <div v-else class="flex flex-col gap-2">
      <div v-for="row in blockedTerms" :key="row.id" class="flex items-center justify-between">
        <span>{{ row.term }}</span>
        <UButton size="xs" color="error" variant="ghost" @click="removeTerm(row.id)">
          Remove
        </UButton>
      </div>
      <p v-if="blockedTerms.length === 0" class="text-sm text-gray-500">
        No blocked terms yet.
      </p>
    </div>
  </div>
</template>
