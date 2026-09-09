const JOIN_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const JOIN_CODE_LENGTH = 6
const JOIN_CODE_PATTERN = /^[A-Z0-9]{6}$/
const SLUG_MAX_LENGTH = 63
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'event'

  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base}-${suffix}`
}

export function generateJoinCode(): string {
  let code = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidSlug(value: string): boolean {
  return value.length > 0 && value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value)
}

export function normalizeJoinCode(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidJoinCode(value: string): boolean {
  return JOIN_CODE_PATTERN.test(value)
}
