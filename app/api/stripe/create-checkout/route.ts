import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient, getSessionFirmId } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

export async function POST(request: NextRequest) {
  // Auth
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let priceId: string
  try {
    const body = await request.json()
    priceId = body.priceId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!priceId || typeof priceId !== 'string') {
    return NextResponse.json({ error: 'priceId is required' }, { status: 400 })
  }

  const firmId = await getSessionFirmId()
  const admin = createAdminClient()

  // Fetch firm to get or create stripe_customer_id
  const { data: firm } = await admin
    .from('firms')
    .select('id, name, stripe_customer_id')
    .eq('id', firmId)
    .single()

  if (!firm) {
    return NextResponse.json({ error: 'Firm not found' }, { status: 404 })
  }

  const stripe = getStripe()
  let customerId = firm.stripe_customer_id

  if (!customerId) {
    // Create a Stripe customer tied to this firm
    const customer = await stripe.customers.create({
      email: user.email,
      name: firm.name,
      metadata: { firm_id: firmId },
    })
    customerId = customer.id

    await admin
      .from('firms')
      .update({ stripe_customer_id: customerId })
      .eq('id', firmId)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/dashboard?upgraded=true`,
    cancel_url: `${APP_URL}/dashboard/settings/billing`,
    metadata: { firm_id: firmId },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
