interface StatsCardProps {
  label: string
  value: number
  alert?: boolean
}

export default function StatsCard({ label, value, alert = false }: StatsCardProps) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${alert && value > 0 ? 'border-orange-200' : 'border-gray-200'}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${alert && value > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}
