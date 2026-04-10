import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { FILING_TYPE_LABELS } from '@/lib/ai/prompts'
import type { Client, FilingType } from '@/lib/supabase/types'

export interface TallyWebhookPayload {
  eventId: string
  eventType: 'FORM_RESPONSE'
  createdAt: string
  data: {
    responseId: string
    submissionId: string
    respondentId: string
    formId: string
    formName: string
    createdAt: string
    fields: Array<{
      key: string
      label: string
      type: string
      value: unknown
    }>
  }
}

/**
 * Process a Tally.so form submission:
 * 1. Parse fields into a Client record
 * 2. Create the client in Supabase
 * 3. If the firm has an engagement letter template, interpolate and send immediately
 * 4. If no template, log a 'skipped' warning — do not fail silently
 */
export async function processIntakeWebhook(
  payload: TallyWebhookPayload,
  firmId: string
): Promise<{ clientId: string; agentLogId: string }> {
  const supabase = createAdminClient()

  // ── 1. Parse Tally fields ────────────────────────────────────────────────────
  const fields = payload.data.fields
  const getField = (label: string) =>
    fields.find((f) => f.label.toLowerCase().includes(label.toLowerCase()))?.value as string | undefined

  const clientData = {
    firm_id: firmId,
    full_name: getField('name') ?? getField('full name') ?? 'Unknown',
    email: getField('email') ?? '',
    phone: getField('phone') ?? null,
    entity_type: (getField('entity') ?? 'individual') as Client['entity_type'],
    status: 'active' as const,
    filing_types: [] as Client['filing_types'],
    tally_submission_id: payload.data.submissionId,
    intake_completed_at: new Date().toISOString(),
  }

  // ── 2. Create client ─────────────────────────────────────────────────────────
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert(clientData)
    .select()
    .single()

  if (clientError || !client) {
    throw new Error(`Failed to create client: ${clientError?.message}`)
  }

  // ── 3. Fetch firm (name + template) ─────────────────────────────────────────
  const { data: firm } = await supabase
    .from('firms')
    .select('name, engagement_letter_template')
    .eq('id', firmId)
    .single()

  const firmName = firm?.name ?? 'Our Firm'
  const template = firm?.engagement_letter_template ?? null

  // ── 4a. No template — log skipped, return early ──────────────────────────────
  if (!template) {
    const { data: agentLog, error: logError } = await supabase
      .from('agent_logs')
      .insert({
        firm_id: firmId,
        client_id: client.id,
        agent_type: 'intake',
        status: 'skipped',
        subject: `Engagement Letter — ${client.full_name}`,
        body: 'Skipped: no engagement letter template configured for this firm.',
        metadata: {
          reason: 'no_template_configured',
          tally_submission_id: payload.data.submissionId,
          client_email: client.email,
        },
      })
      .select()
      .single()

    if (logError || !agentLog) {
      throw new Error(`Failed to write skipped log: ${logError?.message}`)
    }

    return { clientId: client.id, agentLogId: agentLog.id }
  }

  // ── 4b. Template exists — interpolate, send, update client ──────────────────
  const servicesList = client.filing_types.length > 0
    ? client.filing_types
        .map((ft: FilingType) => FILING_TYPE_LABELS[ft] ?? ft)
        .join(', ')
    : 'tax preparation and advisory services'

  const letterBody = template
    .replace(/\{client_name\}/g, client.full_name)
    .replace(/\{firm_name\}/g, firmName)
    .replace(/\{services_list\}/g, servicesList)

  const subject = `Engagement Letter — ${client.full_name}`
  const now = new Date().toISOString()

  await sendEmail({
    to: client.email,
    subject,
    html: `<div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #111;">
      <pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">${letterBody}</pre>
    </div>`,
  })

  // ── 5. Update client engagement letter status ────────────────────────────────
  await supabase
    .from('clients')
    .update({
      engagement_letter_status: 'sent',
      engagement_letter_sent_at: now,
    })
    .eq('id', client.id)

  // ── 6. Log the send to agent_logs ───────────────────────────────────────────
  const { data: agentLog, error: logError } = await supabase
    .from('agent_logs')
    .insert({
      firm_id: firmId,
      client_id: client.id,
      agent_type: 'intake',
      status: 'sent',
      subject,
      body: letterBody,
      sent_at: now,
      metadata: {
        tally_submission_id: payload.data.submissionId,
        client_email: client.email,
        services_list: servicesList,
      },
    })
    .select()
    .single()

  if (logError || !agentLog) {
    throw new Error(`Failed to write agent log: ${logError?.message}`)
  }

  return { clientId: client.id, agentLogId: agentLog.id }
}

/**
 * Send the approved engagement letter to the client.
 * Called after firm owner approves the agent_log.
 */
export async function sendEngagementLetter(agentLogId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('agent_logs')
    .select('*, clients(full_name, email)')
    .eq('id', agentLogId)
    .single()

  if (!log || log.status !== 'approved') {
    throw new Error('Agent log not found or not approved')
  }

  const client = log.clients as { full_name: string; email: string } | null
  if (!client) throw new Error('Client not found')

  await sendEmail({
    to: client.email,
    subject: log.subject,
    html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <pre style="white-space: pre-wrap; font-family: inherit;">${log.body}</pre>
    </div>`,
  })

  await supabase
    .from('agent_logs')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', agentLogId)

  if (log.client_id) {
    await supabase
      .from('clients')
      .update({
        engagement_letter_status: 'sent',
        engagement_letter_sent_at: new Date().toISOString(),
      })
      .eq('id', log.client_id)
  }
}
