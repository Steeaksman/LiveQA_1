import PDFDocument from 'pdfkit'
import type { CombinedReportData, QuestionReportRow, TopicByTopicReportData } from './build-event-report-data'

export interface ReportPdfBranding {
  accentColor: string | null
  logoBuffer: Buffer | null
  eventName: string
}

const DEFAULT_TITLE_COLOR = '#111111'
const BODY_COLOR = '#333333'

function renderQuestionBlock(doc: PDFKit.PDFDocument, row: QuestionReportRow, accentColor: string): void {
  doc.fontSize(12).fillColor(DEFAULT_TITLE_COLOR).text(row.text, { continued: false })

  const replyCount = row.replies.length
  const attachmentCount = row.attachments.length

  doc.fontSize(9).fillColor(BODY_COLOR).text(
    `${new Date(row.createdAt).toLocaleString()} - ${row.displayName ?? 'Anonymous'}` +
    (row.attendeeType ? ` (${row.attendeeType})` : '') +
    ` - ${row.approvalStatus} / ${row.visibility}` +
    (row.answered ? ' - answered' : '') +
    (row.archived ? ' - archived' : '') +
    ` - ${row.voteCount} vote(s)${row.isTopVoted ? ' *TOP VOTED*' : ''}` +
    ` - ${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}, ${attachmentCount} attachment(s)`
  )

  doc.moveDown(0.75)
}

export async function buildReportPdf(data: CombinedReportData | TopicByTopicReportData, branding: ReportPdfBranding): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []

    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const accentColor = branding.accentColor ?? DEFAULT_TITLE_COLOR

    if (branding.logoBuffer) {
      try {
        doc.image(branding.logoBuffer, doc.page.margins.left, doc.y, { fit: [100, 60] })
        doc.moveDown(0.5)
      } catch {
        // Malformed or unsupported image data - skip the logo, keep generating the report.
      }
    }

    doc.fontSize(20).fillColor(accentColor).text(branding.eventName, { align: 'left' })
    doc.fontSize(10).fillColor(BODY_COLOR).text(`Generated at: ${data.generatedAt}`)
    doc.text(`Participation: ${data.participationCount} attendee(s)`)
    doc.moveDown(1)

    if ('rows' in data) {
      for (const row of data.rows) {
        renderQuestionBlock(doc, row, accentColor)
      }
    } else {
      for (const topic of data.topics) {
        doc.fontSize(14).fillColor(accentColor).text(topic.topicName)
        doc.moveDown(0.5)
        for (const row of topic.rows) {
          renderQuestionBlock(doc, row, accentColor)
        }
        doc.moveDown(0.5)
      }
    }

    doc.end()
  })
}
