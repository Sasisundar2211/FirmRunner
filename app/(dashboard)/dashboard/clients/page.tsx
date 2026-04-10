import { Metadata } from 'next'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'
import ClientList from '@/components/dashboard/ClientList'

export const metadata: Metadata = { title: 'Clients — FirmRunner' }

export default async function ClientsPage() {
  const supabase = createClient()
  const firmId = await getSessionFirmId()

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('firm_id', firmId)
    .order('full_name')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Clients</h1>
      </div>
      <ClientList clients={clients ?? []} />
    </div>
  )
}
