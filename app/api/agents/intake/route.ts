import { NextRequest, NextResponse } from 'next/server'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'
import { sendEngagementLetter } from '@/lib/agents/intake'

/**
 * POST /api/agents/intake
 * Actions: approve | reject an intake agent_log (engagement letter).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, agentLogId } = await request.json()
  if (!action || !agentLogId) {
    return NextResponse.json({ error: 'Missing action or agentLogId' }, { status: 400 })
  }

  const firmId = await getSessionFirmId()

  // Verify the log belongs to this firm
  const { data: log } = await supabase
    .from('agent_logs')
    .select('id, firm_id, status')
    .eq('id', agentLogId)
    .eq('firm_id', firmId)
    .single()

  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (log.status !== 'pending') {
    return NextResponse.json({ error: 'Log already processed' }, { status: 409 })
  }

  if (action === 'approve') {
    await supabase
      .from('agent_logs')
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', agentLogId)

    await sendEngagementLetter(agentLogId)
    return NextResponse.json({ success: true, action: 'sent' })
  }

  if (action === 'reject') {
    await supabase
      .from('agent_logs')
      .update({ status: 'skipped' })
      .eq('id', agentLogId)
    return NextResponse.json({ success: true, action: 'rejected' })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
