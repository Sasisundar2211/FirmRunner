'use server'

import { createAdminClient, getSessionFirmId } from '@/lib/supabase/server'

export async function markEngagementLetterSigned(clientId: string): Promise<void> {
  const firmId = await getSessionFirmId()
  const supabase = createAdminClient()

  // Verify ownership before updating — ensure client belongs to this firm
  const { data: existing } = await supabase
    .from('clients')
    .select('id, engagement_letter_status')
    .eq('id', clientId)
    .eq('firm_id', firmId)
    .single()

  if (!existing) throw new Error('Client not found')
  if (existing.engagement_letter_status === 'signed') {
    throw new Error('Engagement letter is already marked as signed')
  }

  const { error } = await supabase
    .from('clients')
    .update({
      engagement_letter_status: 'signed',
      engagement_letter_signed_at: new Date().toISOString(),
    })
    .eq('id', clientId)
    .eq('firm_id', firmId)

  if (error) throw new Error(error.message)
}
