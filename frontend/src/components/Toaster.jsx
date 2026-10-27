import { useSyncExternalStore } from 'react'
import { BsCheckCircleFill, BsExclamationCircleFill, BsInfoCircleFill, BsX } from 'react-icons/bs'
import { dismiss, getToasts, subscribe } from '../lib/toast.js'

const ICONS = {
  success: <BsCheckCircleFill className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />,
  error: <BsExclamationCircleFill className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />,
  info: <BsInfoCircleFill className="mt-0.5 h-4 w-4 shrink-0 text-[#0b2e59] dark:text-blue-400" aria-hidden="true" />,
}

const CARD =
  'pointer-events-auto flex w-full items-start gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

function ToastCard({ item }) {
  if (item.kind === 'custom') {
    return (
      <div role="status" className="toast-enter pointer-events-auto">
        {item.content({ id: item.id })}
      </div>
    )
  }

  return (
    <div
      role="status"
      className={`${CARD} toast-enter cursor-pointer`}
      onClick={() => dismiss(item.id)}
    >
      {ICONS[item.kind]}
      <span className="min-w-0 flex-1 break-words">{item.content}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          dismiss(item.id)
        }}
        aria-label="Dismiss notification"
        className="-mr-1 shrink-0 rounded p-0.5 text-gray-400 transition hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2e59] dark:hover:text-gray-200"
      >
        <BsX className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

// Bottom-right toast stack. Kept in a component (not a portal) because the app
// mounts it once inside the root, above every route.
export default function FloatingNotification() {
  const items = useSyncExternalStore(subscribe, getToasts, getToasts)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[99999] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-96"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  )
}
