<script setup lang="ts">
const code = ref('')
const joining = ref(false)
const joinError = ref<string | null>(null)

interface JoinResponse {
  success: boolean
  data: { slug: string } | null
  error: string | null
}

async function join() {
  joinError.value = null

  if (!code.value.trim()) {
    joinError.value = 'Enter a join code.'
    return
  }

  joining.value = true

  try {
    const response = await $fetch<JoinResponse>('/api/join', {
      method: 'POST',
      body: { code: code.value }
    })

    if (!response.success || !response.data) {
      joinError.value = response.error ?? 'Something went wrong. Please try again.'
      return
    }

    await navigateTo(`/e/${response.data.slug}`)
  } catch (err) {
    const data = (err as { data?: JoinResponse })?.data
    joinError.value = data?.error ?? 'Something went wrong. Please try again.'
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm p-6">
    <h1 class="mb-4 text-xl font-semibold">
      Join an event
    </h1>
    <UForm :state="{}" class="flex flex-col gap-3" @submit="join">
      <UFormField label="Join code" required :error="joinError ?? undefined">
        <UInput v-model="code" placeholder="e.g. AB12CD" @keyup.enter="join" />
      </UFormField>
      <UButton type="submit" :loading="joining" label="Join" class="self-start" />
    </UForm>
  </div>
</template>
