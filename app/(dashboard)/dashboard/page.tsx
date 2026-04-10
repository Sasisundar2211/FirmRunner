import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getSessionFirmId } from '@/lib/supabase/server'
import StatsCard from '@/components/dashboard/StatsCard'
import ApprovalQueue from '@/components/agents/ApprovalQueue'

export const metadata: Metadata = { title: 'Dashboard — FirmRunner' }

export default async function DashboardPage() {
  const supabase = createClient()
  const firmId = await getSessionFirmId()

  const { data: stats } = await supabase
    .from('dashboard_stats')
    .select('*')
    .eq('firm_id', firmId)
    .single()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsCard label="Active Clients" value={stats.active_clients} />
          <StatsCard label="Deadlines (7 days)" value={stats.upcoming_deadlines_7d} alert={stats.upcoming_deadlines_7d > 0} />
          <StatsCard label="Overdue Deadlines" value={stats.overdue_deadlines} alert={stats.overdue_deadlines > 0} />
          <StatsCard label="Pending Approvals" value={stats.pending_agent_approvals} alert={stats.pending_agent_approvals > 0} />
        </div>
      )}

      <section>
        <h2 className="text-lg font-medium text-gray-800 mb-3">Agent Approval Queue</h2>
        <ApprovalQueue />
      </section>
    </div>
  )
}
