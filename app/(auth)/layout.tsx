export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-700">FirmRunner</h1>
          <p className="mt-1 text-sm text-gray-500">AI Operations for CPA Firms</p>
        </div>
        {children}
      </div>
    </div>
  )
}
