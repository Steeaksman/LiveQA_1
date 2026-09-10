<script setup lang="ts">
definePageMeta({ middleware: ['admin', 'administrator-only'] })

interface TemplateRow {
  id: string
  name: string
}

const supabase = useSupabase()
const templates = ref<TemplateRow[]>([])
const loading = ref(true)

onMounted(async () => {
  const { data } = await supabase
    .from('event_templates')
    .select('id, name')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  templates.value = data ?? []
  loading.value = false
})
</script>

<template>
  <div class="mx-auto max-w-3xl p-6">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">
        Templates
      </h1>
      <UButton to="/admin/templates/new" label="Create Template" />
    </div>

    <div v-if="loading">
      Loading...
    </div>
    <p v-else-if="templates.length === 0" class="text-gray-500">
      No templates yet.
    </p>
    <div v-else class="flex flex-col gap-2">
      <NuxtLink v-for="template in templates" :key="template.id" :to="`/admin/templates/${template.id}`">
        <UCard>
          <p class="font-medium">
            {{ template.name }}
          </p>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
