import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/server'
import type { SubscriptionPlan } from '@/lib/supabase/types'

/**
 * Map a Stripe price ID to a FirmRunner subscription plan.
 * Falls back to 'starter' for unknown prices.
 */
function priceIdToPlan(priceId: string): SubscriptionPlan {
  if (priceId === process.env.STRIPE_PRICE_SCALE)   return 'enterprise'
  if (priceId === process.env.STRIPE_PRICE_GROWTH)  return 'professional'
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter'
  return 'starter'
}

/**
 * POST /api/webhooks/stripe
 * Handles Stripe billing events.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event
  try {
    event = constructWebhookEvent(body, signature)
  } catch (err) {
    console.error('[Stripe webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object
        await supabase
          .from('invoices')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('stripe_invoice_id', invoice.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        await supabase
          .from('invoices')
          .update({ status: 'overdue' })
          .eq('stripe_invoice_id', invoice.id)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object

        // Determine plan from the first subscription item's price
        const priceId = sub.items?.data?.[0]?.price?.id ?? ''
        const plan = priceIdToPlan(priceId)

        await supabase
          .from('firms')
          .update({
            subscription_plan: plan,
            subscription_status: sub.status as never,
            stripe_subscription_id: sub.id,
          })
          .eq('stripe_customer_id', sub.customer as string)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabase
          .from('firms')
          .update({
            subscription_status: 'canceled',
            subscription_plan: 'starter',   // downgrade to starter on cancel
          })
          .eq('stripe_customer_id', sub.customer as string)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error(`[Stripe webhook] Error handling ${event.type}:`, err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
