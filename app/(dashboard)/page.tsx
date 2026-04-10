import { redirect } from 'next/navigation'

// The (dashboard) route group root has no content — redirect to the actual dashboard.
export default function RootPage() {
  redirect('/dashboard')
}
