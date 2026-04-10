import { NextRequest, NextResponse } from 'next/server'
import { runReportAgent } from '@/lib/agents/report'
import { agentGuard } from '@/lib/agents/agent-auth'

/**
 * POST /api/agents/report
 * n8n scheduled trigger only. Approve/reject is handled by /api/agents/approve.
 *
 * Required header: Authorization: Bearer <AGENT_SECRET>
 * Rate limit: 10 calls per firm_id per 60 minutes
 */
export async function POST(request: NextRequest) {
  let firm_id: string
  let report_month: string | undefined
  try {
    const body = await request.json()
    firm_id = body.firm_id
    report_month = body.report_month
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!firm_id) {
    return NextResponse.json({ error: 'firm_id is required' }, { status: 400 })
  }

  const guard = await agentGuard(request, 'report', firm_id)
  if (!guard.ok) return guard.response!

  const result = await runReportAgent(firm_id, report_month)
  return NextResponse.json({ success: true, ...result })
}
