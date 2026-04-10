import { createAdminClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/ai/ai'
import { monthlyReportPrompt } from '@/lib/ai/prompts'
import { checkEngagementLetter } from '@/lib/agents/guards'
import { toHtmlEmail } from '@/lib/resend'

/**
 * Report Agent: generates monthly client status summaries.
 * All reports are queued for firm owner approval before sending.
 * Triggered by n8n on the 1st of each month.
 */
export async function runReportAgent(
  firmId: string,
  reportMonth?: string // defaults to previous month, e.g. "March 2025"
): Promise<{ queued: number }> {
  const supabase = createAdminClient()

  const { data: firm } = await supabase
    .from('firms')
    .select('name')
    .eq('id', firmId)
    .single()
  const firmName = firm?.name ?? 'Our Firm'

  // Default to previous calendar month
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const month = reportMonth ?? prevMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const monthStart = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1).toISOString()
  const monthEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).toISOString()

  // Get active clients
  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, entity_type, filing_types, email')
    .eq('firm_id', firmId)
    .eq('status', 'active')

  if (!clients || clients.length === 0) return { queued: 0 }

  let queued = 0

  for (const client of clients) {
    // ── Engagement letter guard ──────────────────────────────────────────────
    const guard = await checkEngagementLetter(
      firmId, client.id, 'report',
      `Monthly Summary — ${client.full_name}`
    )
    if (guard.skipped) continue
    // ────────────────────────────────────────────────────────────────────────

    // Gather monthly stats per client
    const [deadlinesRes, documentsRes, invoicesRes] = await Promise.all([
      supabase
        .from('deadlines')
        .select('status')
        .eq('firm_id', firmId)
        .eq('client_id', client.id),
      supabase
        .from('documents')
        .select('status')
        .eq('firm_id', firmId)
        .eq('client_id', client.id),
      supabase
        .from('invoices')
        .select('status')
        .eq('firm_id', firmId)
        .eq('client_id', client.id)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),
    ])

    const deadlines = deadlinesRes.data ?? []
    const documents = documentsRes.data ?? []
    const invoices = invoicesRes.data ?? []

    const stats = {
      deadlinesCompleted: deadlines.filter((d) => d.status === 'completed').length,
      deadlinesUpcoming: deadlines.filter((d) => ['upcoming', 'due_soon'].includes(d.status)).length,
      documentsReceived: documents.filter((d) => ['received', 'approved'].includes(d.status)).length,
      documentsPending: documents.filter((d) => ['required', 'requested'].includes(d.status)).length,
      invoicesPaid: invoices.filter((i) => i.status === 'paid').length,
      invoicesOutstanding: invoices.filter((i) => ['sent', 'overdue'].includes(i.status)).length,
    }

    const prompt = monthlyReportPrompt({
      firmName,
      client: {
        full_name: client.full_name,
        entity_type: client.entity_type,
        filing_types: client.filing_types,
      },
      reportMonth: month,
      stats,
    })

    const { text: reportBody, provider } = await generateText(prompt, {
      firmId,
      clientId: client.id,
      agentType: 'report',
    })

    const subject = `Monthly Summary — ${client.full_name} — ${month}`

    await supabase.from('agent_logs').insert({
      firm_id: firmId,
      client_id: client.id,
      agent_type: 'report',
      status: 'pending',
      subject,
      body: reportBody,
      ai_provider: provider,
      metadata: {
        client_email: client.email,
        report_month: month,
        stats,
      },
    })

    // Queue email for firm owner approval — no direct send
    await supabase.from('queued_emails').insert({
      firm_id: firmId,
      client_id: client.id,
      agent_type: 'report',
      to_email: client.email,
      subject,
      html_body: toHtmlEmail(reportBody),
    })

    queued++
  }

  return { queued }
}
