'use client'

import { useEffect, useState, useCallback } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import AgentCard from '@/components/agents/AgentCard'
import type { AgentStatus, AgentType } from '@/lib/supabase/types'

// ─── Relative time helpers ────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 5)  return 'just now'
  if (secs < 60) return `${secs} seconds ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

function timeUntil(iso: string | null): string {
  if (!iso) return 'Not scheduled'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Overdue'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `in ${secs} second${secs !== 1 ? 's' : ''}`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `in ${mins} minute${mins !== 1 ? 's' : ''}`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  if (remMins === 0) return `in ${hrs} hour${hrs !== 1 ? 's' : ''}`
  return `in ${hrs} hour${hrs !== 1 ? 's' : ''} ${remMins} minute${remMins !== 1 ? 's' : ''}`
}

function inferStatus(data: AgentStatus | null | undefined): 'idle' | 'running' | 'error' {
  if (!data) return 'idle'
  if (data.error_count_24h > 0) return 'error'
  if (data.last_run_at) {
    const ageMs = Date.now() - new Date(data.last_run_at).getTime()
    if (ageMs < 2 * 60 * 1000) return 'running' // still within a 2-minute run window
  }
  return 'idle'
}

// ─── Agent definitions ────────────────────────────────────────────────────────

const AGENTS: { type: AgentType; name: string; description: string; fallbackSchedule: string }[] = [
  {
    type: 'intake',
    name: 'Intake Agent',
    description: 'Processes Tally form submissions, creates client records, and sends engagement letters.',
    fallbackSchedule: 'Triggered by webhook',
  },
  {
    type: 'document',
    name: 'Document Agent',
    description: 'Tracks missing documents and sends reminder emails with upload links.',
    fallbackSchedule: 'Daily at 9:00 AM',
  },
  {
    type: 'deadline',
    name: 'Deadline Agent',
    description: 'Sends graduated alerts at 30/14/7/3/1 days before filing deadlines.',
    fallbackSchedule: 'Daily at 8:00 AM',
  },
  {
    type: 'billing',
    name: 'Billing Agent',
    description: 'Sends invoice reminders and escalating notices for unpaid invoices.',
    fallbackSchedule: 'Daily at 10:00 AM',
  },
  {
    type: 'report',
    name: 'Report Agent',
    description: 'Generates monthly client status summaries for firm owner review.',
    fallbackSchedule: '1st of each month',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentStatusCards() {
  const [statusMap, setStatusMap] = useState<Partial<Record<AgentType, AgentStatus>>>({})
  const [loading, setLoading] = useState(true)
  // Tick counter drives re-render every 60s so relative times stay current
  const [, setTick] = useState(0)

  const fetchStatus = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase
      .from('agent_status')
      .select('*')
    if (data) {
      const map: Partial<Record<AgentType, AgentStatus>> = {}
      for (const row of data) {
        map[row.agent_type as AgentType] = row as AgentStatus
      }
      setStatusMap(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // setState calls inside fetchStatus are asynchronous (after awaiting Supabase).
    // The rule set-state-in-effect incorrectly flags async setState as synchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStatus()

    const interval = setInterval(() => {
      void fetchStatus()
      setTick((t) => t + 1)
    }, 60_000)

    return () => clearInterval(interval)
  }, [fetchStatus])

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {AGENTS.map((agent) => {
        const data = statusMap[agent.type] ?? null
        return (
          <AgentCard
            key={agent.type}
            name={agent.name}
            description={agent.description}
            fallbackSchedule={agent.fallbackSchedule}
            status={loading ? 'idle' : inferStatus(data)}
            lastRun={timeAgo(data?.last_run_at ?? null)}
            nextRun={timeUntil(data?.next_run_at ?? null)}
            schedule={data?.cron_schedule ?? null}
            errorCount={data?.error_count_24h ?? 0}
          />
        )
      })}
    </div>
  )
}
