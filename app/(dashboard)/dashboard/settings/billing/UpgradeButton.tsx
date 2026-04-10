'use client'

import { useState } from 'react'

interface UpgradeButtonProps {
  priceId: string
  label: string
  isCurrent: boolean
  isDowngrade: boolean
}

export default function UpgradeButton({ priceId, label, isCurrent, isDowngrade }: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isCurrent) {
    return (
      <span className="inline-flex items-center px-4 py-2 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-md">
        Current plan
      </span>
    )
  }

  if (isDowngrade) {
    return (
      <span className="text-xs text-gray-400">Contact support to downgrade</span>
    )
  }

  async function handleUpgrade() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create checkout session')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Redirecting…' : label}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
