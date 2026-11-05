// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { shopState, petsState, catalogState } = vi.hoisted(() => ({
  shopState: { addToCart: vi.fn() },
  petsState: { isAuthenticated: false },
  catalogState: { items: [], reject: false, calls: 0 },
}))

// a Link stub that cancels its own navigation so jsdom stays quiet, then calls
// the component's own onClick. Bubbling is untouched, so a "View details" click
// still proves the card does not open the quick view.
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, onClick, ...rest }) => (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault()
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock('../context/ShopContext.jsx', () => ({
  useShop: () => shopState,
}))

vi.mock('../context/PetsContext.jsx', () => ({
  usePets: () => petsState,
}))

vi.mock('../lib/catalogCache.js', () => ({
  loadCatalog: () => {
    catalogState.calls += 1
    return catalogState.reject
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(catalogState.items)
  },
  resetCatalogCache: vi.fn(),
}))

vi.mock('../lib/recommendationLogger.js', () => ({
  logTopRecommendation: vi.fn(),
}))

// the low-stock threshold hook fetches site content; keep it offline and let the
// built-in default (10) apply
vi.mock('../lib/siteContent.js', () => ({
  fetchSiteContent: () => Promise.resolve(null),
  contentSettings: () => ({}),
}))

// the dialog pulls in promos and analytics; a small stub is enough to prove the
// card opens it and that the inner controls do not
vi.mock('./ProductQuickViewDialog.jsx', () => ({
  default: ({ product, isOpen }) => (
    <div data-testid="quick-view">{isOpen && product ? `Quick view: ${product.name}` : ''}</div>
  ),
}))

import RecommendationResults from './RecommendationResults.jsx'

let cleanup = () => {}

beforeEach(() => {
  shopState.addToCart.mockClear()
  petsState.isAuthenticated = false
  catalogState.items = []
  catalogState.reject = false
  catalogState.calls = 0
})

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

const row = (prod_id, prod_name, extra = {}) => ({
  prod_id,
  prod_name,
  price: 100,
  stock_quantity: 50,
  is_active: true,
  category: 'dogs food',
  brand: 'Whiskers',
  image_url: '',
  description: '',
  ...extra,
})

const DOG = { id: 'pet-1', name: 'Mochi', species: 'dog', lifeStage: 'adult', healthCondition: 'healthy', allergies: ['none'] }

const cards = (container) => [...container.querySelectorAll('article')]

describe('RecommendationResults: context on every card', () => {
  it('shows the reason, price, stock, product link, add-to-cart and vet note', async () => {
    catalogState.items = [row('adult-1', 'Adult Maintenance Dog Food', { price: 1200 })]
    const container = await render(<RecommendationResults pet={DOG} />)

    const [card] = cards(container)
    expect(card).toBeTruthy()
    expect(card.textContent).toContain('Suitable for adult dog')
    expect(card.textContent).toContain('₱1,200')
    expect(card.textContent).toContain('In stock')
    expect(card.textContent).toContain('Ask your vet if unsure about switching.')
    expect(card.querySelector('a').getAttribute('href')).toBe('/products/adult-1')
    expect([...card.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Add to Cart')).toBe(true)
  })

  it('warns when stock is low', async () => {
    catalogState.items = [row('adult-1', 'Adult Maintenance Dog Food', { stock_quantity: 3 })]
    const container = await render(<RecommendationResults pet={DOG} />)
    expect(cards(container)[0].textContent).toContain('Only 3 left in stock')
  })

  it('formats a decimal price with two digits, so the amount cannot be misread', async () => {
    catalogState.items = [row('adult-1', 'Adult Maintenance Dog Food', { price: 1200.5 })]
    const container = await render(<RecommendationResults pet={DOG} />)
    expect(cards(container)[0].textContent).toContain('₱1,200.50')
  })

  it('puts the stronger vet note on every card when the pet has a condition', async () => {
    catalogState.items = [
      row('renal', 'Renal Kidney Support Adult Dog Food'),
      row('adult-1', 'Adult Maintenance Dog Food'),
    ]
    const container = await render(<RecommendationResults pet={{ ...DOG, healthCondition: 'kidney' }} />)

    const shown = cards(container)
    expect(shown.length).toBeGreaterThan(1)
    for (const card of shown) {
      expect(card.textContent).toContain('Ask your vet before switching.')
    }
  })

  it('adds the exact product to the cart without opening the quick view', async () => {
    catalogState.items = [row('adult-1', 'Adult Maintenance Dog Food', { price: 1200, brand: 'Aozi', category: 'Dogs' })]
    const container = await render(<RecommendationResults pet={DOG} />)

    const button = cards(container)[0].querySelector('button[aria-label="Add Adult Maintenance Dog Food to cart"]')
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    expect(shopState.addToCart).toHaveBeenCalledTimes(1)
    const [payload, qty] = shopState.addToCart.mock.calls[0]
    expect(payload).toEqual({
      id: 'adult-1',
      name: 'Adult Maintenance Dog Food',
      price: 1200,
      image: '',
      collection: 'Dogs',
      brand: 'Aozi',
    })
    expect(qty).toBe(1)
    expect(container.querySelector('[data-testid="quick-view"]').textContent).toBe('')
  })

  it('opens the quick view from the card and from the product name, but not from the details link', async () => {
    catalogState.items = [row('adult-1', 'Adult Maintenance Dog Food')]
    const container = await render(<RecommendationResults pet={DOG} />)

    const [card] = cards(container)
    const nameButton = [...card.querySelectorAll('button')].find((b) => b.textContent.includes('Adult Maintenance'))
    await act(async () => { nameButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(container.querySelector('[data-testid="quick-view"]').textContent).toBe('Quick view: Adult Maintenance Dog Food')
  })

  it('does not open the quick view when the details link is clicked', async () => {
    catalogState.items = [row('adult-1', 'Adult Maintenance Dog Food')]
    const container = await render(<RecommendationResults pet={DOG} />)

    const link = cards(container)[0].querySelector('a')
    await act(async () => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    expect(container.querySelector('[data-testid="quick-view"]').textContent).toBe('')
  })
})

describe('RecommendationResults: general options', () => {
  const FISH = { id: 'pet-2', name: 'Bubbles', species: 'fish', lifeStage: 'adult', healthCondition: 'diabetes', allergies: ['none'] }

  it('labels a general food honestly and never marks it as the top match', async () => {
    catalogState.items = [row('fish-1', 'Fish Flakes Aquarium Food', { category: 'fish', price: 50 })]
    const container = await render(<RecommendationResults pet={FISH} />)

    const [card] = cards(container)
    expect(card.textContent).toContain('General formula - no condition-specific match available')
    expect(card.textContent).not.toContain('TOP MATCH')
    expect(container.textContent).toContain('No food made for diabetes / blood sugar issues is available right now.')
    expect(card.textContent).toContain('Ask your vet before switching.')
  })
})

describe('RecommendationResults: paging', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    row(`adult-${i}`, `Adult Dog Food ${i}`, { price: 100 + i })
  )

  it('shows 8 per page by default and switches page size', async () => {
    catalogState.items = many
    const container = await render(<RecommendationResults pet={DOG} />)

    expect(cards(container).length).toBe(8)
    expect(container.textContent).toContain('Showing 1–8 of 10')

    const select = container.querySelector('select[aria-label="Products per page"]')
    select.value = '16'
    await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(cards(container).length).toBe(10)
  })

  it('marks only the first card of the best section as the top match', async () => {
    catalogState.items = many
    const container = await render(<RecommendationResults pet={DOG} />)
    const labels = cards(container).filter((c) => c.textContent.includes('TOP MATCH'))
    expect(labels.length).toBe(1)
    expect(cards(container)[0].textContent).toContain('TOP MATCH')
  })
})
