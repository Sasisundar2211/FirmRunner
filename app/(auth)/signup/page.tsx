import { Metadata } from 'next'
import SignupForm from './SignupForm'

export const metadata: Metadata = { title: 'Create Account — FirmRunner' }

export default function SignupPage() {
  return (
    <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
      <SignupForm />
    </div>
  )
}
