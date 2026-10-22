// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } },
}))
vi.mock('../lib/api', () => ({
  apiGetAuth: vi.fn(),
}))

import ImagePicker from './ImagePicker.jsx'
import { apiGetAuth } from '../lib/api'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function render(props = {}) {
  apiGetAuth.mockResolvedValue({
    items: [
      { id: 'm1', url: '/media/a.png', alt_text: 'A' },
      { id: 'm2', url: '/media/b.png', alt_text: 'B' },
    ],
  })
  const onChange = props.onChange || vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<ImagePicker label="Banner image" value={props.value ?? ''} onChange={onChange} />)
  })
  cleanup = () => act(() => root.unmount())
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return { container, onChange }
}

function button(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

describe('ImagePicker remove option', () => {
  it('shows no Remove button when nothing is selected', async () => {
    const { container } = await render({ value: '' })
    expect(button(container, 'Remove')).toBeUndefined()
  })

  it('Remove clears the value via onChange("")', async () => {
    const { container, onChange } = await render({ value: '/media/a.png' })
    const remove = button(container, 'Remove')
    expect(remove).toBeTruthy()
    await act(async () => { remove.click() })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('clicking the selected library tile unselects it', async () => {
    const { container, onChange } = await render({ value: '/media/a.png' })
    const tiles = [...container.querySelectorAll('[role="option"]')]
    const selected = tiles.find((t) => t.getAttribute('aria-selected') === 'true')
    expect(selected).toBeTruthy()
    await act(async () => { selected.click() })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('clicking an unselected tile picks it', async () => {
    const { container, onChange } = await render({ value: '' })
    const tiles = [...container.querySelectorAll('[role="option"]')]
    expect(tiles.length).toBe(2)
    await act(async () => { tiles[1].click() })
    expect(onChange).toHaveBeenCalledWith('/media/b.png')
  })

  it('Remove stays visible in Paste link mode', async () => {
    const { container } = await render({ value: '/brands/x.webp' })
    await act(async () => { button(container, 'Paste link').click() })
    expect(button(container, 'Remove')).toBeTruthy()
  })
})
