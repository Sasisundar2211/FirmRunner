'use server'

import { createAdminClient, getSessionFirmId } from '@/lib/supabase/server'

export async function saveEngagementLetterTemplate(template: string): Promise<void> {
  const firmId = await getSessionFirmId()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('firms')
    .update({ engagement_letter_template: template.trim() || null })
    .eq('id', firmId)

  if (error) throw new Error(error.message)
}
