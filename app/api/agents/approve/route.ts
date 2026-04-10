import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'

/**
 * POST /api/agents/approve
 * Approve or reject a pending queued email.
 *
 * Body: { emailId: string, action: 'approve' | 'reject' }
 *
 * RLS on queued_emails ensures the row can only be fetched if it belongs
 * to the requesting user's firm — no explicit firm_id check needed.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve firm_users.id for reviewed_by (references firm_users, not auth.users)
  const { data: firmUser } = await supabase
    .from('firm_users')
    .select('id, firm_id')
    .eq('user_id', user.id)
    .single()

  if (!firmUser) {
    return NextResponse.json({ error: 'No firm association found' }, { status: 403 })
  }

  let body: { emailId?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { emailId, action } = body

  if (!emailId || typeof emailId !== 'string') {
    return NextResponse.json({ error: 'emailId is required' }, { status: 400 })
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  // Fetch the queued email — RLS scopes this to the user's firm automatically
  const { data: email } = await supabase
    .from('queued_emails')
    .select('*')
    .eq('id', emailId)
    .single()

  if (!email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }
  if (email.status !== 'pending') {
    return NextResponse.json({ error: `Already processed (status: ${email.status})` }, { status: 409 })
  }

  const now = new Date().toISOString()

  if (action === 'approve') {
    // Send the email via Resend
    const { error: sendError } = await sendEmail({
      to: email.to_email,
      subject: email.subject,
      html: email.html_body,
    })

    if (sendError) {
      return NextResponse.json({ error: `Failed to send email: ${sendError.message}` }, { status: 502 })
    }

    await supabase
      .from('queued_emails')
      .update({ status: 'sent', reviewed_at: now, reviewed_by: firmUser.id })
      .eq('id', emailId)

    return NextResponse.json({ success: true, action: 'sent' })
  }

  // action === 'reject'
  await supabase
    .from('queued_emails')
    .update({ status: 'rejected', reviewed_at: now, reviewed_by: firmUser.id })
    .eq('id', emailId)

  return NextResponse.json({ success: true, action: 'rejected' })
}
