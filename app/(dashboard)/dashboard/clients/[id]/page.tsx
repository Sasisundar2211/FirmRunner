import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Metadata } from 'next'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'
import EngagementLetterActions from './EngagementLetterActions'
import { FILING_TYPE_LABELS } from '@/lib/ai/prompts'
import type { FilingType } from '@/lib/supabase/types'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: 'Client — FirmRunner' }
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
      <span className="w-40 flex-shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  )
}

export default async function ClientDetailPage({ params }: Props) {
  const supabase = createClient()
  const firmId = await getSessionFirmId()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .eq('firm_id', firmId)   // scoped to this firm — prevents cross-tenant access
    .single()

  if (!client) notFound()

  const filingLabels = client.filing_types.length > 0
    ? client.filing_types.map((ft: FilingType) => FILING_TYPE_LABELS[ft] ?? ft).join(', ')
    : '—'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/clients"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Clients
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{client.full_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{client.email}</p>
        </div>
        <span className={`mt-1 inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
          client.status === 'active'   ? 'bg-green-100 text-green-800' :
          client.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                                         'bg-blue-100 text-blue-800'
        }`}>
          {client.status}
        </span>
      </div>

      {/* Engagement letter status + action */}
      <EngagementLetterActions
        clientId={client.id}
        clientName={client.full_name}
        initialStatus={client.engagement_letter_status}
      />

      {/* Client details */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Details</h2>
        </div>
        <div className="px-6 py-2">
          <DetailRow label="Email" value={client.email} />
          <DetailRow label="Phone" value={client.phone ?? '—'} />
          <DetailRow
            label="Entity type"
            value={client.entity_type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          />
          <DetailRow label="Filing types" value={filingLabels} />
          <DetailRow
            label="Assigned staff"
            value={client.assigned_staff_email ?? '—'}
          />
          <DetailRow
            label="Intake completed"
            value={
              client.intake_completed_at
                ? new Date(client.intake_completed_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })
                : '—'
            }
          />
          <DetailRow
            label="Engagement sent"
            value={
              client.engagement_letter_sent_at
                ? new Date(client.engagement_letter_sent_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })
                : '—'
            }
          />
          <DetailRow
            label="Engagement signed"
            value={
              client.engagement_letter_signed_at
                ? new Date(client.engagement_letter_signed_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })
                : '—'
            }
          />
          {client.notes && (
            <DetailRow label="Notes" value={<span className="whitespace-pre-wrap">{client.notes}</span>} />
          )}
        </div>
      </div>
    </div>
  )
}
