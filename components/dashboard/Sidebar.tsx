'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '◻' },
  { href: '/dashboard/clients', label: 'Clients', icon: '👥' },
  { href: '/dashboard/deadlines', label: 'Deadlines', icon: '📅' },
  { href: '/dashboard/documents', label: 'Documents', icon: '📄' },
  { href: '/dashboard/billing', label: 'Billing', icon: '💳' },
  { href: '/dashboard/agents', label: 'AI Agents', icon: '🤖' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
]

interface SidebarProps {
  firmName: string
  userEmail: string
  userRole: string
  pendingCount: number
}

export default function Sidebar({ firmName, userEmail, userRole, pendingCount }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-200">
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">FirmRunner</p>
        <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{firmName}</p>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{icon}</span>
              <span className="flex-1">{label}</span>
              {href === '/dashboard/agents' && pendingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-semibold leading-none">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 truncate">{userEmail}</p>
        <p className="text-xs text-gray-400 capitalize">{userRole}</p>
        <button
          onClick={handleSignOut}
          className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
