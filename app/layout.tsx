import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import HashErrorHandler from '@/components/auth/HashErrorHandler'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FirmRunner — AI Operations for Accounting Firms',
  description: 'Automate client intake, deadlines, documents, and billing for your CPA firm.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <HashErrorHandler />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
