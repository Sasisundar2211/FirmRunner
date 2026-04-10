import { createAdminClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/ai/ai'
import { documentReminderPrompt } from '@/lib/ai/prompts'
import { checkEngagementLetter } from '@/lib/agents/guards'
import { documentRequestEmail } from '@/lib/email/templates/document-request'

/**
 * Document Agent: finds clients with pending documents and queues reminder emails.
 * Triggered by n8n on a schedule (e.g., daily at 9am).
 */
export async function runDocumentAgent(firmId: string): Promise<{ queued: number }> {
  const supabase = createAdminClient()

  // Get firm name and settings (upload form URL)
  const { data: firm } = await supabase
    .from('firms')
    .select('name, settings')
    .eq('id', firmId)
    .single()
  const firmName = firm?.name ?? 'Our Firm'
  const firmSettings = (firm?.settings ?? {}) as Record<string, unknown>
  const uploadUrl = typeof firmSettings.upload_form_url === 'string'
    ? firmSettings.upload_form_url
    : null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.firmrunner.app'

  // Find clients with pending/required documents not yet reminded recently
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: pendingDocs } = await supabase
    .from('documents')
    .select('*, clients(id, full_name, email)')
    .eq('firm_id', firmId)
    .in('status', ['required', 'requested'])
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${oneDayAgo}`)

  if (!pendingDocs || pendingDocs.length === 0) return { queued: 0 }

  // Group by client — include all; guard checks engagement letter status per client
  const byClient = new Map<string, typeof pendingDocs>()
  for (const doc of pendingDocs) {
    const clientId = (doc.clients as { id: string } | null)?.id ?? ''
    if (!clientId) continue
    if (!byClient.has(clientId)) byClient.set(clientId, [])
    byClient.get(clientId)!.push(doc)
  }

  let queued = 0

  for (const [clientId, docs] of byClient) {
    const client = docs[0].clients as { id: string; full_name: string; email: string }

    // ── Engagement letter guard ──────────────────────────────────────────────
    const guard = await checkEngagementLetter(
      firmId, clientId, 'document',
      `Document Request — ${client.full_name}`
    )
    if (guard.skipped) continue
    // ────────────────────────────────────────────────────────────────────────

    const prompt = documentReminderPrompt({
      firmName,
      client: { full_name: client.full_name },
      missingDocuments: docs.map((d) => ({
        name: d.name,
        description: d.description,
        required_by: d.required_by,
      })),
    })

    const { text: emailBody, provider } = await generateText(prompt, {
      firmId,
      clientId,
      agentType: 'document',
    })

    const subject = `Document Request — ${client.full_name}`

    // Build acknowledge token (base64url-encoded, 7-day expiry)
    const tokenPayload = {
      clientId,
      firmId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')
    const acknowledgeUrl = `${appUrl}/api/client-response/${token}?action=acknowledge`

    const htmlBody = documentRequestEmail({ firmName, emailBody, uploadUrl, acknowledgeUrl })

    await supabase.from('agent_logs').insert({
      firm_id: firmId,
      client_id: clientId,
      agent_type: 'document',
      status: 'pending',
      subject,
      body: emailBody,
      ai_provider: provider,
      metadata: {
        client_email: client.email,
        document_ids: docs.map((d) => d.id),
        document_count: docs.length,
      },
    })

    // Queue email for firm owner approval — no direct send
    await supabase.from('queued_emails').insert({
      firm_id: firmId,
      client_id: clientId,
      agent_type: 'document',
      to_email: client.email,
      subject,
      html_body: htmlBody,
    })

    // Mark reminder timestamp
    await supabase
      .from('documents')
      .update({ reminder_sent_at: new Date().toISOString() })
      .in('id', docs.map((d) => d.id))

    queued++
  }

  return { queued }
}
