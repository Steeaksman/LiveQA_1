import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'
import { buildEventReportData, type ReportType } from '../../../../utils/build-event-report-data'
import { buildReportCsv } from '../../../../utils/build-report-csv'
import { buildReportHtml } from '../../../../utils/build-report-html'
import { buildReportPdf } from '../../../../utils/build-report-pdf'

interface GenerateReportBody {
  reportType?: string
  format?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const INVALID_REPORT_TYPE_ERROR = 'Invalid report type.'
const INVALID_FORMAT_ERROR = 'Invalid format.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const BUCKET = 'event-reports'
const SIGNED_URL_TTL_SECONDS = 3600

function isReportType(value: string): value is ReportType {
  return value === 'combined' || value === 'topic_by_topic'
}

function isFormat(value: string): value is 'csv' | 'html' | 'pdf' {
  return value === 'csv' || value === 'html' || value === 'pdf'
}

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<GenerateReportBody>(event)
  const reportTypeValue = body?.reportType ?? ''
  const formatValue = body?.format ?? ''

  if (!isReportType(reportTypeValue)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: INVALID_REPORT_TYPE_ERROR }
  }

  if (!isFormat(formatValue)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: INVALID_FORMAT_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: report, error: insertError } = await supabase
    .from('reports')
    .insert({
      event_id: eventId,
      generated_by: callerId,
      report_type: reportTypeValue,
      format: formatValue
    })
    .select('id')
    .single()

  if (insertError || !report) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const reportData = await buildEventReportData(eventId, reportTypeValue)

  let content: string | Buffer
  let contentType: string

  if (formatValue === 'csv') {
    content = buildReportCsv(reportData)
    contentType = 'text/csv'
  } else if (formatValue === 'html') {
    content = buildReportHtml(reportData)
    contentType = 'text/html'
  } else {
    const [{ data: eventRow }, { data: settings }] = await Promise.all([
      supabase.from('events').select('name').eq('id', eventId).single(),
      supabase.from('event_settings').select('accent_color, logo_storage_path').eq('event_id', eventId).single()
    ])

    let logoBuffer: Buffer | null = null
    if (settings?.logo_storage_path) {
      const { data: logoBlob } = await supabase.storage.from('event-branding').download(settings.logo_storage_path)
      if (logoBlob) logoBuffer = Buffer.from(await logoBlob.arrayBuffer())
    }

    content = await buildReportPdf(reportData, {
      accentColor: settings?.accent_color ?? null,
      logoBuffer,
      eventName: eventRow?.name ?? 'Event'
    })
    contentType = 'application/pdf'
  }

  const storagePath = `${eventId}/${report.id}.${formatValue}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, content, { contentType, upsert: true })

  if (uploadError) {
    await supabase.from('reports').delete().eq('id', report.id)
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const { error: updateError } = await supabase
    .from('reports')
    .update({ storage_path: storagePath })
    .eq('id', report.id)

  if (updateError) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  await logAuditAction(callerId, 'report_generated', eventId, { reportId: report.id, reportType: reportTypeValue, format: formatValue })

  return { success: true, data: { reportId: report.id, url: signed?.signedUrl ?? null }, error: null }
})
