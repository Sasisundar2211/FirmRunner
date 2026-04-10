import { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Sign In — FirmRunner' }

export default function LoginPage() {
  return (
    <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
      <LoginForm />
    </div>
  )
}
