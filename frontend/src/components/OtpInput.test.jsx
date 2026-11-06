// @vitest-environment jsdom
import { useState } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import OtpInput from './OtpInput.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

function Harness({ onChange, onComplete, ...props }) {
  const [value, setValue] = useState('')
  return (
    <OtpInput
      id="otp-code"
      value={value}
      onChange={(next) => { setValue(next); onChange?.(next) }}
      onComplete={onComplete}
      {...props}
    />
  )
}

async function render(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onChange = vi.fn()
  const onComplete = vi.fn()
  await act(async () => {
    root.render(<Harness onChange={onChange} onComplete={onComplete} {...props} />)
  })
  cleanup = () => act(() => root.unmount())
  return { c: container, onChange, onComplete }
}

async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('OtpInput', () => {
  it('renders six tiled boxes and fills them as digits are typed', async () => {
    const { c } = await render()
    const boxes = c.querySelectorAll('input')
    expect(boxes).toHaveLength(6)

    for (let index = 0; index < 6; index++) {
      await type(boxes[index], String(index + 1))
    }

    expect([...c.querySelectorAll('input')].map((box) => box.value)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('auto-submits once when the sixth digit lands', async () => {
    const { c, onChange, onComplete } = await render()
    await type(c.querySelector('#otp-code'), '123 456')

    expect(onChange).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('accepts a pasted code and ignores non-digits', async () => {
    const { c, onComplete } = await render()
    await type(c.querySelector('#otp-code'), 'ab 12-34 56')

    expect(onComplete).toHaveBeenCalledWith('123456')
  })
})
