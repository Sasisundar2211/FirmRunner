import { Metadata } from 'next'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Documents — FirmRunner' }

export default async function DocumentsPage() {
  const supabase = createClient()
  const firmId = await getSessionFirmId()

  const { data: documents } = await supabase
    .from('documents')
    .select('*, clients(full_name)')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })

  const byStatus = {
    required: documents?.filter((d) => d.status === 'required') ?? [],
    requested: documents?.filter((d) => d.status === 'requested') ?? [],
    received: documents?.filter((d) => d.status === 'received') ?? [],
    approved: documents?.filter((d) => d.status === 'approved') ?? [],
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>

      {(['required', 'requested', 'received', 'approved'] as const).map((status) => (
        <section key={status}>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3 capitalize">
            {status} ({byStatus[status].length})
          </h2>
          {byStatus[status].length === 0 ? (
            <p className="text-sm text-gray-400">None</p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {byStatus[status].map((doc) => (
                <div key={doc.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                    <p className="text-xs text-gray-500">
                      {(doc.clients as { full_name: string } | null)?.full_name}
                      {doc.required_by && ` · Needed by ${doc.required_by}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
