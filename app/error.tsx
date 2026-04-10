'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-500 mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
