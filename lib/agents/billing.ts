import { createAdminClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/ai/ai'
import { billingReminderPrompt } from '@/lib/ai/prompts'
import { daysBetween } from '@/lib/utils'
import { checkEngagementLetter } from '@/lib/agents/guards'
import { toHtmlEmail } from '@/lib/resend'

/**
 * Billing Agent: queues invoice reminder emails for unpaid/overdue invoices.
 * Sequence: initial → +7 days → +14 days → +30 days (final notice).
 * Triggered by n8n on a daily schedule.
 */
export async function runBillingAgent(firmId: string): Promise<{ queued: number }> {
  const supabase = createAdminClient()

  const { data: firm } = await supabase
    .from('firms')
    .select('name')
    .eq('id', firmId)
    .single()
  const firmName = firm?.name ?? 'Our Firm'

  const today = new Date().toISOString().split('T')[0]

  // Find overdue invoices that haven't been reminded in the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, clients(id, full_name, email)')
    .eq('firm_id', firmId)
    .in('status', ['sent', 'overdue'])
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${sevenDaysAgo}`)

  if (!invoices || invoices.length === 0) return { queued: 0 }

  let queued = 0

  for (const invoice of invoices) {
    const client = invoice.clients as {
      id: string
      full_name: string
      email: string
    } | null

    if (!client) continue

    // ── Engagement letter guard ──────────────────────────────────────────────
    const guard = await checkEngagementLetter(
      firmId, client.id, 'billing',
      `Invoice Reminder — ${client.full_name}`
    )
    if (guard.skipped) continue
    // ────────────────────────────────────────────────────────────────────────

    const daysPastDue = Math.max(0, daysBetween(invoice.due_date, today))

    const prompt = billingReminderPrompt({
      firmName,
      client: { full_name: client.full_name },
      invoice: {
        amount_cents: invoice.amount_cents,
        due_date: invoice.due_date,
        status: invoice.status,
      },
      daysPastDue,
    })

    const { text: emailBody, provider } = await generateText(prompt, {
      firmId,
      clientId: client.id,
      agentType: 'billing',
    })

    const sequenceLabel =
      daysPastDue === 0 ? 'Invoice Due' :
      daysPastDue <= 7 ? 'First Reminder' :
      daysPastDue <= 14 ? 'Second Reminder' : 'Final Notice'

    const subject = `${sequenceLabel} — Invoice #${invoice.id.slice(0, 8).toUpperCase()}`

    await supabase.from('agent_logs').insert({
      firm_id: firmId,
      client_id: client.id,
      agent_type: 'billing',
      status: 'pending',
      subject,
      body: emailBody,
      ai_provider: provider,
      metadata: {
        client_email: client.email,
        invoice_id: invoice.id,
        amount_cents: invoice.amount_cents,
        days_past_due: daysPastDue,
        stripe_invoice_id: invoice.stripe_invoice_id,
      },
    })

    // Queue email for firm owner approval — no direct send
    await supabase.from('queued_emails').insert({
      firm_id: firmId,
      client_id: client.id,
      agent_type: 'billing',
      to_email: client.email,
      subject,
      html_body: toHtmlEmail(emailBody),
    })

    await supabase
      .from('invoices')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', invoice.id)

    queued++
  }

  return { queued }
}
