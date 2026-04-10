import { Metadata } from 'next'
import { createClient, getSessionFirmId } from '@/lib/supabase/server'
import AgentStatusCards from '@/components/agents/AgentStatusCards'
import AgentLog from '@/components/agents/AgentLog'

export const metadata: Metadata = { title: 'Agents — FirmRunner' }

export default async function AgentsPage() {
  const supabase = createClient()
  const firmId = await getSessionFirmId()

  const { data: recentLogs } = await supabase
    .from('agent_logs')
    .select('*')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">AI Agents</h1>

      {/* Live status cards — client component, fetches agent_status view, refreshes every 60s */}
      <AgentStatusCards />

      <section>
        <h2 className="text-lg font-medium text-gray-800 mb-3">Recent Activity</h2>
        <AgentLog logs={recentLogs ?? []} />
      </section>
    </div>
  )
}
