import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import useLiveProductRows from '../hooks/useLiveProductRows.js'
import ProductThumb from '../components/ProductThumb.jsx'
import CartRecommendations from '../components/CartRecommendations.jsx'
import {
  isUuid,
  clampQuantity,
  unavailableReason,
  isPurchasableStatus,
  effectiveSelection,
  effectiveItems,
  cartTotals,
  formatPesos,
  toCentavos,
  lineTotalCents,
} from '../lib/cartLogic.js'
import { fetchSiteContent } from '../lib/siteContent.js'
import { LOW_STOCK_THRESHOLD } from '../lib/productDisplay.js'

// selection survives a trip to /checkout and back
const SELECTION_KEY = 'whiskers.cart.selectedIds'

function readStoredSelection() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function CartSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-12 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
      {[0, 1].map((i) => (
        <div key={i} className="h-28 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
      ))}
      <span role="status" className="sr-only">Loading your cart...</span>
    </div>
  )
}

function CartError({ onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:bg-red-900/30 dark:border-red-800">
      <h2 className="font-semibold text-red-900 dark:text-red-200 mb-1">Could not load your cart</h2>
      <p className="text-sm text-red-700 dark:text-red-300 mb-4">Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold transition-colors"
      >
        Retry
      </button>
    </div>
  )
}

function Cart() {
  const navigate = useNavigate()
  const { cartItems, cartStatus, reloadCart, updateQuantity, removeFromCart, clearCart, lastAddedAt } = useShop()

  // ids the user has explicitly deselected; everything else that is
  // available stays selected (U1). This is what makes stale ids a non-issue:
  // selection is always derived, never a frozen copy of past ids (B1).
  const [excludedIds, setExcludedIds] = useState([])
  const [drafts, setDrafts] = useState({})
  const [qtyErrors, setQtyErrors] = useState({})
  const [announce, setAnnounce] = useState('')
  // shipping rules from site settings (Phase 6); null until loaded, in which
  // case cartTotals falls back to the built-in flat fee
  const [shippingOpts, setShippingOpts] = useState(null)
  // owner-editable low-stock threshold; built-in default until settings load
  const [lowStockThreshold, setLowStockThreshold] = useState(LOW_STOCK_THRESHOLD)
  const initializedRef = useRef(false)
  const storedSelection = useMemo(readStoredSelection, [])

  useEffect(() => {
    let cancelled = false
    fetchSiteContent().then((content) => {
      if (cancelled || !content?.settings) return
      setShippingOpts({
        fee: content.settings.shipping_fee,
        freeThreshold: content.settings.free_shipping_threshold,
      })
      const t = Number(content.settings.low_stock_threshold)
      if (Number.isFinite(t) && t >= 0) setLowStockThreshold(t)
    })
    return () => { cancelled = true }
  }, [])

  // live product rows for the price/stock check (U6) — read-only
  const { liveById, checkedIds, availability } = useLiveProductRows(cartItems)

  // cart rows with the live price applied so totals always use current prices
  const displayItems = useMemo(
    () => cartItems.map((item) => ({ ...item, price: availability[item.id]?.price ?? item.price })),
    [cartItems, availability]
  )

  const availableIds = useMemo(
    () => displayItems.filter((item) => isPurchasableStatus(availability[item.id]?.status)).map((item) => item.id),
    [displayItems, availability]
  )

  // restore the previous selection once per visit (U9), then auto-select
  // everything available (U1)
  useEffect(() => {
    if (initializedRef.current || cartItems.length === 0) return
    initializedRef.current = true
    if (storedSelection.length === 0) return
    const keep = new Set(storedSelection)
    setExcludedIds(cartItems.filter((item) => !keep.has(item.id)).map((item) => item.id))
  }, [cartItems, storedSelection])

  // a newly added item should join the selection (U1) without resurrecting
  // anything the user deselected earlier
  const prevIdsRef = useRef(new Set())
  useEffect(() => {
    const current = new Set(displayItems.map((item) => item.id))
    const added = lastAddedAt > 0 ? [...current].filter((id) => !prevIdsRef.current.has(id)) : []
    prevIdsRef.current = current
    if (added.length === 0) return
    const addedSet = new Set(added)
    setExcludedIds((prev) => prev.filter((id) => !addedSet.has(id)))
  }, [displayItems, lastAddedAt])

  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds])
  const selectedIds = useMemo(
    () => availableIds.filter((id) => !excludedSet.has(id)),
    [availableIds, excludedSet]
  )
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedItems = useMemo(
    () => effectiveItems(selectedIds, displayItems, availability),
    [selectedIds, displayItems, availability]
  )
  // guard used by goCheckout so a stale id can never navigate (B1)
  const validSelectedIds = useMemo(
    () => effectiveSelection(selectedIds, displayItems, availability),
    [selectedIds, displayItems, availability]
  )

  const totals = useMemo(() => cartTotals(selectedItems, availability, shippingOpts), [selectedItems, availability, shippingOpts])
  const cartUnitCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + (Math.floor(Number(item.quantity) || 0)), 0),
    [cartItems]
  )

  const allAvailableSelected = availableIds.length > 0 && selectedIds.length === availableIds.length
  const someAvailableSelected = selectedIds.length > 0 && !allAvailableSelected

  // announce totals after selection changes (B9)
  useEffect(() => {
    if (cartStatus !== 'ready' || cartItems.length === 0) return
    const message = selectedIds.length === 0
      ? 'No items selected'
      : `${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'} selected, total ${formatPesos(totals.totalCents / 100)} pesos`
    setAnnounce(message)
  }, [selectedIds.length, totals.totalCents, cartItems.length, cartStatus])

  function toggleSelect(id) {
    if (!isPurchasableStatus(availability[id]?.status)) return
    setExcludedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function onSelectAllChange(checked) {
    setExcludedIds(checked ? [] : [...availableIds])
  }

  function clearSelection() {
    setExcludedIds([...availableIds])
  }

  function maxQtyFor(item) {
    const live = liveById[item.id]
    if (checkedIds.has(item.id) && live) {
      const stock = Number(live.stock_quantity)
      return Number.isFinite(stock) && stock > 0 ? stock : 1
    }
    return Infinity
  }

  function onDraftChange(item, value) {
    setDrafts((prev) => ({ ...prev, [item.id]: value }))
    setQtyErrors((prev) => (prev[item.id] ? { ...prev, [item.id]: '' } : prev))
  }

  // commit on blur or Enter only — never one PUT per keystroke (B3)
  function commitQty(item) {
    const raw = drafts[item.id]
    if (raw === undefined) return
    const next = clampQuantity(raw, maxQtyFor(item))
    setDrafts((prev) => {
      const copy = { ...prev }
      delete copy[item.id]
      return copy
    })
    if (next === null) {
      setQtyErrors((prev) => ({ ...prev, [item.id]: 'Enter a whole number of 1 or more.' }))
      return
    }
    setQtyErrors((prev) => ({ ...prev, [item.id]: '' }))
    if (next === item.quantity) return
    updateQuantity(item.id, next)
    setAnnounce(`${item.name} quantity ${next}`)
  }

  function stepQty(item, delta) {
    const max = maxQtyFor(item)
    const next = clampQuantity((item.quantity || 1) + delta, max)
    if (next === null || next === item.quantity) return
    setDrafts((prev) => {
      const copy = { ...prev }
      delete copy[item.id]
      return copy
    })
    updateQuantity(item.id, next)
    setAnnounce(`${item.name} quantity ${next}`)
  }

  function onRemoveSelected() {
    if (selectedIds.length === 0) return
    clearCart(selectedIds)
    setExcludedIds((prev) => prev.filter((id) => !selectedSet.has(id)))
  }

  function goCheckout() {
    if (validSelectedIds.length === 0) return
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify(validSelectedIds))
    } catch { /* storage may be unavailable; router state still carries it */ }
    navigate('/checkout', { state: { selectedIds: validSelectedIds } })
  }

  const btnBase = 'min-h-[44px] rounded-lg px-3 text-xs font-semibold transition-colors'
  const checkoutDisabled = validSelectedIds.length === 0

  const headerLine = cartItems.length > 0
    ? `${cartItems.length} product${cartItems.length === 1 ? '' : 's'} (${cartUnitCount} item${cartUnitCount === 1 ? '' : 's'}) in cart`
    : 'Your shopping cart'

  return (
    <div className="w-full lg:mx-auto lg:max-w-7xl py-5 sm:py-8 pb-28 lg:pb-8">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#0b2e59] dark:text-white">Your Cart</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{headerLine}</p>
      </div>

      {cartStatus === 'loading' && cartItems.length === 0 ? (
        <CartSkeleton />
      ) : cartStatus === 'error' && cartItems.length === 0 ? (
        <CartError onRetry={reloadCart} />
      ) : cartItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-20 px-6 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <svg className="h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121 0 2.09-.773 2.34-1.872l1.836-7.89a1.125 1.125 0 00-1.098-1.368H5.173M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Your cart is empty</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm">Browse our products and add items you love to get started.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/menu')}
              className="min-h-[44px] rounded-lg bg-[#0b2e59] px-8 text-sm font-semibold text-white hover:bg-[#15407a] transition-colors"
            >
              Browse Products
            </button>
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-200 px-6 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 lg:gap-6">
          {/* left column — cart items */}
          <div className="space-y-3">
            {/* bulk actions */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-semibold dark:border-gray-600 dark:text-gray-200 ${allAvailableSelected ? 'bg-[#0b2e59]/5 dark:bg-[#0b2e59]/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <input
                    type="checkbox"
                    id="cart-select-all"
                    checked={allAvailableSelected}
                    ref={(el) => { if (el) el.indeterminate = someAvailableSelected }}
                    onChange={(e) => onSelectAllChange(e.target.checked)}
                    disabled={availableIds.length === 0}
                    className="h-5 w-5 rounded border-gray-300 text-[#0b2e59] focus:ring-[#0b2e59]"
                  />
                  Select all
                </label>
                <button type="button" onClick={clearSelection} disabled={selectedIds.length === 0} className={`${btnBase} border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed`}>
                  Clear selection
                </button>
                <button
                  type="button"
                  disabled={selectedIds.length === 0}
                  onClick={onRemoveSelected}
                  className={`${btnBase} border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Remove Selected
                </button>
              </div>
            </div>

            {/* cart items */}
            {displayItems.map((item, idx) => {
              const snapshot = cartItems[idx] || item
              const info = availability[item.id] || { status: 'ok', price: item.price }
              const available = isPurchasableStatus(info.status)
              const live = liveById[item.id]
              const stockKnown = checkedIds.has(item.id) && live && Number.isFinite(Number(live.stock_quantity))
              const stock = stockKnown ? Number(live.stock_quantity) : null
              const lowStock = stock !== null && stock > 0 && stock <= lowStockThreshold
              const checked = selectedSet.has(item.id)
              const priceChanged = checkedIds.has(item.id) && live &&
                toCentavos(live.price) > 0 &&
                toCentavos(live.price) !== toCentavos(snapshot.price)
              const draft = drafts[item.id]
              const qtyError = qtyErrors[item.id]
              const productHref = isUuid(item.id) ? `/products/${item.id}` : null
              const lineCents = lineTotalCents(item.price, item.quantity)
              const errId = `qty-err-${item.id}`

              return (
                <article
                  key={item.id}
                  className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-800 ${available ? 'border-gray-200 dark:border-gray-700' : 'border-amber-200 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-900/10'}`}
                >
                  <div className="flex gap-4">
                    <label className="mt-1 inline-flex h-11 w-11 flex-shrink-0 items-start justify-center pt-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!available}
                        onChange={() => toggleSelect(item.id)}
                        aria-label={`Select ${item.name}`}
                        aria-describedby={!available ? errId : undefined}
                        className="h-5 w-5 rounded border-gray-300 text-[#0b2e59] focus:ring-[#0b2e59] disabled:opacity-40"
                      />
                    </label>

                    {productHref ? (
                      <Link to={productHref} className="flex-shrink-0" aria-label={`View ${item.name}`}>
                        <ProductThumb src={item.image} />
                      </Link>
                    ) : (
                      <ProductThumb src={item.image} />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {productHref ? (
                            <Link
                              to={productHref}
                              className="line-clamp-2 text-sm font-semibold text-gray-800 hover:text-[#0b2e59] dark:text-gray-100 dark:hover:text-blue-400"
                              title={item.name}
                            >
                              {item.name}
                            </Link>
                          ) : (
                            <h3 className="line-clamp-2 text-sm font-semibold text-gray-800 dark:text-gray-100" title={item.name}>{item.name}</h3>
                          )}
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {[item.collection, item.brand].filter(Boolean).join(' · ')}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            PHP {formatPesos(item.price)} <span className="text-gray-400 dark:text-gray-500">each</span>
                          </p>
                          {!available && (
                            <p id={errId} className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                              {unavailableReason(info.status)}
                            </p>
                          )}
                          {priceChanged && available && (
                            <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                              Price updated from PHP {formatPesos(snapshot.price)} to PHP {formatPesos(live.price)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* qty + line total + remove */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-700 sm:mt-2 sm:border-0 sm:pt-0">
                        <div className="flex items-center gap-1">
                          <span className="sr-only">Quantity for {item.name}</span>
                          <button
                            type="button"
                            onClick={() => stepQty(item, -1)}
                            disabled={!available || (item.quantity || 1) <= 1}
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-lg font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={draft ?? String(item.quantity)}
                            disabled={!available}
                            onChange={(e) => onDraftChange(item, e.target.value)}
                            onBlur={() => commitQty(item)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitQty(item) } }}
                            aria-label={`Quantity for ${item.name}`}
                            aria-invalid={qtyError ? 'true' : undefined}
                            aria-describedby={qtyError ? errId : undefined}
                            className={`h-11 w-14 rounded-lg border bg-white px-2 text-center text-sm text-gray-800 dark:bg-gray-700 dark:text-gray-100 ${qtyError ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'}`}
                          />
                          <button
                            type="button"
                            onClick={() => stepQty(item, 1)}
                            disabled={!available || (stock !== null && (item.quantity || 1) >= stock)}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-lg font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            +
                          </button>
                          {lowStock && (
                            <span className="ml-1 text-xs font-semibold text-amber-600 dark:text-amber-400">Only {stock} left</span>
                          )}
                          {qtyError && <p id={errId} className="ml-1 basis-full text-xs text-red-500">{qtyError}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-bold text-[#0b2e59] dark:text-yellow-300">
                            PHP {formatPesos(lineCents / 100)}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="inline-flex min-h-[44px] items-center px-1 text-xs font-semibold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}

            <CartRecommendations />
          </div>

          {/* right column — summary (sticky on desktop) */}
          <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Order Summary</h2>

              {selectedIds.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Select items to check out</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Selected items</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedIds.length}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">PHP {formatPesos(totals.subtotalCents / 100)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Shipping</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {totals.shippingCents === 0 ? 'Free' : `PHP ${formatPesos(totals.shippingCents / 100)}`}
                    </span>
                  </div>
                  {shippingOpts?.freeThreshold != null && totals.subtotalCents > 0 && totals.subtotalCents < toCentavos(shippingOpts.freeThreshold) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Add PHP {formatPesos(shippingOpts.freeThreshold - totals.subtotalCents / 100)} more for free shipping.
                    </p>
                  )}
                </div>
              )}

              <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
                <div className="flex justify-between text-base font-bold text-[#0b2e59] dark:text-yellow-300">
                  <span>Total</span>
                  <span>{selectedIds.length === 0 ? '—' : `PHP ${formatPesos(totals.totalCents / 100)}`}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={goCheckout}
                disabled={checkoutDisabled}
                aria-describedby={checkoutDisabled ? 'checkout-reason' : undefined}
                className="w-full min-h-[44px] rounded-lg bg-[#0b2e59] text-sm font-semibold text-white hover:bg-[#15407a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Checkout
              </button>
              {checkoutDisabled && (
                <p id="checkout-reason" className="text-xs text-gray-500 dark:text-gray-400">
                  Select at least one available item to check out.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* live region for selection and quantity changes (B9) */}
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      {/* mobile sticky bar (U8) */}
      {cartItems.length > 0 && cartStatus !== 'error' && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedIds.length === 0
                  ? 'Select items to check out'
                  : `${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'} · shipping ${totals.shippingCents === 0 ? 'free' : `PHP ${formatPesos(totals.shippingCents / 100)}`}`}
              </p>
              <p className="text-base font-bold text-[#0b2e59] dark:text-yellow-300">
                {selectedIds.length === 0 ? '—' : `PHP ${formatPesos(totals.totalCents / 100)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={goCheckout}
              disabled={checkoutDisabled}
              aria-describedby={checkoutDisabled ? 'checkout-reason-mobile' : undefined}
              className="min-h-[44px] shrink-0 rounded-lg bg-[#0b2e59] px-6 text-sm font-semibold text-white hover:bg-[#15407a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Checkout
            </button>
            {checkoutDisabled && <span id="checkout-reason-mobile" className="sr-only">Select at least one available item to check out.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export default Cart
