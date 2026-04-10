import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

interface TokenPayload {
  clientId: string
  firmId: string
  expiresAt: string
}

function htmlPage(title: string, heading: string, message: string, isError = false): NextResponse {
  const color = isError ? '#DC2626' : '#16A34A'
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:sans-serif;">
  <div style="max-width:480px;margin:80px auto;padding:40px;background:#ffffff;
              border-radius:8px;border:1px solid #E5E7EB;text-align:center;">
    <div style="width:56px;height:56px;border-radius:50%;background:${isError ? '#FEF2F2' : '#F0FDF4'};
                margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:28px;">
      ${isError ? '✕' : '✓'}
    </div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">${heading}</h1>
    <p style="margin:0;font-size:15px;color:#6B7280;line-height:1.6;">${message}</p>
  </div>
</body>
</html>`
  return new NextResponse(html, {
    status: isError ? 400 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function decodeToken(raw: string): TokenPayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8')
    const payload = JSON.parse(json) as unknown
    if (
      typeof payload !== 'object' || payload === null ||
      !('clientId' in payload) || !('firmId' in payload) || !('expiresAt' in payload)
    ) return null
    return payload as TokenPayload
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action !== 'acknowledge') {
    return htmlPage('Invalid Link', 'Invalid Link', 'This link is not valid.', true)
  }

  // Decode and validate token
  const payload = decodeToken(params.token)
  if (!payload) {
    return htmlPage('Invalid Link', 'Invalid Link', 'This link could not be decoded. Please contact your accountant.', true)
  }

  // Check expiry
  if (new Date(payload.expiresAt) < new Date()) {
    return htmlPage(
      'Link Expired',
      'This link has expired',
      'Document request links are valid for 7 days. Please contact your accountant for a new link.',
      true
    )
  }

  const supabase = createAdminClient()

  // Verify client exists and belongs to the firm
  const { data: client } = await supabase
    .from('clients')
    .select('id, full_name')
    .eq('id', payload.clientId)
    .eq('firm_id', payload.firmId)
    .single()

  if (!client) {
    return htmlPage('Invalid Link', 'Invalid Link', 'This link is no longer valid.', true)
  }

  // Update pending documents from 'required' → 'requested'
  await supabase
    .from('documents')
    .update({ status: 'requested' })
    .eq('client_id', payload.clientId)
    .eq('firm_id', payload.firmId)
    .eq('status', 'required')

  // Log the acknowledgement
  await supabase.from('agent_logs').insert({
    firm_id: payload.firmId,
    client_id: payload.clientId,
    agent_type: 'document',
    status: 'sent',
    subject: `Document request acknowledged — ${client.full_name}`,
    body: `Client ${client.full_name} acknowledged the document request via the email link.`,
    metadata: { action: 'acknowledge', acknowledged_at: new Date().toISOString() },
  })

  return htmlPage(
    'Request Acknowledged',
    'Thank you!',
    'You have acknowledged the document request. Your accountant has been notified. Please upload your documents at your earliest convenience.'
  )
}
