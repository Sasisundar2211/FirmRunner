import { Metadata } from 'next'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'
import { formatCurrency, formatDate, daysBetween } from '@/lib/utils'

export const metadata: Metadata = { title: 'Billing — FirmRunner' }

export default async function BillingPage() {
  const supabase = createClient()
  const firmId = await getSessionFirmId()
  const today = new Date().toISOString().split('T')[0]

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, clients(full_name)')
    .eq('firm_id', firmId)
    .order('due_date', { ascending: true })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(invoices ?? []).map((invoice) => {
              const daysPast = daysBetween(invoice.due_date, today)
              return (
                <tr key={invoice.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {(invoice.clients as { full_name: string } | null)?.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {formatCurrency(invoice.amount_cents)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(invoice.due_date)}
                    {daysPast > 0 && invoice.status !== 'paid' && (
                      <span className="ml-2 text-red-500 text-xs">{daysPast}d overdue</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                      invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
