import { type ClassValue, clsx } from 'clsx'

// Lightweight classname helper (works without clsx installed — falls back to join)
export function cn(...inputs: ClassValue[]): string {
  try {
    return clsx(inputs)
  } catch {
    return inputs.filter(Boolean).join(' ')
  }
}

/** Format cents to USD string: 12500 → "$125.00" */
export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Days between two ISO date strings (positive = future) */
export function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

/** Format ISO date to "Jan 15, 2025" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Returns urgency level based on days until due */
export function getDeadlineUrgency(daysUntilDue: number): 'critical' | 'high' | 'medium' | 'low' {
  if (daysUntilDue < 0) return 'critical'
  if (daysUntilDue <= 3) return 'critical'
  if (daysUntilDue <= 7) return 'high'
  if (daysUntilDue <= 14) return 'medium'
  return 'low'
}

/** Verify n8n webhook signature */
export function verifyN8nSignature(
  body: string,
  signature: string | null
): boolean {
  if (!process.env.N8N_WEBHOOK_SECRET) return true // skip in dev
  if (!signature) return false
  // Simple shared-secret check — n8n sends X-Webhook-Secret header
  return signature === process.env.N8N_WEBHOOK_SECRET
}
