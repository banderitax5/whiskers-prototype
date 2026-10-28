import React, { useEffect, useRef, useState } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth } from '../lib/api';
import { formatPesos } from '../lib/cartLogic';
import { AdminPage, StatCard, EmptyState, StatusPill } from './adminTheme';

const DASHBOARD_HELP = [
  { title: 'What this page shows', body: 'A live look at how the store is performing, with quick numbers at the top and charts below.' },
  { title: 'Revenue range', body: 'Use the buttons above the revenue chart: 30D (last 30 days), 12W (last 12 weeks), 12M (last 12 months) or 5Y (last 5 years).' },
  { title: 'Problems', body: 'If a box says the data is unavailable, press Retry.' },
]
import { BsExclamationTriangle, BsArrowClockwise } from 'react-icons/bs';
import AnalyticsAreaChart from './AnalyticsAreaChart';
import {
  bucketLabel,
  compactPesos,
  deltaPct,
  formatPct,
  funnelSteps,
  orderStatusRows,
} from '../lib/analyticsDisplay';

const CARD = 'rounded-xl border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0f2137] shadow-sm';
const CARD_HEADER = 'flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5 pb-2';
const CARD_TITLE = 'text-sm font-semibold text-[#0b2e59] dark:text-yellow-200';
const CARD_DESC = 'mt-0.5 text-xs text-gray-500 dark:text-slate-400';
const CARD_BODY = 'px-4 pb-4 sm:px-5 sm:pb-5';
const PULSE = 'bg-gray-200 dark:bg-[#162d4a] rounded animate-pulse';
const GRID = 'grid grid-cols-1 lg:grid-cols-2 gap-4';

const PERIOD_OPTIONS = [
  { key: 'daily', short: '30D', range: 'Last 30 days', compare: 'vs previous 30 days' },
  { key: 'weekly', short: '12W', range: 'Last 12 weeks', compare: 'vs previous 12 weeks' },
  { key: 'monthly', short: '12M', range: 'Last 12 months', compare: 'vs previous 12 months' },
  { key: 'yearly', short: '5Y', range: 'Last 5 years', compare: 'vs previous 5 years' },
];

function PanelSkeleton({ rows = 4 }) {
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <div className={`${PULSE} h-4 w-44 mb-3`} />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i}>
            <div className="flex items-center justify-between gap-3">
              <div className={`${PULSE} h-3 w-28`} />
              <div className={`${PULSE} h-3 w-10`} />
            </div>
            <div className={`${PULSE} mt-1 h-1.5 w-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <div className={`${PULSE} h-4 w-40`} />
      <div className={`${PULSE} mt-2 h-3 w-56`} />
      <div className={`${PULSE} mt-5 h-[220px] w-full`} />
    </div>
  );
}

function PanelEmpty({ message }) {
  return <p className="py-6 text-center text-xs text-gray-400 dark:text-slate-500">{message}</p>;
}

function SectionCard({ title, description, action, children, className = '' }) {
  return (
    <section className={`${CARD} ${className}`}>
      <div className={CARD_HEADER}>
        <div>
          <h2 className={CARD_TITLE}>{title}</h2>
          {description ? <p className={CARD_DESC}>{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={CARD_BODY}>{children}</div>
    </section>
  );
}

function PeriodToggle({ period, onChange }) {
  return (
    <div
      role="group"
      aria-label="Revenue range"
      className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-[#1e3a5f] dark:bg-[#162d4a]"
    >
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={period === option.key}
          aria-label={option.range}
          title={option.range}
          className={`rounded-md px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition sm:px-3 ${
            period === option.key
              ? 'bg-[#0b2e59] text-white shadow-sm dark:bg-yellow-400 dark:text-gray-900'
              : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}

function DeltaBadge({ value, invert = false, point = false }) {
  const hasValue = value != null && Number.isFinite(Number(value));
  if (!hasValue) {
    return <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500">no prior data</span>;
  }
  const number = Number(value);
  const good = invert ? number <= 0 : number >= 0;
  const arrow = number > 0 ? '↑' : number < 0 ? '↓' : '→';
  return (
    <span className={`text-[10px] font-semibold ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {arrow} {Math.abs(number).toFixed(1)}{point ? ' pts' : '%'}
    </span>
  );
}

function ComparisonItem({ label, value, delta, invert = false, point = false }) {
  return (
    <div className="min-w-[130px] flex-1">
      <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">{label}</span>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-bold text-[#0b2e59] dark:text-yellow-200">{value}</span>
        <DeltaBadge value={delta} invert={invert} point={point} />
      </div>
    </div>
  );
}

function BarList({ items, empty, formatValue = (value) => value.toLocaleString(), tone = 'primary' }) {
  if (!items?.length) return <PanelEmpty message={empty} />;
  const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
  const barClass = tone === 'emerald'
    ? 'bg-emerald-500 dark:bg-emerald-400'
    : 'bg-[#0b2e59] dark:bg-yellow-400';

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const value = Number(item.value || 0);
        return (
          <div key={item.name}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium text-gray-600 dark:text-slate-300" title={item.name}>{item.name}</span>
              <span className="shrink-0 font-semibold text-gray-500 dark:text-slate-400">{formatValue(value)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#162d4a]">
              <div
                className={`h-full rounded-full ${barClass} transition-all`}
                style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelList({ funnel, metric }) {
  const steps = funnelSteps(funnel);
  const total = steps[0]?.count || 0;
  const overall = steps[steps.length - 1]?.overall;
  if (!total) return <PanelEmpty message="No funnel activity in the last 30 days yet." />;

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={step.key}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-gray-600 dark:text-slate-300">{step.label}</span>
            <span className="font-semibold text-gray-500 dark:text-slate-400">
              {step.count.toLocaleString()} <span className="font-normal text-gray-400 dark:text-slate-500">{metric}</span>
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-[#162d4a]">
            <div
              className="h-full rounded-full bg-[#0b2e59] transition-all dark:bg-yellow-400"
              style={{ width: `${Math.max(2, step.width)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between gap-3 text-[10px] text-gray-400 dark:text-slate-500">
            <span>{index === 0 ? 'Top of funnel' : `${formatPct(step.rate)} from previous`}</span>
            <span>{index === 0 ? '' : `${formatPct(step.overall)} overall`}</span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs dark:border-[#1e3a5f]">
        <span className="font-medium text-gray-500 dark:text-slate-400">Overall conversion</span>
        <span className="font-bold text-[#0b2e59] dark:text-yellow-200">{formatPct(overall)}</span>
      </div>
    </div>
  );
}

function OrderStatusList({ statusCounts }) {
  const rows = orderStatusRows(statusCounts);
  if (!rows.length) return <PanelEmpty message="No orders in this window yet." />;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.name}>
          <div className="flex items-center justify-between gap-3">
            <StatusPill kind={row.tone}>{row.name}</StatusPill>
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">{row.count.toLocaleString()}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#162d4a]">
            <div
              className={`h-full rounded-full ${
                row.tone === 'danger'
                  ? 'bg-red-500 dark:bg-red-400'
                  : row.tone === 'success'
                    ? 'bg-emerald-500 dark:bg-emerald-400'
                    : row.tone === 'warning'
                      ? 'bg-amber-500 dark:bg-amber-400'
                      : 'bg-[#0b2e59] dark:bg-yellow-400'
              }`}
              style={{ width: `${Math.max(2, row.pct)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentMethodList({ methods }) {
  const rows = (methods || []).map((method) => ({
    name: method.name ? method.name.charAt(0).toUpperCase() + method.name.slice(1) : 'Unknown',
    value: Number(method.amount || 0),
  }));
  return (
    <BarList
      items={rows}
      tone="emerald"
      empty="No payments in this window yet."
      formatValue={(value) => `PHP ${formatPesos(value)}`}
    />
  );
}

function TopProductsList({ products }) {
  const rows = (products || []).map((product) => ({
    name: product.name,
    value: Number(product.quantity || 0),
    revenue: Number(product.revenue || 0),
  }));
  if (!rows.length) return <PanelEmpty message="No product sales in this window yet." />;
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="space-y-3">
      {rows.slice(0, 8).map((row) => (
        <div key={row.name}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-gray-600 dark:text-slate-300" title={row.name}>{row.name}</span>
            <span className="shrink-0 text-right text-gray-500 dark:text-slate-400">
              {row.value.toLocaleString()} sold
              <span className="ml-2 text-[10px] text-gray-400 dark:text-slate-500">PHP {formatPesos(row.revenue)}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#162d4a]">
            <div
              className="h-full rounded-full bg-[#0b2e59] transition-all dark:bg-yellow-400"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsError({ message, onRetry }) {
  return (
    <div className={`${CARD} p-4 sm:p-5`} role="alert">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={CARD_TITLE}>Engagement data unavailable</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{message}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-[10px] font-black uppercase tracking-widest text-gray-700 transition hover:bg-gray-100 dark:border-[#1e3a5f] dark:text-slate-300 dark:hover:bg-[#162d4a]"
        >
          <BsArrowClockwise className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [sales, setSales] = useState(null);
  const [period, setPeriod] = useState('daily');
  const [salesLoading, setSalesLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [chartsError, setChartsError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const salesCache = useRef({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setAnalyticsError(null);
      setChartsError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setError('Your session has expired. Sign in again to load the dashboard.');
          return;
        }
        const [s, a] = await Promise.all([
          apiGetAuth('/admin/stats', session.access_token),
          apiGetAuth('/admin/analytics?days=30', session.access_token).catch((err) => {
            if (!cancelled) setAnalyticsError(err.message || 'Could not load engagement data.');
            return null;
          }),
        ]);
        if (!cancelled) { setStats(s); setAnalytics(a); }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not reach the server.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadSales() {
      // Keep the chart that is already on screen while the next period loads.
      // A cached period renders immediately, then refreshes in the background.
      const cached = salesCache.current[period];
      if (cached) setSales(cached);
      setChartsError(null);
      setSalesLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const sl = await apiGetAuth(`/admin/sales-analytics?period=${period}`, session.access_token);
        if (!cancelled && sl) {
          salesCache.current[period] = sl;
          setSales(sl);
          setChartsError(null);
        }
      } catch (err) {
        if (!cancelled) setChartsError(err.message || 'Could not load the sales charts.');
      } finally {
        if (!cancelled) setSalesLoading(false);
      }
    }
    loadSales();
    return () => { cancelled = true; };
  }, [period, reloadKey]);

  function retry() {
    setStats(null);
    setAnalytics(null);
    setSales(null);
    salesCache.current = {};
    setReloadKey((k) => k + 1);
  }

  // While a new period is loading, keep the previous chart's labels and totals
  // until the response arrives. The toggle still shows the newly selected range.
  const displayPeriod = PERIOD_OPTIONS.some((option) => option.key === sales?.period)
    ? sales.period
    : period;
  const range = PERIOD_OPTIONS.find((option) => option.key === displayPeriod) || PERIOD_OPTIONS[0];
  const kpis = stats
    ? [
        {
          label: 'Revenue collected',
          value: `PHP ${formatPesos(stats.totalRevenue)}`,
          hint: 'All recorded payments',
        },
        {
          label: 'Order value',
          value: `PHP ${formatPesos(stats.totalSales)}`,
          hint: 'Cancelled orders excluded',
        },
        {
          label: 'Known-cost margin',
          value: `PHP ${formatPesos(stats.knownCostMargin)}`,
          hint: `${formatPct(Number(stats.costCoverage || 0) * 100)} of order lines have cost`,
          valueClass: Number(stats.knownCostMargin) < 0
            ? 'text-red-600 dark:text-red-400'
            : 'text-emerald-700 dark:text-emerald-400',
        },
        {
          label: 'Average order',
          value: `PHP ${formatPesos(stats.avgOrderValue)}`,
          hint: 'Per non-cancelled order',
        },
        {
          label: 'Orders',
          value: stats.totalOrders ?? 0,
          hint: `${stats.pendingOrders ?? 0} pending · ${stats.cancelledOrders ?? 0} cancelled`,
        },
        {
          label: 'Pending orders',
          value: stats.pendingOrders ?? 0,
          hint: 'Awaiting processing',
          valueClass: Number(stats.pendingOrders || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : '',
        },
        {
          label: 'Cancellation rate',
          value: formatPct(Number(stats.cancellationRate || 0) * 100),
          hint: `${stats.cancelledOrders ?? 0} cancelled orders`,
          valueClass: Number(stats.cancellationRate || 0) >= 0.2 ? 'text-red-600 dark:text-red-400' : '',
        },
        {
          label: 'Customers',
          value: stats.totalUsers ?? 0,
          hint: 'Registered shopper accounts',
        },
      ]
    : [];

  const revenuePoints = (sales?.periodRevenue || []).map((bucket) => ({
    label: bucketLabel(bucket.date, displayPeriod),
    value: Number(bucket.amount || 0),
  }));
  const viewPoints = (analytics?.dailyViews || []).map((bucket) => ({
    label: bucketLabel(bucket.date, 'daily'),
    value: Number(bucket.count || 0),
  }));
  const totalViews = viewPoints.reduce((sum, point) => sum + point.value, 0);

  return (
    <AdminPage title="Data Analytics" subtitle="A live look at how the store is performing." help={DASHBOARD_HELP}>
      {error && !stats ? (
        <EmptyState
          icon={<BsExclamationTriangle />}
          title="Dashboard data unavailable"
          message={error}
          action={
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0b2e59] px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:bg-[#15407a] dark:bg-yellow-500 dark:text-gray-900 dark:hover:bg-yellow-400 min-h-[44px]"
            >
              <BsArrowClockwise className="h-3.5 w-3.5" /> Retry
            </button>
          }
        />
      ) : !stats ? (
        <div>
          <span role="status" className="sr-only">Loading...</span>
          <div aria-hidden="true" className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <StatCard key={i} label="Loading" loading />)}
            </div>
            <ChartSkeleton />
            <div className={GRID}>
              <PanelSkeleton />
              <PanelSkeleton />
            </div>
            <div className={GRID}>
              <PanelSkeleton />
              <PanelSkeleton />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            {kpis.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                hint={card.hint}
                valueClass={card.valueClass}
              />
            ))}
          </div>

          {chartsError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300" role="alert">
              <span>Sales charts unavailable: {chartsError}</span>
              <button
                type="button"
                onClick={() => { setSales(null); setReloadKey((k) => k + 1); }}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-800 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-[#162d4a] dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                Retry
              </button>
            </div>
          ) : null}

          {sales ? (
            <section className={CARD}>
              <div className={CARD_HEADER}>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={CARD_TITLE}>Revenue collected</h2>
                    {salesLoading ? (
                      <span role="status" className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0b2e59] dark:bg-yellow-400" aria-hidden="true" />
                        Updating…
                      </span>
                    ) : null}
                  </div>
                  <p className={CARD_DESC}>
                    {range.range} · {compactPesos(sales.totalRevenue)} total
                  </p>
                </div>
                <PeriodToggle period={period} onChange={setPeriod} />
              </div>
              <div className={CARD_BODY} aria-busy={salesLoading ? 'true' : undefined}>
                <AnalyticsAreaChart
                  points={revenuePoints}
                  height={250}
                  formatValue={(value) => `PHP ${formatPesos(value)}`}
                  ariaLabel={`Revenue collected over the ${range.range.toLowerCase()}`}
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-3 border-t border-gray-100 px-4 py-3 sm:px-5 dark:border-[#1e3a5f]">
                <ComparisonItem
                  label="Revenue"
                  value={`PHP ${formatPesos(sales.totalRevenue)}`}
                  delta={deltaPct(sales.totalRevenue, sales.previous?.revenue)}
                />
                <ComparisonItem
                  label="Orders"
                  value={sales.totalOrders ?? 0}
                  delta={deltaPct(sales.totalOrders, sales.previous?.orders)}
                />
                <ComparisonItem
                  label="Avg order"
                  value={`PHP ${formatPesos(sales.avgOrderValue)}`}
                  delta={deltaPct(sales.avgOrderValue, sales.previous?.avgOrderValue)}
                />
                <ComparisonItem
                  label="Cancellation"
                  value={formatPct(Number(sales.cancellationRate || 0) * 100)}
                  delta={(Number(sales.cancellationRate || 0) - Number(sales.previous?.cancellationRate || 0)) * 100}
                  invert
                  point
                />
                <span className="w-full text-[9px] font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500 sm:w-auto sm:self-end">
                  {range.compare}
                </span>
              </div>
            </section>
          ) : (
            <ChartSkeleton />
          )}

          {sales ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SectionCard title="Order status" description={`${range.range} · current orders`}>
                <OrderStatusList statusCounts={sales.statusCounts || []} />
              </SectionCard>

              <SectionCard title="Top products" description={`${range.range} · by quantity`}>
                <TopProductsList products={sales.topProducts || []} />
              </SectionCard>

              <SectionCard title="Payment methods" description={`${range.range} · collected`}>
                <PaymentMethodList methods={sales.methodRevenue || []} />
              </SectionCard>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <PanelSkeleton />
              <PanelSkeleton />
              <PanelSkeleton />
            </div>
          )}

          {analyticsError ? (
            <AnalyticsError message={analyticsError} onRetry={retry} />
          ) : analytics ? (
            <>
              {analytics.truncated ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300" role="status">
                  This window has more than 20,000 events. Charts use the newest 20,000; older activity is excluded.
                </p>
              ) : null}

              <div className={GRID}>
                <SectionCard
                  title="Conversion funnel"
                  description={`${analytics.funnelMetric === 'sessions' ? 'Unique sessions' : 'Events'} · last ${analytics.days} days`}
                >
                  <FunnelList
                    funnel={analytics.funnel}
                    metric={analytics.funnelMetric === 'sessions' ? 'sessions' : 'events'}
                  />
                </SectionCard>

                <SectionCard
                  title="Traffic by source"
                  description={`${analytics.sourceMetric === 'sessions' ? 'Unique sessions' : 'Events'} · last ${analytics.days} days`}
                >
                  <BarList
                    items={(analytics.sources || []).slice(0, 7).map((source) => ({ name: source.name, value: source.count }))}
                    empty="No traffic recorded yet."
                  />
                </SectionCard>
              </div>

              <SectionCard
                title="Page views"
                description={`${totalViews.toLocaleString()} views · last ${analytics.days} days`}
              >
                <AnalyticsAreaChart
                  points={viewPoints}
                  height={220}
                  formatValue={(value) => `${Number(value).toLocaleString()} views`}
                  ariaLabel="Page views over the last 30 days"
                />
              </SectionCard>

              <div className={GRID}>
                <SectionCard title="Top pages" description="Most viewed pages">
                  <BarList
                    items={(analytics.topPages || []).map((page) => ({ name: page.name, value: page.count }))}
                    empty="No page views recorded yet."
                  />
                </SectionCard>

                <SectionCard title="Top searches" description="What shoppers are looking for">
                  <BarList
                    items={(analytics.topSearches || []).map((search) => ({ name: search.query, value: search.count }))}
                    empty="No searches recorded yet."
                  />
                </SectionCard>
              </div>
            </>
          ) : (
            <div className={GRID}>
              <PanelSkeleton />
              <PanelSkeleton />
              <PanelSkeleton />
              <PanelSkeleton />
            </div>
          )}
        </div>
      )}
    </AdminPage>
  );
}

export default AdminDashboard;
