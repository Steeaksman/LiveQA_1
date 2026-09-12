const SIGNATURE_CHECKS: Record<string, (buf: Buffer) => boolean> = {
  'image/jpeg': buf => buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF,
  'image/png': buf => buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])),
  'image/gif': buf => buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'GIF8',
  'image/webp': buf => buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP',
  'application/pdf': buf => buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-'
}

/**
 * Verifies a file's actual leading bytes match the signature expected for
 * its declared MIME type, rather than trusting the client-supplied
 * Content-Type header alone. Covers exactly the types this app allows for
 * uploads (JPEG, PNG, GIF, WEBP, PDF) - a hand-rolled check is sufficient
 * for this fixed, narrow set and avoids a new dependency.
 */
export function fileContentMatchesDeclaredType(buffer: Buffer, declaredType: string): boolean {
  const check = SIGNATURE_CHECKS[declaredType]
  return check ? check(buffer) : false
}
