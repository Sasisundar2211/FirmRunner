import { Metadata } from 'next'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'
import UpgradeButton from './UpgradeButton'
import type { SubscriptionPlan } from '@/lib/supabase/types'

export const metadata: Metadata = { title: 'Plan & Billing — FirmRunner' }

// Plan order for determining upgrades vs downgrades
const PLAN_RANK: Record<SubscriptionPlan, number> = {
  starter:      1,
  professional: 2,
  enterprise:   3,
}

const PLANS: {
  id: SubscriptionPlan
  label: string
  price: string
  priceId: string
  agents: string[]
  features: string[]
}[] = [
  {
    id: 'starter',
    label: 'Starter',
    price: '$49 / mo',
    priceId: process.env.STRIPE_PRICE_STARTER ?? '',
    agents: ['Intake', 'Document', 'Deadline'],
    features: ['Up to 25 clients', 'Intake, Document & Deadline agents', 'Email approval queue'],
  },
  {
    id: 'professional',
    label: 'Professional',
    price: '$99 / mo',
    priceId: process.env.STRIPE_PRICE_GROWTH ?? '',
    agents: ['Intake', 'Document', 'Deadline', 'Billing', 'Report'],
    features: ['Up to 100 clients', 'All 5 AI agents', 'Monthly report generation', 'Billing reminders'],
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    price: '$199 / mo',
    priceId: process.env.STRIPE_PRICE_SCALE ?? '',
    agents: ['Intake', 'Document', 'Deadline', 'Billing', 'Report'],
    features: ['Unlimited clients', 'All 5 AI agents', 'Priority support', 'Custom agent schedules'],
  },
]

export default async function PlanBillingPage() {
  const supabase = createClient()
  const firmId = await getSessionFirmId()

  const { data: firm } = await supabase
    .from('firms')
    .select('subscription_plan, subscription_status, stripe_subscription_id')
    .eq('id', firmId)
    .single()

  const currentPlan: SubscriptionPlan = firm?.subscription_plan ?? 'starter'
  const currentRank = PLAN_RANK[currentPlan]
  const subStatus = firm?.subscription_status

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Plan &amp; Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your FirmRunner subscription. Upgrades take effect immediately.
        </p>
      </div>

      {/* Current plan summary */}
      <div className="bg-brand-50 border border-brand-200 rounded-lg px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-800">
            Current plan: {PLANS.find((p) => p.id === currentPlan)?.label ?? currentPlan}
          </p>
          {subStatus && (
            <p className="text-xs text-brand-600 mt-0.5 capitalize">
              Subscription status: {subStatus.replace(/_/g, ' ')}
            </p>
          )}
        </div>
        {firm?.stripe_subscription_id && (
          <p className="text-xs text-gray-400 font-mono">{firm.stripe_subscription_id}</p>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          const planRank = PLAN_RANK[plan.id]
          const isDowngrade = planRank < currentRank

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-lg border p-5 flex flex-col gap-4 ${
                isCurrent ? 'border-brand-400 shadow-sm' : 'border-gray-200'
              }`}
            >
              <div>
                <h2 className="text-base font-semibold text-gray-900">{plan.label}</h2>
                <p className="text-2xl font-bold text-gray-900 mt-1">{plan.price}</p>
              </div>

              <ul className="space-y-1.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <UpgradeButton
                priceId={plan.priceId}
                label={`Upgrade to ${plan.label}`}
                isCurrent={isCurrent}
                isDowngrade={isDowngrade}
              />
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">
        Payments are processed securely by Stripe. Cancel any time from your Stripe billing portal.
      </p>
    </div>
  )
}
