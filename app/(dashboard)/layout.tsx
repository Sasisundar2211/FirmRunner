import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [firmUserRes, pendingRes] = await Promise.all([
    supabase
      .from('firm_users')
      .select('*, firms(name, subscription_plan)')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('queued_emails')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  const firmUser = firmUserRes.data
  const pendingCount = pendingRes.count ?? 0

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        firmName={(firmUser?.firms as { name: string } | null)?.name ?? 'My Firm'}
        userEmail={user.email ?? ''}
        userRole={firmUser?.role ?? 'staff'}
        pendingCount={pendingCount}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
