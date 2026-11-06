import { useEffect, useRef } from 'react'
import { OTP_LENGTH, normalizeOtp } from '../lib/mfa.js'

// Six tiled digit boxes for a TOTP code. Typing or pasting the sixth digit
// calls onComplete so the parent can submit immediately; the parent still owns
// the value and the busy/error state.
function OtpInput({
  id,
  value = '',
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  ariaInvalid = false,
  ariaDescribedby,
}) {
  const digits = normalizeOtp(value)
  const boxes = useRef([])
  const completed = useRef('')

  useEffect(() => {
    if (!autoFocus) return undefined
    const timer = setTimeout(() => boxes.current[0]?.focus(), 50)
    return () => clearTimeout(timer)
  }, [autoFocus])

  // A new incomplete code is a fresh attempt, so the same six digits may be
  // submitted again after a failed verification.
  useEffect(() => {
    if (digits.length < OTP_LENGTH) completed.current = ''
  }, [digits.length])

  function focusBox(index) {
    const next = Math.max(0, Math.min(OTP_LENGTH - 1, index))
    boxes.current[next]?.focus()
  }

  function commit(raw) {
    const next = normalizeOtp(raw)
    onChange?.(next)
    if (next.length === OTP_LENGTH && completed.current !== next) {
      completed.current = next
      onComplete?.(next)
    }
    return next
  }

  function fillFrom(index, raw) {
    const incoming = normalizeOtp(raw)
    if (!incoming) return

    const isBulk = incoming.length > 1
    const next = (isBulk
      ? incoming.length >= OTP_LENGTH
        ? incoming
        : digits.slice(0, index) + incoming + digits.slice(index + incoming.length)
      : digits.slice(0, index) + incoming + digits.slice(index + 1)
    ).slice(0, OTP_LENGTH)

    const clean = commit(next)
    focusBox(isBulk ? Math.min(index + incoming.length, clean.length) : index + 1)
  }

  function handleChange(index, event) {
    const raw = event.target.value
    if (!raw) {
      // Deletion already happened in the box (mobile keyboards often send this
      // instead of a Backspace keydown).
      commit(digits.slice(0, index) + digits.slice(index + 1))
      focusBox(index)
      return
    }
    fillFrom(index, raw)
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (digits[index]) {
        commit(digits.slice(0, index) + digits.slice(index + 1))
        focusBox(index)
      } else {
        const previous = Math.max(0, index - 1)
        commit(digits.slice(0, previous) + digits.slice(previous + 1))
        focusBox(previous)
      }
    } else if (event.key === 'Delete') {
      event.preventDefault()
      commit(digits.slice(0, index) + digits.slice(index + 1))
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusBox(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusBox(OTP_LENGTH - 1)
    }
  }

  function handlePaste(index, event) {
    event.preventDefault()
    fillFrom(index, event.clipboardData.getData('text'))
  }

  return (
    <div
      role="group"
      aria-label={`${OTP_LENGTH}-digit verification code`}
      className="flex items-center justify-between gap-1.5 sm:gap-2"
    >
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(el) => { boxes.current[index] = el }}
          id={index === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digits[index] || ''}
          placeholder="0"
          disabled={disabled}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedby}
          className="h-12 w-full min-w-0 rounded-lg border border-gray-300 bg-white text-center text-lg font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-300 transition-colors focus:border-transparent focus:ring-2 focus:ring-[#0b2e59] disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-yellow-400 sm:h-14"
        />
      ))}
    </div>
  )
}

export default OtpInput
