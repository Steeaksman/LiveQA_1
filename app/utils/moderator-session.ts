interface ModeratorSession {
  sessionToken: string
  expiresAt: string
}

function storageKey(eventId: string): string {
  return `liveqa:moderator:${eventId}`
}

const memoryFallback = new Map<string, ModeratorSession>()

export function getStoredModeratorSession(eventId: string): ModeratorSession | null {
  const key = storageKey(eventId)

  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as ModeratorSession) : null
  } catch {
    return memoryFallback.get(key) ?? null
  }
}

export function setStoredModeratorSession(eventId: string, session: ModeratorSession): void {
  const key = storageKey(eventId)

  try {
    localStorage.setItem(key, JSON.stringify(session))
  } catch {
    memoryFallback.set(key, session)
  }
}

export function clearStoredModeratorSession(eventId: string): void {
  const key = storageKey(eventId)

  try {
    localStorage.removeItem(key)
  } catch {
    memoryFallback.delete(key)
  }
}
