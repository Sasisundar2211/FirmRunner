'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markEngagementLetterSigned } from './actions'
import type { EngagementLetterStatus } from '@/lib/supabase/types'

const STATUS_BADGE: Record<EngagementLetterStatus, { label: string; className: string }> = {
  not_sent: { label: 'Not sent',  className: 'bg-gray-100 text-gray-600' },
  sent:     { label: 'Sent',      className: 'bg-yellow-100 text-yellow-800' },
  signed:   { label: 'Signed',    className: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined',  className: 'bg-red-100 text-red-800' },
}

interface Props {
  clientId: string
  clientName: string
  initialStatus: EngagementLetterStatus
}

export default function EngagementLetterActions({ clientId, clientName, initialStatus }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<EngagementLetterStatus>(initialStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const badge = STATUS_BADGE[status]

  async function handleMarkSigned() {
    const confirmed = window.confirm(
      `Mark this client's engagement letter as signed? This will allow all agents to run for this client.`
    )
    if (!confirmed) return

    setLoading(true)
    setError(null)
    try {
      await markEngagementLetterSigned(clientId)
      setStatus('signed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">Engagement Letter</h2>
      </div>

      <div className="px-6 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Status</span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        {status === 'signed' && (
          <span className="text-xs text-gray-400">
            Letter signed — agents are active for {clientName}
          </span>
        )}

        {status === 'sent' && (
          <button
            onClick={handleMarkSigned}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Updating...' : 'Mark as Signed'}
          </button>
        )}

        {status === 'not_sent' && (
          <span className="text-xs text-gray-400">
            Send the engagement letter before marking it signed
          </span>
        )}

        {status === 'declined' && (
          <span className="text-xs text-red-500">
            Client declined — contact them to resolve
          </span>
        )}
      </div>

      {error && (
        <div className="mx-6 mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
