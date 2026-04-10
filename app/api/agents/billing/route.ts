import { NextRequest, NextResponse } from 'next/server'
import { runBillingAgent } from '@/lib/agents/billing'
import { agentGuard } from '@/lib/agents/agent-auth'

/**
 * POST /api/agents/billing
 * n8n scheduled trigger only. Approve/reject is handled by /api/agents/approve.
 *
 * Required header: Authorization: Bearer <AGENT_SECRET>
 * Rate limit: 10 calls per firm_id per 60 minutes
 */
export async function POST(request: NextRequest) {
  let firm_id: string
  try {
    const body = await request.json()
    firm_id = body.firm_id
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!firm_id) {
    return NextResponse.json({ error: 'firm_id is required' }, { status: 400 })
  }

  const guard = await agentGuard(request, 'billing', firm_id)
  if (!guard.ok) return guard.response!

  const result = await runBillingAgent(firm_id)
  return NextResponse.json({ success: true, ...result })
}
