interface NotifyPrefs {
  sound: boolean
  browser: boolean
}

const STORAGE_KEY = 'liveqa:moderator-notify-prefs'
const DEFAULT_PREFS: NotifyPrefs = { sound: false, browser: false }

let memoryFallback: NotifyPrefs = { ...DEFAULT_PREFS }

export function getNotifyPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as NotifyPrefs) : { ...DEFAULT_PREFS }
  } catch {
    return { ...memoryFallback }
  }
}

export function setNotifyPrefs(prefs: NotifyPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    memoryFallback = { ...prefs }
  }
}
