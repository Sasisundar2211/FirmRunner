'use client'

import { useState, useEffect, useRef } from 'react'
import { saveEngagementLetterTemplate } from './actions'

const MERGE_TAGS = [
  { tag: '{client_name}', description: 'Client full name' },
  { tag: '{firm_name}', description: 'Your firm name' },
  { tag: '{services_list}', description: 'Comma-separated list of services' },
]

interface EngagementLetterEditorProps {
  initialTemplate: string | null
}

export default function EngagementLetterEditor({ initialTemplate }: EngagementLetterEditorProps) {
  const [template, setTemplate] = useState(initialTemplate ?? '')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear pending timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  function showToast(type: 'success' | 'error', message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, message })
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveEngagementLetterTemplate(template)
      showToast('success', 'Template saved.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  function insertTag(tag: string) {
    const ta = document.getElementById('engagement-template') as HTMLTextAreaElement | null
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = template.slice(0, start) + tag + template.slice(end)
    setTemplate(next)
    // Restore cursor after the inserted tag
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + tag.length, start + tag.length)
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">Engagement Letter Template</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Written once, sent automatically when a new client completes intake. Merge tags are
          replaced with real values before sending.
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Merge tag legend */}
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Available merge tags
          </p>
          <div className="flex flex-wrap gap-2">
            {MERGE_TAGS.map(({ tag, description }) => (
              <button
                key={tag}
                type="button"
                title={`Insert ${tag} — ${description}`}
                onClick={() => insertTag(tag)}
                className="inline-flex items-center gap-1.5 rounded border border-brand-200 bg-white px-2 py-0.5 text-xs font-mono text-brand-700 hover:bg-brand-50 transition-colors"
              >
                {tag}
                <span className="font-sans text-gray-400 text-[10px]">— {description}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">Click a tag to insert it at the cursor.</p>
        </div>

        {/* Textarea */}
        <textarea
          id="engagement-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={18}
          placeholder={`Dear {client_name},\n\nThank you for choosing {firm_name}. This letter confirms the terms of our engagement for the following services:\n\n{services_list}\n\n...`}
          className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y font-mono leading-relaxed"
        />

        {/* Footer: char count + save */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{template.length.toLocaleString()} characters</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save template'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mx-6 mb-5 flex items-center gap-2 rounded-md px-4 py-3 text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          {toast.message}
        </div>
      )}
    </div>
  )
}
