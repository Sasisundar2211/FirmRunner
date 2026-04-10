import { createAdminClient } from '@/lib/supabase/server'
import type { AgentType } from '@/lib/supabase/types'

export interface GuardResult {
  skipped: boolean
  reason?: string
}

/**
 * Engagement letter guard — must be called before any agent acts on a client.
 *
 * Fetches the client's engagement_letter_status from Supabase and verifies it
 * is 'signed'. If not, logs a 'skipped' entry to agent_logs (so the firm owner
 * can see why the agent bypassed this client) and returns { skipped: true }.
 *
 * Legal requirement: agents must not email a client until the engagement letter
 * has been signed, not merely sent.
 */
export async function checkEngagementLetter(
  firmId: string,
  clientId: string,
  agentType: AgentType,
  subject: string
): Promise<GuardResult> {
  const supabase = createAdminClient()

  const { data: client } = await supabase
    .from('clients')
    .select('engagement_letter_status')
    .eq('id', clientId)
    .single()

  if (client?.engagement_letter_status === 'signed') {
    return { skipped: false }
  }

  await supabase.from('agent_logs').insert({
    firm_id: firmId,
    client_id: clientId,
    agent_type: agentType,
    status: 'skipped',
    subject,
    body: 'Skipped: engagement letter has not been signed by the client.',
    metadata: { reason: 'engagement_letter_unsigned' },
  })

  return { skipped: true, reason: 'engagement_letter_unsigned' }
}
