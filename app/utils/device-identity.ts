interface DeviceIdentity {
  token: string
  joined: boolean
}

function storageKey(eventId: string): string {
  return `liveqa:attendee:${eventId}`
}

const memoryFallback = new Map<string, DeviceIdentity>()

export function getDeviceIdentity(eventId: string): DeviceIdentity {
  const key = storageKey(eventId)

  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as DeviceIdentity

    const identity: DeviceIdentity = { token: crypto.randomUUID(), joined: false }
    localStorage.setItem(key, JSON.stringify(identity))
    return identity
  } catch {
    const existing = memoryFallback.get(key)
    if (existing) return existing

    const identity: DeviceIdentity = { token: crypto.randomUUID(), joined: false }
    memoryFallback.set(key, identity)
    return identity
  }
}

export function markDeviceJoined(eventId: string): void {
  const key = storageKey(eventId)
  const identity = getDeviceIdentity(eventId)
  const updated: DeviceIdentity = { ...identity, joined: true }

  try {
    localStorage.setItem(key, JSON.stringify(updated))
  } catch {
    memoryFallback.set(key, updated)
  }
}
