import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { AgentType, SubscriptionPlan } from '@/lib/supabase/types'

// ─── Bearer token auth ────────────────────────────────────────────────────────

export function verifyAgentSecret(request: NextRequest): boolean {
  const secret = process.env.AGENT_SECRET
  if (!secret) {
    // If not configured, block all requests rather than open access
    return false
  }
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Key: `${agentType}:${firmId}` → array of call timestamps (ms)
// Works for single-instance deployments (Render). Does not persist across
// restarts or scale across multiple replicas — acceptable for MVP.

const RATE_LIMIT_MAX = 10           // max calls
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000   // per 60 minutes

const callLog = new Map<string, number[]>()

function pruneWindow(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
}

/**
 * Returns true if this call is within limits; false if rate-limited.
 * Always records the call when within limits.
 */
export function checkRateLimit(agentType: AgentType, firmId: string): boolean {
  const key = `${agentType}:${firmId}`
  const now = Date.now()
  const recent = pruneWindow(callLog.get(key) ?? [], now)

  if (recent.length >= RATE_LIMIT_MAX) {
    // Don't record the rejected call
    callLog.set(key, recent)
    return false
  }

  callLog.set(key, [...recent, now])
  return true
}

// ─── Plan gating ─────────────────────────────────────────────────────────────

const PLAN_AGENTS: Record<SubscriptionPlan, AgentType[]> = {
  starter:      ['intake', 'document', 'deadline'],
  professional: ['intake', 'document', 'deadline', 'billing', 'report'],
  enterprise:   ['intake', 'document', 'deadline', 'billing', 'report'],
}

/**
 * Returns the firm's subscription_plan, or 'starter' as a safe default.
 */
async function getFirmPlan(firmId: string): Promise<SubscriptionPlan> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('firms')
    .select('subscription_plan')
    .eq('id', firmId)
    .single()
  return (data?.subscription_plan as SubscriptionPlan | null) ?? 'starter'
}

// ─── Combined guard ───────────────────────────────────────────────────────────

interface AgentGuardResult {
  ok: boolean
  response?: NextResponse
}

/**
 * Call at the top of every n8n-triggered agent route.
 *
 * 1. Verifies Authorization: Bearer <AGENT_SECRET>
 * 2. Checks plan gating — returns 403 if the firm's plan excludes this agent
 * 3. Checks rate limit for this agent + firm
 * 4. On rate limit: logs to agent_logs and returns 429
 *
 * Usage:
 *   const guard = await agentGuard(request, 'document', firm_id)
 *   if (!guard.ok) return guard.response!
 */
export async function agentGuard(
  request: NextRequest,
  agentType: AgentType,
  firmId: string,
): Promise<AgentGuardResult> {
  // 1. Auth
  if (!verifyAgentSecret(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  // 2. Plan gate
  const plan = await getFirmPlan(firmId)
  if (!PLAN_AGENTS[plan].includes(agentType)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Agent '${agentType}' is not available on the ${plan} plan. Upgrade to Professional or higher.`,
          upgrade_required: true,
        },
        { status: 403 },
      ),
    }
  }

  // 3. Rate limit
  if (!checkRateLimit(agentType, firmId)) {
    // Log to agent_logs so the firm owner can see it in the dashboard
    try {
      const supabase = createAdminClient()
      await supabase.from('agent_logs').insert({
        firm_id: firmId,
        agent_type: agentType,
        status: 'skipped',
        subject: `Rate limit reached — ${agentType} agent`,
        body: `Agent was triggered more than ${RATE_LIMIT_MAX} times in 60 minutes for firm ${firmId}. Request rejected.`,
        metadata: { reason: 'rate_limited', limit: RATE_LIMIT_MAX, window_minutes: 60 },
      })
    } catch {
      // Don't fail the 429 response if logging fails
    }

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Rate limit exceeded: max ${RATE_LIMIT_MAX} requests per 60 minutes per firm`,
        },
        { status: 429 },
      ),
    }
  }

  return { ok: true }
}
