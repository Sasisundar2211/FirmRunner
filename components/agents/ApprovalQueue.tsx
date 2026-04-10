'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { QueuedEmail } from '@/lib/supabase/types'

const AGENT_LABEL: Record<string, string> = {
  intake: 'Intake',
  document: 'Document',
  deadline: 'Deadline',
  billing: 'Billing',
  report: 'Report',
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface CardState {
  processing: boolean
  rejecting: boolean      // rejection reason input is visible
  rejectReason: string
}

export default function ApprovalQueue() {
  const router = useRouter()
  const [emails, setEmails] = useState<QueuedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [cardState, setCardState] = useState<Record<string, CardState>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPending() {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase
        .from('queued_emails')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      setEmails(data ?? [])
      setLoading(false)
    }
    fetchPending()
  }, [])

  function getCardState(id: string): CardState {
    return cardState[id] ?? { processing: false, rejecting: false, rejectReason: '' }
  }

  function patchCardState(id: string, patch: Partial<CardState>) {
    setCardState((prev) => ({ ...prev, [id]: { ...getCardState(id), ...patch } }))
  }

  async function handleAction(email: QueuedEmail, action: 'approve' | 'reject') {
    patchCardState(email.id, { processing: true })
    try {
      const res = await fetch('/api/agents/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId: email.id,
          action,
          reason: getCardState(email.id).rejectReason || undefined,
        }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error ?? 'Request failed')
      }
      // Remove from list and refresh server components (updates sidebar badge)
      setEmails((prev) => prev.filter((e) => e.id !== email.id))
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong.')
      patchCardState(email.id, { processing: false })
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
        <p className="text-sm text-gray-400">Loading approval queue…</p>
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
        <p className="text-sm text-gray-400">No pending approvals.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {emails.map((email) => {
        const state = getCardState(email.id)
        const preview = stripHtml(email.html_body).slice(0, 200)
        const isExpanded = expanded === email.id

        return (
          <div key={email.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Card header */}
            <div className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{email.subject}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                  <span className="capitalize">{AGENT_LABEL[email.agent_type] ?? email.agent_type} agent</span>
                  <span>·</span>
                  <span>To: {email.to_email}</span>
                  <span>·</span>
                  <span>{timeAgo(email.created_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setExpanded(isExpanded ? null : email.id)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  {isExpanded ? 'Hide' : 'Preview'}
                </button>

                {!state.rejecting && (
                  <>
                    <button
                      onClick={() => patchCardState(email.id, { rejecting: true })}
                      disabled={state.processing}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(email, 'approve')}
                      disabled={state.processing}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded hover:bg-brand-700 disabled:opacity-50"
                    >
                      {state.processing ? 'Sending…' : 'Approve & Send'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Preview pane */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-700 whitespace-pre-wrap mt-3 leading-relaxed font-sans">
                  {preview}{preview.length >= 200 ? '…' : ''}
                </p>
              </div>
            )}

            {/* Rejection reason input */}
            {state.rejecting && (
              <div className="px-4 pb-4 border-t border-gray-100 bg-red-50">
                <p className="text-xs font-medium text-red-700 mt-3 mb-1.5">Reason for rejection (optional)</p>
                <textarea
                  value={state.rejectReason}
                  onChange={(e) => patchCardState(email.id, { rejectReason: e.target.value })}
                  rows={2}
                  placeholder="e.g. Wrong tone, needs revision…"
                  className="w-full rounded border border-red-200 px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-red-300 resize-none"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleAction(email, 'reject')}
                    disabled={state.processing}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {state.processing ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                  <button
                    onClick={() => patchCardState(email.id, { rejecting: false, rejectReason: '' })}
                    disabled={state.processing}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
