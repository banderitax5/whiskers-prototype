import { useEffect, useMemo, useState } from 'react'
import supabase from '../lib/supabase'
import { isUuid, availabilityOf } from '../lib/cartLogic.js'

// columns needed for the live price/stock check; read-only, explicit
const LIVE_COLUMNS = 'prod_id, price, stock_quantity, is_active'

// fetches the current product rows for a list of cart items and derives an
// availability map ({ [id]: { status, price } }). Used by Cart and Checkout
// so the "is this still orderable?" rule lives in exactly one place (B6/U6).
// The check is best-effort: if the lookup fails, items fall back to the
// snapshot stored in the cart row so the UI never blocks on the network.
export default function useLiveProductRows(items) {
  const [liveById, setLiveById] = useState({})
  const [checkedIds, setCheckedIds] = useState(() => new Set())

  const idListKey = useMemo(() => (items || []).map((i) => i.id).join(','), [items])

  useEffect(() => {
    const ids = idListKey ? idListKey.split(',').filter(isUuid) : []
    if (ids.length === 0) {
      setLiveById({})
      setCheckedIds(new Set())
      return undefined
    }
    let cancelled = false
    supabase
      .from('product')
      .select(LIVE_COLUMNS)
      .in('prod_id', ids)
      .then(({ data }) => {
        if (cancelled) return
        const map = {}
        for (const row of data || []) map[row.prod_id] = row
        setLiveById(map)
        setCheckedIds(new Set(ids))
      })
      .catch(() => { /* snapshot keeps the cart usable */ })
    return () => { cancelled = true }
  }, [idListKey])

  const availability = useMemo(() => {
    const map = {}
    for (const item of items || []) {
      map[item.id] = availabilityOf(item, liveById[item.id] || null, checkedIds.has(item.id))
    }
    return map
  }, [items, liveById, checkedIds])

  return { liveById, checkedIds, availability }
}
