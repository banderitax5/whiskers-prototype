// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import ProductInfoAccordion from './ProductInfoAccordion.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SECTIONS = [
  { label: 'Product Info', content: 'Complete and balanced adult nutrition.' },
  { label: 'Ingredients', content: '- Wheat\n- Meat and bone meal' },
  { label: 'Feeding Guide', content: 'Body Weight | Amount\n2-5 | 50-95\n5-10 | 95-155' },
]

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  cleanup = () => act(() => root.unmount())
  return container
}

async function click(el) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

const buttons = (c) => [...c.querySelectorAll('button')]
const panels = (c) => [...c.querySelectorAll('[role="region"]')]

describe('ProductInfoAccordion', () => {
  it('renders nothing when there are no sections', async () => {
    expect((await render(<ProductInfoAccordion sections={[]} />)).innerHTML).toBe('')
    expect((await render(<ProductInfoAccordion sections={null} />)).innerHTML).toBe('')
  })

  it('renders one labelled header per section', async () => {
    const c = await render(<ProductInfoAccordion sections={SECTIONS} />)
    expect(buttons(c).map((b) => b.textContent.replace(/[+\u2212]/g, '').trim())).toEqual(
      SECTIONS.map((s) => s.label),
    )
  })

  it('opens the first section by default', async () => {
    const c = await render(<ProductInfoAccordion sections={SECTIONS} />)
    expect(buttons(c)[0].getAttribute('aria-expanded')).toBe('true')
    expect(buttons(c)[1].getAttribute('aria-expanded')).toBe('false')
    expect(panels(c)[0].hasAttribute('hidden')).toBe(false)
    expect(panels(c)[1].hasAttribute('hidden')).toBe(true)
  })

  it('keeps every aria-controls target present in the DOM', async () => {
    const c = await render(<ProductInfoAccordion sections={SECTIONS} />)
    const regions = panels(c)
    for (const btn of buttons(c)) {
      const target = btn.getAttribute('aria-controls')
      expect(target).toBeTruthy()
      // useId() output contains characters a raw CSS selector cannot take, so
      // match on the id value instead of building a selector
      expect(regions.some((region) => region.id === target)).toBe(true)
    }
  })

  it('labels each region with its header and toggles with the header button', async () => {
    const c = await render(<ProductInfoAccordion sections={SECTIONS} />)
    const [btn0, btn1] = buttons(c)
    const [panel0, panel1] = panels(c)

    expect(panel0.getAttribute('aria-labelledby')).toBe(btn0.id)
    expect(panel1.getAttribute('aria-labelledby')).toBe(btn1.id)

    // opening another section closes the first (one open at a time)
    await click(btn1)
    expect(btn0.getAttribute('aria-expanded')).toBe('false')
    expect(btn1.getAttribute('aria-expanded')).toBe('true')
    expect(panel0.hasAttribute('hidden')).toBe(true)
    expect(panel1.hasAttribute('hidden')).toBe(false)

    // clicking an open section closes it
    await click(btn1)
    expect(btn1.getAttribute('aria-expanded')).toBe('false')
    expect(panel1.hasAttribute('hidden')).toBe(true)
  })

  it('renders bullets and tables from section content', async () => {
    const c = await render(<ProductInfoAccordion sections={SECTIONS} />)
    expect(c.querySelectorAll('li').length).toBe(2)

    await click(buttons(c)[2])
    const table = panels(c)[2].querySelector('table')
    expect(table).not.toBeNull()
    expect([...table.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Body Weight', 'Amount'])
    expect(table.querySelectorAll('tbody tr').length).toBe(2)
  })
})
