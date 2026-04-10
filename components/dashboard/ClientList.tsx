import Link from 'next/link'
import type { Client, EngagementLetterStatus } from '@/lib/supabase/types'

const EL_BADGE: Record<EngagementLetterStatus, { label: string; className: string }> = {
  not_sent: { label: 'Not sent', className: 'bg-gray-100 text-gray-500' },
  sent:     { label: 'Sent',     className: 'bg-yellow-100 text-yellow-800' },
  signed:   { label: 'Signed',   className: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-700' },
}

interface ClientListProps {
  clients: Client[]
}

export default function ClientList({ clients }: ClientListProps) {
  if (clients.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No clients yet. They will appear here after intake form submissions.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filings</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Engaged</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {clients.map((client) => {
            const elBadge = EL_BADGE[client.engagement_letter_status]
            return (
              <tr key={client.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-brand-700 hover:text-brand-900">
                  <Link href={`/dashboard/clients/${client.id}`}>{client.full_name}</Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{client.email}</td>
                <td className="px-4 py-3 text-sm text-gray-500 capitalize">{client.entity_type.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{client.filing_types.join(', ') || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    client.status === 'active'   ? 'bg-green-100 text-green-800' :
                    client.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                                                   'bg-blue-100 text-blue-800'
                  }`}>
                    {client.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${elBadge.className}`}>
                    {elBadge.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
