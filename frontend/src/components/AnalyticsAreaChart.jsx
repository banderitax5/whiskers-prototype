import React, { useEffect, useId, useRef, useState } from 'react'

// A dependency-free area chart in the shadcn chart style: horizontal grid,
// no y-axis chrome, sparse x labels and a hover tooltip. The palette is driven
// by CSS variables so the light theme uses the shop navy and dark mode uses the
// yellow accent without duplicating the SVG.
function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(720)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width
      if (next) setWidth(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

function niceMax(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(n))
  const scaled = n / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}

function smoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const midX = (prev.x + cur.x) / 2
    path += ` C ${midX} ${prev.y}, ${midX} ${cur.y}, ${cur.x} ${cur.y}`
  }
  return path
}

export default function AnalyticsAreaChart({
  points = [],
  height = 240,
  formatValue = (value) => String(value),
  ariaLabel = 'Trend chart',
}) {
  const [containerRef, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const gradientId = `analytics-area-${useId().replace(/:/g, '')}`

  const rows = (Array.isArray(points) ? points : []).map((point) => ({
    label: String(point.label ?? ''),
    value: Math.max(0, Number(point.value || 0)),
  }))
  const max = niceMax(Math.max(...rows.map((row) => row.value), 1) * 1.15)
  const pad = { top: 14, right: 10, bottom: 26, left: 10 }
  const chartWidth = Math.max(260, width)
  const innerWidth = Math.max(1, chartWidth - pad.left - pad.right)
  const innerHeight = Math.max(1, height - pad.top - pad.bottom)
  const baseline = pad.top + innerHeight

  const coords = rows.map((row, index) => {
    const x = pad.left + (rows.length > 1 ? (index / (rows.length - 1)) * innerWidth : innerWidth / 2)
    const y = pad.top + innerHeight - (row.value / max) * innerHeight
    return { ...row, x, y }
  })

  const linePath = smoothPath(coords)
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`
    : ''

  const tickCount = chartWidth < 480 ? 3 : 5
  const tickIndexes = rows.length <= tickCount
    ? rows.map((_, index) => index)
    : Array.from({ length: tickCount }, (_, index) => Math.round((index / (tickCount - 1)) * (rows.length - 1)))
  const activeRow = active == null ? null : coords[active]

  if (!rows.length) {
    return (
      <div className="flex h-[200px] items-center justify-center text-xs text-gray-400 dark:text-slate-500">
        No data yet.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full [--chart-primary:#0b2e59] dark:[--chart-primary:#facc15] [--chart-grid:#e5e7eb] dark:[--chart-grid:#1e3a5f] [--chart-axis:#9ca3af] dark:[--chart-axis:#64748b]"
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${chartWidth} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-[#0b2e59]/40 dark:focus-visible:ring-yellow-400/40"
        onMouseLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (!coords.length) return
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            setActive((current) => {
              const base = current == null ? coords.length - 1 : current
              const next = event.key === 'ArrowRight' ? base + 1 : base - 1
              return Math.min(coords.length - 1, Math.max(0, next))
            })
          } else if (event.key === 'Home') {
            event.preventDefault()
            setActive(0)
          } else if (event.key === 'End') {
            event.preventDefault()
            setActive(coords.length - 1)
          }
        }}
      >
        <title>{ariaLabel}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-primary)" stopOpacity="0.28" />
            <stop offset="95%" stopColor="var(--chart-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.33, 0.66, 1].map((ratio) => (
          <line
            key={ratio}
            x1={pad.left}
            x2={chartWidth - pad.right}
            y1={pad.top + innerHeight * ratio}
            y2={pad.top + innerHeight * ratio}
            stroke="var(--chart-grid)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--chart-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {activeRow && (
          <line
            x1={activeRow.x}
            x2={activeRow.x}
            y1={pad.top}
            y2={baseline}
            stroke="var(--chart-axis)"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {coords.map((row, index) => (
          <g key={`${row.label}-${index}`}>
            {active === index && (
              <circle
                cx={row.x}
                cy={row.y}
                r="4"
                fill="var(--chart-primary)"
                stroke="white"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <rect
              x={row.x - Math.max(6, innerWidth / Math.max(rows.length, 1) / 2)}
              y={pad.top}
              width={Math.max(12, innerWidth / Math.max(rows.length, 1))}
              height={innerHeight}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
            />
          </g>
        ))}

        {tickIndexes.map((index) => {
          const row = coords[index]
          if (!row) return null
          const anchor = index === 0 ? 'start' : index === coords.length - 1 ? 'end' : 'middle'
          return (
            <text
              key={`tick-${index}`}
              x={row.x}
              y={height - 6}
              textAnchor={anchor}
              fill="var(--chart-axis)"
              fontSize="10"
            >
              {row.label}
            </text>
          )
        })}
      </svg>

      {activeRow && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg dark:border-[#1e3a5f] dark:bg-[#162d4a]"
          style={{
            left: `${(activeRow.x / chartWidth) * 100}%`,
            top: `${(activeRow.y / height) * 100}%`,
          }}
        >
          <span className="block text-gray-500 dark:text-slate-400">{activeRow.label}</span>
          <span className="block font-bold text-[#0b2e59] dark:text-yellow-200">{formatValue(activeRow.value)}</span>
        </div>
      )}
    </div>
  )
}
