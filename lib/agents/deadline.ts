import { createAdminClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/ai/ai'
import { deadlineAlertPrompt } from '@/lib/ai/prompts'
import { daysBetween } from '@/lib/utils'
import { checkEngagementLetter } from '@/lib/agents/guards'
import { toHtmlEmail } from '@/lib/resend'
import type { Deadline } from '@/lib/supabase/types'

// Alert thresholds in days — matches the boolean columns on the deadlines table
const ALERT_THRESHOLDS = [30, 14, 7, 3, 1] as const
type AlertThreshold = (typeof ALERT_THRESHOLDS)[number]

const ALERT_COLUMN: Record<AlertThreshold, keyof Deadline> = {
  30: 'alert_sent_30d',
  14: 'alert_sent_14d',
  7: 'alert_sent_7d',
  3: 'alert_sent_3d',
  1: 'alert_sent_1d',
}

/**
 * Deadline Agent: scans upcoming deadlines and queues alert emails.
 * Graduated alerts at 30/14/7/3/1 days before due date.
 * Triggered by n8n on a daily schedule.
 */
export async function runDeadlineAgent(firmId: string): Promise<{ queued: number }> {
  const supabase = createAdminClient()

  const { data: firm } = await supabase
    .from('firms')
    .select('name')
    .eq('id', firmId)
    .single()
  const firmName = firm?.name ?? 'Our Firm'

  const today = new Date().toISOString().split('T')[0]
  const in30Days = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Fetch upcoming/due-soon deadlines within the next 30 days
  const { data: deadlines } = await supabase
    .from('deadlines')
    .select('*, clients(id, full_name, email)')
    .eq('firm_id', firmId)
    .in('status', ['upcoming', 'due_soon'])
    .gte('due_date', today)
    .lte('due_date', in30Days)

  if (!deadlines || deadlines.length === 0) return { queued: 0 }

  let queued = 0

  for (const deadline of deadlines) {
    const client = deadline.clients as {
      id: string
      full_name: string
      email: string
    } | null

    if (!client) continue

    // ── Engagement letter guard ──────────────────────────────────────────────
    const guard = await checkEngagementLetter(
      firmId, client.id, 'deadline',
      `${deadline.filing_type} Deadline — ${client.full_name}`
    )
    if (guard.skipped) continue
    // ────────────────────────────────────────────────────────────────────────

    const daysUntilDue = daysBetween(today, deadline.due_date)

    // Find the closest threshold that hasn't been sent yet
    const threshold = ALERT_THRESHOLDS.find(
      (t) => daysUntilDue <= t && !deadline[ALERT_COLUMN[t]]
    )
    if (!threshold) continue

    const prompt = deadlineAlertPrompt({
      firmName,
      client: { full_name: client.full_name },
      deadline: {
        filing_type: deadline.filing_type,
        due_date: deadline.due_date,
        status: deadline.status,
      },
      daysUntilDue,
    })

    const { text: emailBody, provider } = await generateText(prompt, {
      firmId,
      clientId: client.id,
      agentType: 'deadline',
    })

    const subject = `${deadline.filing_type} Deadline — ${daysUntilDue} Day${daysUntilDue !== 1 ? 's' : ''} Remaining`

    await supabase.from('agent_logs').insert({
      firm_id: firmId,
      client_id: client.id,
      agent_type: 'deadline',
      status: 'pending',
      subject,
      body: emailBody,
      ai_provider: provider,
      metadata: {
        client_email: client.email,
        deadline_id: deadline.id,
        filing_type: deadline.filing_type,
        due_date: deadline.due_date,
        days_until_due: daysUntilDue,
        alert_threshold: threshold,
      },
    })

    // Queue email for firm owner approval — no direct send
    await supabase.from('queued_emails').insert({
      firm_id: firmId,
      client_id: client.id,
      agent_type: 'deadline',
      to_email: client.email,
      subject,
      html_body: toHtmlEmail(emailBody),
    })

    // Mark alert as sent
    await supabase
      .from('deadlines')
      .update({ [ALERT_COLUMN[threshold]]: true } as Partial<Omit<import('@/lib/supabase/types').Deadline, 'id'>>)
      .eq('id', deadline.id)

    queued++
  }

  return { queued }
}
