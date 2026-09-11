<script setup lang="ts">
const props = defineProps<{
  eventName: string
  url: string
  joinCode: string
  logoUrl?: string | null
}>()

const pngDataUrl = ref('')
const generationError = ref<string | null>(null)

async function regenerate() {
  generationError.value = null
  pngDataUrl.value = ''

  try {
    const qrPngDataUrl = await generateQrPngDataUrl(props.url)
    pngDataUrl.value = await generateSignagePngDataUrl({
      eventName: props.eventName,
      joinCode: props.joinCode,
      qrPngDataUrl,
      logoPngUrl: props.logoUrl
    })
  } catch {
    generationError.value = 'Could not generate the signage graphic. Please try again.'
  }
}

watch([() => props.eventName, () => props.url, () => props.joinCode, () => props.logoUrl], regenerate, { immediate: true })

function downloadPng() {
  if (!pngDataUrl.value) return
  const slug = props.eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  downloadDataUrl(pngDataUrl.value, `${slug}-signage.png`)
}
</script>

<template>
  <UCard>
    <img v-if="pngDataUrl" :src="pngDataUrl" alt="Event signage preview" class="mb-3 w-full max-w-sm">
    <UAlert v-if="generationError" color="error" variant="subtle" :title="generationError" class="mb-3" />
    <UButton size="sm" label="Download PNG" :disabled="!pngDataUrl" @click="downloadPng" />
  </UCard>
</template>
