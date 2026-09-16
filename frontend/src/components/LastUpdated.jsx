export default function LastUpdated({ date, className = '' }) {
  if (!date) return null

  const formatted = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <span className={`text-xs text-gray-400 dark:text-gray-500 ${className}`}>
      Last updated: {formatted}
    </span>
  )
}
