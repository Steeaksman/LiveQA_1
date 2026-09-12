import type { CombinedReportData, QuestionReportRow, TopicByTopicReportData } from './build-event-report-data'

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const COLUMNS = [
  'Question', 'Submitted at', 'Topic', 'Display name', 'Attendee type',
  'Approval status', 'Visibility', 'Answered', 'Archived', 'Vote count',
  'Top voted', 'Replies', 'Attachments'
]

function rowToCells(row: QuestionReportRow): string[] {
  const repliesText = row.replies.map(r => `${r.displayName}: ${r.text}`).join('; ')
  const attachmentsText = row.attachments.map(a => `${a.mimeType} (${a.sizeBytes} bytes)`).join('; ')

  return [
    row.text,
    row.createdAt,
    row.topicName ?? '',
    row.displayName ?? '',
    row.attendeeType ?? '',
    row.approvalStatus,
    row.visibility,
    row.answered ? 'Yes' : 'No',
    row.archived ? 'Yes' : 'No',
    String(row.voteCount),
    row.isTopVoted ? 'Yes' : 'No',
    repliesText,
    attachmentsText
  ]
}

function toCsvLine(cells: string[]): string {
  return cells.map(escapeCsvCell).join(',')
}

export function buildReportCsv(data: CombinedReportData | TopicByTopicReportData): string {
  const lines: string[] = []

  lines.push(toCsvLine(['Participation count', String(data.participationCount)]))
  lines.push(toCsvLine(['Generated at', data.generatedAt]))
  lines.push('')

  if ('rows' in data) {
    lines.push(toCsvLine(COLUMNS))
    for (const row of data.rows) {
      lines.push(toCsvLine(rowToCells(row)))
    }
  } else {
    for (const topic of data.topics) {
      lines.push(toCsvLine([topic.topicName]))
      lines.push(toCsvLine(COLUMNS))
      for (const row of topic.rows) {
        lines.push(toCsvLine(rowToCells(row)))
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}
