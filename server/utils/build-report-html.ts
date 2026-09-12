import type { CombinedReportData, QuestionReportRow, TopicByTopicReportData } from './build-event-report-data'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderRow(row: QuestionReportRow): string {
  const repliesHtml = row.replies.length
    ? `<ul>${row.replies.map(r => `<li><strong>${escapeHtml(r.displayName)}:</strong> ${escapeHtml(r.text)}</li>`).join('')}</ul>`
    : '&mdash;'

  const attachmentsHtml = row.attachments.length
    ? `<ul>${row.attachments.map(a => `<li>${escapeHtml(a.mimeType)} (${a.sizeBytes} bytes)</li>`).join('')}</ul>`
    : '&mdash;'

  return `
    <tr>
      <td>${escapeHtml(row.text)}</td>
      <td>${escapeHtml(row.createdAt)}</td>
      <td>${escapeHtml(row.displayName ?? '')}</td>
      <td>${escapeHtml(row.attendeeType ?? '')}</td>
      <td>${escapeHtml(row.approvalStatus)}</td>
      <td>${escapeHtml(row.visibility)}</td>
      <td>${row.answered ? 'Yes' : 'No'}</td>
      <td>${row.archived ? 'Yes' : 'No'}</td>
      <td>${row.voteCount}${row.isTopVoted ? ' &#9733;' : ''}</td>
      <td>${repliesHtml}</td>
      <td>${attachmentsHtml}</td>
    </tr>
  `
}

function renderTable(rows: QuestionReportRow[]): string {
  return `
    <table>
      <thead>
        <tr>
          <th>Question</th><th>Submitted at</th><th>Display name</th>
          <th>Attendee type</th><th>Approval status</th><th>Visibility</th>
          <th>Answered</th><th>Archived</th><th>Votes</th><th>Replies</th>
          <th>Attachments</th>
        </tr>
      </thead>
      <tbody>${rows.map(renderRow).join('')}</tbody>
    </table>
  `
}

export function buildReportHtml(data: CombinedReportData | TopicByTopicReportData): string {
  const body = 'rows' in data
    ? renderTable(data.rows)
    : data.topics.map(topic => `<h2>${escapeHtml(topic.topicName)}</h2>${renderTable(topic.rows)}`).join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Event Report</title>
<style>
  body { font-family: sans-serif; margin: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>Event Report</h1>
  <p>Generated at: ${escapeHtml(data.generatedAt)}</p>
  <p>Participation: ${data.participationCount} attendee(s)</p>
  ${body}
</body>
</html>`
}
