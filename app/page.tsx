import { redirect } from 'next/navigation'

// Root redirects to dashboard (middleware handles auth check)
export default function RootPage() {
  redirect('/dashboard')
}
