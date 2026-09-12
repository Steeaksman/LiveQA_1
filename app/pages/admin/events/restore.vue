<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface RestoreResponse {
  success: boolean
  data: { eventId: string, slug: string } | null
  error: string | null
}

const supabase = useSupabase()
const selectedFile = ref<File | null>(null)
const restoring = ref(false)
const restoreError = ref<string | null>(null)

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
}

async function restoreBackup() {
  restoreError.value = null

  if (!selectedFile.value) {
    restoreError.value = 'Please choose a backup file.'
    return
  }

  restoring.value = true

  try {
    const text = await selectedFile.value.text()
    let backup: unknown

    try {
      backup = JSON.parse(text)
    } catch {
      restoreError.value = 'That file is not valid JSON.'
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      restoreError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<RestoreResponse>('/api/admin/events/restore', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { backup }
    })

    if (!response.success || !response.data) {
      restoreError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    await navigateTo(`/admin/events/${response.data.eventId}`)
  } catch (err) {
    const data = (err as { data?: RestoreResponse })?.data
    restoreError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Restore from Backup
    </h1>

    <UCard>
      <div class="flex flex-col gap-3">
        <p class="text-sm text-gray-500">
          Restoring a backup creates a brand new event with fresh ids, a new slug and join code, and starts it in draft status for you to review.
        </p>
        <input type="file" accept="application/json" @change="onFileSelected">
        <UAlert v-if="restoreError" color="error" variant="subtle" :title="restoreError" />
        <UButton :loading="restoring" label="Restore" class="self-start" @click="restoreBackup" />
      </div>
    </UCard>
  </div>
</template>
