import { useState } from 'react'
import { BsClipboard, BsCheck } from 'react-icons/bs'

export default function CopyToClipboard({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition"
      title={copied ? 'Copied!' : label}
    >
      {copied ? <BsCheck className="h-3.5 w-3.5 text-green-500" /> : <BsClipboard className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  )
}
