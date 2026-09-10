<script setup lang="ts">
const props = defineProps<{
  label: string
  url: string
}>()

const pngDataUrl = ref('')

watch(() => props.url, async (url) => {
  pngDataUrl.value = await generateQrPngDataUrl(url)
}, { immediate: true })

function filenameFor(extension: string): string {
  const slug = props.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug}-qr.${extension}`
}

async function downloadPng() {
  if (!pngDataUrl.value) return
  downloadDataUrl(pngDataUrl.value, filenameFor('png'))
}

async function downloadSvg() {
  const svgMarkup = await generateQrSvgMarkup(props.url)
  const blobUrl = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml' }))
  downloadDataUrl(blobUrl, filenameFor('svg'))
  setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
}
</script>

<template>
  <UCard>
    <h3 class="mb-2 font-medium">
      {{ label }}
    </h3>
    <img v-if="pngDataUrl" :src="pngDataUrl" :alt="`${label} QR code`" class="mb-2 h-40 w-40">
    <p class="mb-3 break-all text-sm text-gray-500">
      {{ url }}
    </p>
    <div class="flex gap-2">
      <UButton size="sm" label="Download PNG" @click="downloadPng" />
      <UButton size="sm" variant="subtle" label="Download SVG" @click="downloadSvg" />
    </div>
  </UCard>
</template>
