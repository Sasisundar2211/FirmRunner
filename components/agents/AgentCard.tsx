interface AgentCardProps {
  name: string
  description: string
  fallbackSchedule: string
  status: 'idle' | 'running' | 'error'
  lastRun: string
  nextRun: string
  schedule: string | null
  errorCount: number
}

const STATUS_CONFIG = {
  idle:    { label: 'Idle',    className: 'bg-gray-100 text-gray-500' },
  running: { label: 'Running', className: 'bg-blue-100 text-blue-700' },
  error:   { label: 'Error',   className: 'bg-red-100  text-red-700'  },
}

export default function AgentCard({
  name,
  description,
  fallbackSchedule,
  status,
  lastRun,
  nextRun,
  schedule,
  errorCount,
}: AgentCardProps) {
  const { label, className } = STATUS_CONFIG[status]
  const hasErrors = errorCount > 0

  return (
    <div className={`bg-white rounded-lg border p-4 flex flex-col gap-3 ${
      hasErrors ? 'border-red-300' : 'border-gray-200'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 leading-tight">{name}</h3>
        <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>
          {label}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>

      {/* Timing rows */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Last run</span>
          <span className="text-gray-700 font-medium">{lastRun}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Next run</span>
          <span className={`font-medium ${
            nextRun === 'Overdue' ? 'text-orange-600' : 'text-gray-700'
          }`}>
            {nextRun}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Schedule</span>
          <span className="text-gray-600">{schedule ?? fallbackSchedule}</span>
        </div>
      </div>

      {/* Error count — only shown when non-zero */}
      {hasErrors && (
        <div className="flex items-center gap-1.5 rounded-md bg-red-50 border border-red-200 px-2.5 py-1.5">
          <span className="text-red-500 text-xs">⚠</span>
          <span className="text-xs text-red-700 font-medium">
            {errorCount} error{errorCount !== 1 ? 's' : ''} in last 24h
          </span>
        </div>
      )}
    </div>
  )
}
