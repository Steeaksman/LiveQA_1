<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface Thresholds {
  active_count_warning_threshold: number
  active_count_critical_threshold: number
  db_size_warning_bytes: number
  db_size_critical_bytes: number
  storage_warning_bytes: number
  storage_critical_bytes: number
}

interface UsageData {
  activeCount: number
  dbSizeBytes: number
  storageBytes: number
  thresholds: Thresholds
  statuses: {
    activeCount: 'normal' | 'approaching_capacity' | 'consider_upgrading'
    dbSize: 'normal' | 'approaching_capacity' | 'consider_upgrading'
    storage: 'normal' | 'approaching_capacity' | 'consider_upgrading'
  }
}

interface UsageResponse {
  success: boolean
  data: UsageData | null
  error: string | null
}

interface UsageSettingsResponse {
  success: boolean
  data: null
  error: string | null
}

const STATUS_LABELS: Record<string, string> = {
  normal: 'Normal',
  approaching_capacity: 'Approaching Capacity',
  consider_upgrading: 'Consider Upgrading'
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error'> = {
  normal: 'success',
  approaching_capacity: 'warning',
  consider_upgrading: 'error'
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const supabase = useSupabase()
const usage = ref<UsageData | null>(null)
const loading = ref(false)
const usageError = ref<string | null>(null)

const activeWarning = ref(0)
const activeCritical = ref(0)
const dbWarning = ref(0)
const dbCritical = ref(0)
const storageWarning = ref(0)
const storageCritical = ref(0)
const savingSettings = ref(false)
const settingsError = ref<string | null>(null)

async function loadUsage() {
  loading.value = true
  usageError.value = null

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    usageError.value = 'Your session expired. Please log in again.'
    loading.value = false
    return
  }

  try {
    const response = await $fetch<UsageResponse>('/api/admin/usage', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (response.success && response.data) {
      usage.value = response.data
      activeWarning.value = response.data.thresholds.active_count_warning_threshold
      activeCritical.value = response.data.thresholds.active_count_critical_threshold
      dbWarning.value = response.data.thresholds.db_size_warning_bytes
      dbCritical.value = response.data.thresholds.db_size_critical_bytes
      storageWarning.value = response.data.thresholds.storage_warning_bytes
      storageCritical.value = response.data.thresholds.storage_critical_bytes
    } else {
      usageError.value = response.error ?? 'Something went wrong. Please try again.'
    }
  } catch {
    usageError.value = 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}

onMounted(loadUsage)

async function saveThresholds() {
  settingsError.value = null
  savingSettings.value = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      settingsError.value = 'Your session expired. Please log in again.'
      return
    }

    const response = await $fetch<UsageSettingsResponse>('/api/admin/usage-settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        activeCountWarningThreshold: activeWarning.value,
        activeCountCriticalThreshold: activeCritical.value,
        dbSizeWarningBytes: dbWarning.value,
        dbSizeCriticalBytes: dbCritical.value,
        storageWarningBytes: storageWarning.value,
        storageCriticalBytes: storageCritical.value
      }
    })

    if (!response.success) {
      settingsError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    await loadUsage()
  } catch (err) {
    const data = (err as { data?: UsageSettingsResponse })?.data
    settingsError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    savingSettings.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Usage & Guardrails
    </h1>

    <UAlert v-if="usageError" color="error" variant="subtle" :title="usageError" class="mb-4" />

    <div v-if="loading">
      Loading...
    </div>
    <div v-else-if="usage" class="flex flex-col gap-4">
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">
              Active attendees/moderators (currently-live events)
            </p>
            <p class="text-sm text-gray-500">
              {{ usage.activeCount }} of ~200 concurrent Realtime connections (Supabase Free plan)
            </p>
          </div>
          <UBadge :color="STATUS_COLORS[usage.statuses.activeCount]">
            {{ STATUS_LABELS[usage.statuses.activeCount] }}
          </UBadge>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">
              Database size
            </p>
            <p class="text-sm text-gray-500">
              {{ formatBytes(usage.dbSizeBytes) }} of ~500 MB (Supabase Free plan)
            </p>
          </div>
          <UBadge :color="STATUS_COLORS[usage.statuses.dbSize]">
            {{ STATUS_LABELS[usage.statuses.dbSize] }}
          </UBadge>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">
              Attachment storage (estimate)
            </p>
            <p class="text-sm text-gray-500">
              {{ formatBytes(usage.storageBytes) }} of ~1 GB (Supabase Free plan) - excludes branding logos and report files
            </p>
          </div>
          <UBadge :color="STATUS_COLORS[usage.statuses.storage]">
            {{ STATUS_LABELS[usage.statuses.storage] }}
          </UBadge>
        </div>
      </UCard>

      <UCard>
        <h2 class="mb-3 font-medium">
          Thresholds
        </h2>
        <div class="flex flex-col gap-3">
          <UFormField label="Active count - warning">
            <UInput v-model.number="activeWarning" type="number" />
          </UFormField>
          <UFormField label="Active count - critical">
            <UInput v-model.number="activeCritical" type="number" />
          </UFormField>
          <UFormField label="Database size - warning (bytes)">
            <UInput v-model.number="dbWarning" type="number" />
          </UFormField>
          <UFormField label="Database size - critical (bytes)">
            <UInput v-model.number="dbCritical" type="number" />
          </UFormField>
          <UFormField label="Storage - warning (bytes)">
            <UInput v-model.number="storageWarning" type="number" />
          </UFormField>
          <UFormField label="Storage - critical (bytes)">
            <UInput v-model.number="storageCritical" type="number" />
          </UFormField>
          <UAlert v-if="settingsError" color="error" variant="subtle" :title="settingsError" />
          <UButton :loading="savingSettings" label="Save" class="self-start" @click="saveThresholds" />
        </div>
      </UCard>
    </div>
  </div>
</template>
