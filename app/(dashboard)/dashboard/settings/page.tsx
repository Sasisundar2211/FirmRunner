import { Metadata } from 'next'
import Link from 'next/link'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'
import EngagementLetterEditor from './EngagementLetterEditor'

export const metadata: Metadata = { title: 'Settings — FirmRunner' }

export default async function SettingsPage() {
  const supabase = createClient()
  const firmId = await getSessionFirmId()

  const { data: firm } = await supabase
    .from('firms')
    .select('engagement_letter_template, subscription_plan')
    .eq('id', firmId)
    .single()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

      {/* Plan summary + link to billing */}
      <div className="bg-white rounded-lg border border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">Subscription plan</p>
          <p className="text-sm text-gray-500 capitalize mt-0.5">
            {firm?.subscription_plan ?? 'starter'}
          </p>
        </div>
        <Link
          href="/dashboard/settings/billing"
          className="px-3 py-1.5 text-sm font-medium text-brand-600 border border-brand-200 rounded-md hover:bg-brand-50 transition-colors"
        >
          Manage plan →
        </Link>
      </div>

      <EngagementLetterEditor initialTemplate={firm?.engagement_letter_template ?? null} />
    </div>
  )
}
