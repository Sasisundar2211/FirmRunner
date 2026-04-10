import { NextRequest, NextResponse } from 'next/server'
import { processIntakeWebhook, type TallyWebhookPayload } from '@/lib/agents/intake'
import { verifyN8nSignature } from '@/lib/utils'

/**
 * POST /api/webhooks/tally
 * Receives Tally.so form submissions via n8n workflow.
 * n8n forwards the Tally payload with an X-Webhook-Secret header.
 *
 * Expected body: { firm_id: string, payload: TallyWebhookPayload }
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  const body = await request.text()

  if (!verifyN8nSignature(body, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let data: { firm_id: string; payload: TallyWebhookPayload }
  try {
    data = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!data.firm_id || !data.payload) {
    return NextResponse.json({ error: 'Missing firm_id or payload' }, { status: 400 })
  }

  try {
    const result = await processIntakeWebhook(data.payload, data.firm_id)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[Tally webhook]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
