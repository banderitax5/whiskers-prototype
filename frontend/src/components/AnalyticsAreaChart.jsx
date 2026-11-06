import React, { useEffect, useId, useRef, useState } from 'react'

// A dependency-free area chart in the shadcn chart style: horizontal grid,
// no y-axis chrome, sparse x labels and a hover tooltip. The palette is driven
// by CSS variables so the light theme uses the shop navy and dark mode uses the
// yellow accent without duplicating the SVG.
//
// Single-series usage keeps the original `points={[{ label, value }]}` API.
// Pass `series={[{ key, label }]}` to draw multiple overlapping lines, where
// each point carries one numeric field per key.
const SERIES_STYLES = [
  '[--chart-series-0:#0b2e59] dark:[--chart-series-0:#facc15]',
  '[--chart-series-1:#10b981] dark:[--chart-series-1:#34d399]',
  '[--chart-series-2:#6366f1] dark:[--chart-series-2:#818cf8]',
]

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
  series = null,
  height = 240,
  formatValue = (value) => String(value),
  ariaLabel = 'Trend chart',
}) {
  const [containerRef, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const gradientId = `analytics-area-${useId().replace(/:/g, '')}`

  const multi = Array.isArray(series) && series.length > 0
  const seriesDefs = (multi ? series : [{ key: 'value', label: 'Value' }]).map((item, index) => ({
    key: item.key,
    label: item.label ?? item.key,
    color: multi ? `var(--chart-series-${index})` : 'var(--chart-primary)',
    gradientId: multi ? `${gradientId}-${index}` : gradientId,
    className: multi ? SERIES_STYLES[index % SERIES_STYLES.length] : '',
  }))

  const rows = (Array.isArray(points) ? points : []).map((point) => {
    const row = { label: String(point.label ?? '') }
    for (const item of seriesDefs) {
      row[item.key] = Math.max(0, Number(point[item.key] || 0))
    }
    return row
  })

  const max = niceMax(Math.max(...rows.flatMap((row) => seriesDefs.map((item) => row[item.key])), 1) * 1.15)
  const pad = { top: 14, right: 10, bottom: 26, left: 10 }
  const chartWidth = Math.max(260, width)
  const innerWidth = Math.max(1, chartWidth - pad.left - pad.right)
  const innerHeight = Math.max(1, height - pad.top - pad.bottom)
  const baseline = pad.top + innerHeight

  const xAt = (index) => pad.left + (rows.length > 1 ? (index / (rows.length - 1)) * innerWidth : innerWidth / 2)
  const yAt = (value) => pad.top + innerHeight - (value / max) * innerHeight

  const seriesCoords = seriesDefs.map((item) =>
    rows.map((row, index) => ({ x: xAt(index), y: yAt(row[item.key]), value: row[item.key] }))
  )
  const seriesPaths = seriesCoords.map((coords) => {
    const linePath = smoothPath(coords)
    const areaPath = coords.length
      ? `${linePath} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`
      : ''
    return { linePath, areaPath }
  })

  const tickCount = chartWidth < 480 ? 3 : 5
  const tickIndexes = rows.length <= tickCount
    ? rows.map((_, index) => index)
    : Array.from({ length: tickCount }, (_, index) => Math.round((index / (tickCount - 1)) * (rows.length - 1)))
  const activeIndex = active == null ? null : active
  const activeX = activeIndex == null ? null : seriesCoords[0]?.[activeIndex]?.x
  const activeTop = activeIndex == null
    ? 0
    : Math.min(...seriesCoords.map((coords) => coords[activeIndex]?.y ?? 0))

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
      className={`relative w-full [--chart-primary:#0b2e59] dark:[--chart-primary:#facc15] [--chart-grid:#e5e7eb] dark:[--chart-grid:#1e3a5f] [--chart-axis:#9ca3af] dark:[--chart-axis:#64748b] ${seriesDefs.map((item) => item.className).join(' ')}`}
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
          if (!rows.length) return
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            setActive((current) => {
              const base = current == null ? rows.length - 1 : current
              const next = event.key === 'ArrowRight' ? base + 1 : base - 1
              return Math.min(rows.length - 1, Math.max(0, next))
            })
          } else if (event.key === 'Home') {
            event.preventDefault()
            setActive(0)
          } else if (event.key === 'End') {
            event.preventDefault()
            setActive(rows.length - 1)
          }
        }}
      >
        <title>{ariaLabel}</title>
        <defs>
          {seriesDefs.map((item) => (
            <linearGradient key={item.key} id={item.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={item.color} stopOpacity="0.28" />
              <stop offset="95%" stopColor={item.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
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

        {seriesDefs.map((item, index) => (
          <React.Fragment key={item.key}>
            <path d={seriesPaths[index].areaPath} fill={`url(#${item.gradientId})`} />
            <path
              d={seriesPaths[index].linePath}
              fill="none"
              stroke={item.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </React.Fragment>
        ))}

        {activeX != null && (
          <line
            x1={activeX}
            x2={activeX}
            y1={pad.top}
            y2={baseline}
            stroke="var(--chart-axis)"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {activeIndex != null && seriesCoords.map((coords, index) => {
          const coord = coords[activeIndex]
          if (!coord) return null
          return (
            <circle
              key={seriesDefs[index].key}
              cx={coord.x}
              cy={coord.y}
              r="4"
              fill={seriesDefs[index].color}
              stroke="white"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

        {seriesCoords[0].map((row, index) => (
          <g key={`${rows[index].label}-${index}`}>
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
          const row = seriesCoords[0][index]
          if (!row) return null
          const anchor = index === 0 ? 'start' : index === seriesCoords[0].length - 1 ? 'end' : 'middle'
          return (
            <text
              key={`tick-${index}`}
              x={row.x}
              y={height - 6}
              textAnchor={anchor}
              fill="var(--chart-axis)"
              fontSize="10"
            >
              {rows[index].label}
            </text>
          )
        })}
      </svg>

      {activeIndex != null && activeX != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg dark:border-[#1e3a5f] dark:bg-[#162d4a]"
          style={{
            left: `${(activeX / chartWidth) * 100}%`,
            top: `${(activeTop / height) * 100}%`,
          }}
        >
          <span className="block text-gray-500 dark:text-slate-400">{rows[activeIndex].label}</span>
          <span className={multi ? 'mt-1 block space-y-0.5' : 'block'}>
            {seriesDefs.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5">
                {multi ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                ) : null}
                {multi ? <span className="text-gray-500 dark:text-slate-400">{item.label}</span> : null}
                <span className="font-bold text-[#0b2e59] dark:text-yellow-200">
                  {formatValue(rows[activeIndex][item.key])}
                </span>
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}
