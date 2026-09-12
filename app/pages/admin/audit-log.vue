<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface AuditLogRow {
  id: string
  action: string
  details: Record<string, unknown> | null
  created_at: string
  actor: { email: string | null } | null
  event: { name: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  moderator_password_rotated: 'Moderator password rotated',
  branding_logo_uploaded: 'Branding logo uploaded',
  branding_logo_removed: 'Branding logo removed',
  event_manager_created: 'Event Manager created'
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details || Object.keys(details).length === 0) return ''
  return Object.entries(details).map(([key, value]) => `${key}: ${value}`).join(', ')
}

const supabase = useSupabase()
const entries = ref<AuditLogRow[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function loadData() {
  loading.value = true
  errorMessage.value = null

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, details, created_at, actor:profiles(email), event:events(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    errorMessage.value = 'Could not load the audit log.'
    loading.value = false
    return
  }

  entries.value = (data ?? []) as unknown as AuditLogRow[]
  loading.value = false
}

onMounted(loadData)
</script>

<template>
  <div class="mx-auto max-w-3xl p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Audit Log
    </h1>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" class="mb-4" />

    <div v-if="loading">
      Loading...
    </div>
    <div v-else class="flex flex-col gap-2">
      <UCard v-for="entry in entries" :key="entry.id">
        <p class="font-medium">
          {{ actionLabel(entry.action) }}
        </p>
        <p class="text-sm text-gray-500">
          {{ entry.actor?.email ?? 'Unknown actor' }} - {{ entry.event?.name ?? '—' }} -
          {{ new Date(entry.created_at).toLocaleString() }}
        </p>
        <p v-if="formatDetails(entry.details)" class="text-sm text-gray-500">
          {{ formatDetails(entry.details) }}
        </p>
      </UCard>
      <p v-if="entries.length === 0" class="text-sm text-gray-500">
        No audit log entries yet.
      </p>
    </div>
  </div>
</template>
