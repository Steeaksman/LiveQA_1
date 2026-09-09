<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface EventRow {
  id: string
  name: string
  slug: string
  status: string
}

const supabase = useSupabase()
const events = ref<EventRow[]>([])
const loading = ref(true)

onMounted(async () => {
  const { data } = await supabase
    .from('events')
    .select('id, name, slug, status')
    .order('created_at', { ascending: false })

  events.value = data ?? []
  loading.value = false
})
</script>

<template>
  <div class="mx-auto max-w-3xl p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Events
    </h1>

    <div v-if="loading">
      Loading...
    </div>
    <p v-else-if="events.length === 0" class="text-gray-500">
      No events yet.
    </p>
    <div v-else class="flex flex-col gap-2">
      <UCard v-for="event in events" :key="event.id">
        <p class="font-medium">
          {{ event.name }}
        </p>
        <p class="text-sm text-gray-500">
          {{ event.slug }} - {{ event.status }}
        </p>
      </UCard>
    </div>
  </div>
</template>
