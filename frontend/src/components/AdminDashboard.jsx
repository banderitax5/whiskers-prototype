import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth } from '../lib/api';
import { AdminPage, StatCard } from './adminTheme';
import toast from 'react-hot-toast';

const PANEL = 'rounded-xl border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0f2137] p-4';
const PANEL_TITLE = 'text-xs font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-3';
const CHART_GRID = 'mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4';
const PULSE = 'bg-gray-200 dark:bg-[#162d4a] rounded animate-pulse';
const STAT_LABELS = [
  'Total Sales',
  'Total Profit',
  'Total Orders',
  'Pending Orders',
  'Total Users',
  'Total Products',
  'Total Revenue',
];

function PanelSkeleton({ rows = 4 }) {
  return (
    <div className={PANEL}>
      <div className={`${PULSE} h-4 w-44 mb-3`} />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`${PULSE} h-4 w-24`} />
            <div className={`${PULSE} h-4 flex-1`} />
            <div className={`${PULSE} h-4 w-8`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ items, max }) {
  if (!items.length) return <p className="text-xs text-gray-400">No data yet</p>
  const barMax = max || Math.max(...items.map(i => i.count), 1)
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-2 text-xs">
          <span className="w-24 truncate text-gray-600 dark:text-slate-300" title={item.name}>{item.name}</span>
          <div className="flex-1 h-4 bg-gray-100 dark:bg-[#162d4a] rounded overflow-hidden">
            <div
              className="h-full bg-[#0b2e59] dark:bg-yellow-400 rounded transition-all"
              style={{ width: `${Math.max(4, (item.count / barMax) * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right font-semibold text-gray-500 dark:text-slate-400">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function FunnelChart({ data }) {
  const steps = [
    { key: 'page_view', label: 'Page Views' },
    { key: 'product_view', label: 'Product Views' },
    { key: 'add_to_cart', label: 'Add to Cart' },
    { key: 'checkout_complete', label: 'Orders' },
  ]
  const max = Math.max(...steps.map(s => data[s.key] || 0), 1)
  return (
    <div className="space-y-2">
      {steps.map((s) => {
        const val = data[s.key] || 0
        return (
          <div key={s.key} className="flex items-center gap-2 text-xs">
            <span className="w-28 text-gray-600 dark:text-slate-300">{s.label}</span>
            <div className="flex-1 h-5 bg-gray-100 dark:bg-[#162d4a] rounded overflow-hidden">
              <div
                className="h-full bg-[#0b2e59] dark:bg-yellow-400 rounded transition-all"
                style={{ width: `${Math.max(2, (val / max) * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right font-semibold text-gray-500 dark:text-slate-400">{val.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [sales, setSales] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const [s, a, sl] = await Promise.all([
          apiGetAuth('/admin/stats', session.access_token),
          apiGetAuth('/admin/analytics?days=30', session.access_token).catch(() => null),
          apiGetAuth('/admin/sales-analytics?days=30', session.access_token).catch(() => null),
        ]);
        if (!cancelled) { setStats(s); setAnalytics(a); setSales(sl); }
      } catch (err) {
        if (!cancelled) toast.error(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const statValues = stats
    ? [
        `PHP ${Number(stats.totalSales || 0).toLocaleString()}`,
        `PHP ${Number(stats.totalProfit || 0).toLocaleString()}`,
        stats.totalOrders ?? 0,
        stats.pendingOrders ?? 0,
        stats.totalUsers ?? 0,
        stats.totalProducts ?? 0,
        `PHP ${Number(stats.totalRevenue || 0).toLocaleString()}`,
      ]
    : [];
  const cards = STAT_LABELS.map((label, i) => ({ label, value: statValues[i] }));

  return (
    <AdminPage title="Data Analytics" subtitle="A live look at how the store is performing.">

      {!stats ? (
        <div>
          <span role="status" className="sr-only">Loading...</span>
          <div aria-hidden="true">
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            {STAT_LABELS.map((label) => <StatCard key={label} label={label} loading />)}
          </div>

          <div className={CHART_GRID}>
            <div className={`lg:col-span-2 ${PANEL}`}>
              <div className={`${PULSE} h-4 w-44 mb-3`} />
              <div className={`${PULSE} h-28 w-full`} />
              <div className="flex justify-between mt-1">
                <div className={`${PULSE} h-3 w-16`} />
                <div className={`${PULSE} h-3 w-16`} />
              </div>
            </div>
            <PanelSkeleton />
            <PanelSkeleton />
            <PanelSkeleton />
          </div>

          <div className={CHART_GRID}>
            <PanelSkeleton />
            <PanelSkeleton />
            <PanelSkeleton />
            <PanelSkeleton />
          </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            {cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} />)}
          </div>

          {/* SALES CHARTS */}
          {sales && (
            <div className={CHART_GRID}>
              {/* Daily Revenue */}
              {sales.dailyRevenue.length > 0 && (
                <div className={`lg:col-span-2 ${PANEL}`}>
                  <h3 className={PANEL_TITLE}>Daily Revenue (30d)</h3>
                  <div className="flex items-end gap-px h-28">
                    {sales.dailyRevenue.map((d) => {
                      const max = Math.max(...sales.dailyRevenue.map(x => x.amount), 1)
                      const h = Math.max(2, (d.amount / max) * 100)
                      return (
                        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: PHP ${d.amount.toLocaleString()}`}>
                          <div className="w-full bg-emerald-500 dark:bg-emerald-400 rounded-t" style={{ height: `${h}%` }} />
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-gray-400">{sales.dailyRevenue[0]?.date}</span>
                    <span className="text-[9px] text-gray-400">{sales.dailyRevenue[sales.dailyRevenue.length - 1]?.date}</span>
                  </div>
                </div>
              )}

              {/* Revenue by Payment Method */}
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Revenue by Payment Method</h3>
                {sales.methodRevenue.length > 0 ? (
                  <div className="space-y-2">
                    {sales.methodRevenue.map((m) => {
                      const max = sales.methodRevenue[0]?.amount || 1
                      const pct = Math.round((m.amount / max) * 100)
                      return (
                        <div key={m.name} className="flex items-center gap-2 text-xs">
                          <span className="w-20 truncate font-medium text-gray-600 dark:text-slate-300 capitalize">{m.name}</span>
                          <div className="flex-1 h-5 bg-gray-100 dark:bg-[#162d4a] rounded overflow-hidden">
                            <div className="h-full bg-emerald-500 dark:bg-emerald-400 rounded transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-20 text-right font-semibold text-gray-500 dark:text-slate-400">PHP {m.amount.toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : <p className="text-xs text-gray-400">No payment data yet.</p>}
              </div>

              {/* Top Selling Products */}
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Top Selling Products</h3>
                {sales.topProducts.length > 0 ? (
                  <div className="space-y-2">
                    {sales.topProducts.slice(0, 6).map((p) => {
                      const maxQty = sales.topProducts[0]?.quantity || 1
                      return (
                        <div key={p.name} className="flex items-center gap-2 text-xs">
                          <span className="w-28 truncate text-gray-600 dark:text-slate-300" title={p.name}>{p.name}</span>
                          <div className="flex-1 h-4 bg-gray-100 dark:bg-[#162d4a] rounded overflow-hidden">
                            <div className="h-full bg-[#0b2e59] dark:bg-yellow-400 rounded transition-all" style={{ width: `${Math.max(4, (p.quantity / maxQty) * 100)}%` }} />
                          </div>
                          <span className="w-14 text-right text-gray-500 dark:text-slate-400">{p.quantity} sold</span>
                        </div>
                      )
                    })}
                  </div>
                ) : <p className="text-xs text-gray-400">No product sales yet.</p>}
              </div>

              {/* Order Status Breakdown */}
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Order Status</h3>
                {sales.statusCounts.length > 0 ? (
                  <div className="space-y-2">
                    {sales.statusCounts.map((s) => {
                      const max = sales.statusCounts[0]?.count || 1
                      return (
                        <div key={s.status} className="flex items-center gap-2 text-xs">
                          <span className="w-20 truncate font-medium text-gray-600 dark:text-slate-300">{s.status}</span>
                          <div className="flex-1 h-5 bg-gray-100 dark:bg-[#162d4a] rounded overflow-hidden">
                            <div className="h-full bg-amber-500 dark:bg-amber-400 rounded transition-all" style={{ width: `${Math.max(4, (s.count / max) * 100)}%` }} />
                          </div>
                          <span className="w-8 text-right font-semibold text-gray-500 dark:text-slate-400">{s.count}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : <p className="text-xs text-gray-400">No orders yet.</p>}
              </div>
            </div>
          )}

          {analytics && (
            <div className={CHART_GRID}>
              {/* Conversion Funnel */}
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Conversion Funnel (30d)</h3>
                <FunnelChart data={analytics.funnel} />
              </div>

              {/* Traffic by Source */}
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Traffic by Source (30d)</h3>
                <BarChart items={analytics.sources.slice(0, 6)} />
              </div>

              {/* Campaign Performance */}
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Campaigns (30d)</h3>
                {analytics.campaigns.length > 0 ? (
                  <BarChart items={analytics.campaigns.slice(0, 6)} />
                ) : (
                  <p className="text-xs text-gray-400">No campaign data yet. Add UTM params to your links.</p>
                )}
              </div>

              {/* Top Searches */}
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Top Searches (30d)</h3>
                {analytics.topSearches.length > 0 ? (
                  <BarChart items={analytics.topSearches.map(s => ({ name: s.query, count: s.count }))} />
                ) : (
                  <p className="text-xs text-gray-400">No search data yet.</p>
                )}
              </div>

              {/* Daily Page Views */}
              {analytics.dailyViews.length > 0 && (
                <div className={`lg:col-span-2 ${PANEL}`}>
                  <h3 className={PANEL_TITLE}>Daily Page Views (30d)</h3>
                  <div className="flex items-end gap-px h-24">
                    {analytics.dailyViews.map((d) => {
                      const max = Math.max(...analytics.dailyViews.map(x => x.count), 1)
                      const h = Math.max(2, (d.count / max) * 100)
                      return (
                        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.count}`}>
                          <div className="w-full bg-[#0b2e59] dark:bg-yellow-400 rounded-t" style={{ height: `${h}%` }} />
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-gray-400">{analytics.dailyViews[0]?.date}</span>
                    <span className="text-[9px] text-gray-400">{analytics.dailyViews[analytics.dailyViews.length - 1]?.date}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AdminPage>
  );
}

export default AdminDashboard;
