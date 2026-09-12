declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
    }
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptLoadPromise: Promise<void> | undefined

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptLoadPromise) return scriptLoadPromise

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load the verification challenge.'))
    document.head.appendChild(script)
  })

  return scriptLoadPromise
}

/**
 * Manages a single Cloudflare Turnstile widget: loads the API script once
 * (only when actually used), renders one widget into a given container, and
 * exposes the resulting token. Server-side verification in
 * verify-turnstile-token.ts is the real security boundary - this only
 * collects the token for the request body.
 */
export function useTurnstile() {
  const token = ref<string | null>(null)
  let widgetId: string | null = null

  async function render(container: HTMLElement, siteKey: string) {
    await loadTurnstileScript()

    if (!window.turnstile) return

    widgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      callback: (value: string) => { token.value = value },
      'error-callback': () => { token.value = null }
    })
  }

  function reset() {
    token.value = null
    if (widgetId && window.turnstile) {
      window.turnstile.reset(widgetId)
    }
  }

  return { token, render, reset }
}
