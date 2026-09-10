import QRCode from 'qrcode'

export function generateQrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text)
}

export function generateQrSvgMarkup(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg' })
}
