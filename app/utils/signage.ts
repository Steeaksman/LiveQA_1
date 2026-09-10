const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 1600
const MARGIN = 80
const QR_SIZE = 600
const NAME_MAX_FONT_SIZE = 72
const NAME_MIN_FONT_SIZE = 32
const NAME_FONT_STEP = 4

export interface SignageInput {
  eventName: string
  joinCode: string
  qrPngDataUrl: string
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the QR code image.'))
    image.src = dataUrl
  })
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth) {
      currentLine = candidate
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  }
  if (currentLine) lines.push(currentLine)

  return lines
}

function fitEventName(context: CanvasRenderingContext2D, eventName: string, maxWidth: number): { text: string, fontSize: number } {
  for (let fontSize = NAME_MAX_FONT_SIZE; fontSize >= NAME_MIN_FONT_SIZE; fontSize -= NAME_FONT_STEP) {
    context.font = `bold ${fontSize}px sans-serif`
    if (context.measureText(eventName).width <= maxWidth) {
      return { text: eventName, fontSize }
    }
  }

  context.font = `bold ${NAME_MIN_FONT_SIZE}px sans-serif`
  let truncated = eventName
  while (truncated.length > 1 && context.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return { text: `${truncated}...`, fontSize: NAME_MIN_FONT_SIZE }
}

export async function generateSignagePngDataUrl(input: SignageInput): Promise<string> {
  const qrImage = await loadImage(input.qrPngDataUrl)

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create a drawing context for the signage graphic.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  context.textAlign = 'center'
  context.fillStyle = '#111111'

  const maxTextWidth = CANVAS_WIDTH - MARGIN * 2
  const { text: fittedName, fontSize: nameFontSize } = fitEventName(context, input.eventName, maxTextWidth)
  context.font = `bold ${nameFontSize}px sans-serif`
  context.fillText(fittedName, CANVAS_WIDTH / 2, MARGIN + nameFontSize)

  const qrX = (CANVAS_WIDTH - QR_SIZE) / 2
  const qrY = MARGIN + nameFontSize + 60
  context.drawImage(qrImage, qrX, qrY, QR_SIZE, QR_SIZE)

  context.font = '48px sans-serif'
  context.fillText(`Join code: ${input.joinCode}`, CANVAS_WIDTH / 2, qrY + QR_SIZE + 80)

  context.font = '32px sans-serif'
  const instructionsLineHeight = 44
  const instructionsLines = wrapText(
    context,
    'Scan the QR code, ask your question, and vote for questions you want answered.',
    maxTextWidth
  )
  const instructionsStartY = CANVAS_HEIGHT - MARGIN - (instructionsLines.length - 1) * instructionsLineHeight
  instructionsLines.forEach((line, index) => {
    context.fillText(line, CANVAS_WIDTH / 2, instructionsStartY + index * instructionsLineHeight)
  })

  return canvas.toDataURL('image/png')
}
