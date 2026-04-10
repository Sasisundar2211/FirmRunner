import type { AgentLog as AgentLogType } from '@/lib/supabase/types'
import { formatDate } from '@/lib/utils'

interface AgentLogProps {
  logs: AgentLogType[]
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  skipped: 'bg-gray-100 text-gray-600',
}

export default function AgentLog({ logs }: AgentLogProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-gray-400">No agent activity yet.</p>
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
      {logs.map((log) => (
        <div key={log.id} className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-gray-900">{log.subject}</p>
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[log.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {log.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="capitalize">{log.agent_type} agent</span>
            {log.ai_provider && <span>via {log.ai_provider}</span>}
            {log.ai_latency_ms && <span>{log.ai_latency_ms}ms</span>}
            <span>{formatDate(log.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
