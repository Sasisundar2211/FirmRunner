import { Metadata } from 'next'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'
import DeadlineTable from '@/components/dashboard/DeadlineTable'

export const metadata: Metadata = { title: 'Deadlines — FirmRunner' }

export default async function DeadlinesPage() {
  const supabase = createClient()
  const firmId = await getSessionFirmId()

  const { data: deadlines } = await supabase
    .from('deadlines')
    .select('*, clients(full_name, email)')
    .eq('firm_id', firmId)
    .not('status', 'eq', 'completed')
    .order('due_date', { ascending: true })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Deadlines</h1>
      <DeadlineTable deadlines={deadlines ?? []} />
    </div>
  )
}
