import type { Deadline, Client, FilingType } from '@/lib/supabase/types'
import { formatDate, daysBetween, getDeadlineUrgency } from '@/lib/utils'
import { FILING_TYPE_LABELS } from '@/lib/ai/prompts'

interface DeadlineRow extends Deadline {
  clients: Pick<Client, 'full_name' | 'email'> | null
}

interface DeadlineTableProps {
  deadlines: DeadlineRow[]
}

const URGENCY_STYLES = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-gray-100 text-gray-600',
}

export default function DeadlineTable({ deadlines }: DeadlineTableProps) {
  const today = new Date().toISOString().split('T')[0]

  if (deadlines.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No upcoming deadlines.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filing</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Urgency</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {deadlines.map((deadline) => {
            const daysUntil = daysBetween(today, deadline.due_date)
            const urgency = getDeadlineUrgency(daysUntil)
            return (
              <tr key={deadline.id}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {deadline.clients?.full_name ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  <span className="font-medium">{deadline.filing_type}</span>
                  <span className="ml-1 text-xs text-gray-400">
                    {FILING_TYPE_LABELS[deadline.filing_type as FilingType]}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatDate(deadline.due_date)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${URGENCY_STYLES[urgency]}`}>
                    {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` :
                     daysUntil === 0 ? 'Today' :
                     `${daysUntil}d`}
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
