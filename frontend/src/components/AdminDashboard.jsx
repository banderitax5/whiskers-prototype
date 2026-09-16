import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth } from '../lib/api';
import { AdminPage, StatCard, EmptyState } from './adminTheme';
import { BsBarChart } from 'react-icons/bs';
import toast from 'react-hot-toast';

function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const data = await apiGetAuth('/admin/stats', session.access_token);
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) toast.error(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const cards = stats
    ? [
        { label: 'Total Sales', value: `PHP ${Number(stats.totalSales || 0).toLocaleString()}` },
        { label: 'Total Profit', value: `PHP ${Number(stats.totalProfit || 0).toLocaleString()}` },
        { label: 'Total Orders', value: stats.totalOrders ?? 0 },
        { label: 'Pending Orders', value: stats.pendingOrders ?? 0 },
        { label: 'Total Users', value: stats.totalUsers ?? 0 },
        { label: 'Total Products', value: stats.totalProducts ?? 0 },
        { label: 'Total Revenue', value: `PHP ${Number(stats.totalRevenue || 0).toLocaleString()}` },
      ]
    : [];

  return (
    <AdminPage title="Data Analytics" subtitle="A live look at how the store is performing.">

      {!stats ? (
        <div className="text-center text-gray-500 dark:text-slate-400 py-10">Loading analytics...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            {cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} />)}
          </div>

          <div className="mt-8 rounded-xl border border-gray-200 dark:border-[#1e3a5f] bg-gray-50 dark:bg-[#0f2137]">
            <EmptyState
              icon={<BsBarChart />}
              title="Detailed Charts Coming Soon"
              message="Sales trend, top products, and revenue by category will live here once enough data is collected."
            />
          </div>
        </>
      )}
    </AdminPage>
  );
}

export default AdminDashboard;
