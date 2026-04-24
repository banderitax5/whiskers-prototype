import React, { useEffect, useState } from 'react';
import supabase from '../lib/supabase'
// the main admin dashboard page that shows high level stats
// the grid is responsive: 1 column on mobile, 2 on tablet, 3 on desktop
// these are placeholder cards for now, will be replaced with real data later
function AdminDashboard() {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    pendingOrders: 0,
    totalProfit: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    // 1. Fetch Total Sales & Profit from the 'sales' table
    const { data: salesData } = await supabase
      .from('sales')
      .select('total_amount, profit');

    // 2. Fetch Total Orders and filter for 'Pending' from the 'orders' table
    const { data: ordersData } = await supabase
      .from('orders')
      .select('status');

    if (salesData && ordersData) {
      const totalSales = salesData.reduce((sum, item) => sum + (item.total_amount || 0), 0);
      const totalProfit = salesData.reduce((sum, item) => sum + (item.profit || 0), 0);
      const pending = ordersData.filter(order => order.status === 'Pending').length;

      setStats({
        totalSales,
        totalProfit,
        totalOrders: ordersData.length,
        pendingOrders: pending
      });
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 text-black uppercase tracking-wide">Data Analytics</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Sales Metric */}
        <div className="bg-yellow-500 p-6 rounded-lg shadow-md flex flex-col justify-center">
          <span className="text-xs font-semibold uppercase opacity-80">Total Sales</span>
          <h2 className="text-3xl font-black">₱{stats.totalSales.toLocaleString()}</h2>
        </div>

        {/* Total Profit Metric (New addition based on your Sales table) */}
        <div className="bg-yellow-500 p-6 rounded-lg shadow-md flex flex-col justify-center">
          <span className="text-xs font-semibold uppercase opacity-80">Total Profit</span>
          <h2 className="text-3xl font-black">₱{stats.totalProfit.toLocaleString()}</h2>
        </div>

        {/* Total Orders Metric */}
        <div className="bg-yellow-500 p-6 rounded-lg shadow-md flex flex-col justify-center">
          <span className="text-xs font-semibold uppercase opacity-80">Total Orders</span>
          <h2 className="text-3xl font-black">{stats.totalOrders}</h2>
        </div>

        {/* Pending Orders Metric */}
        <div className="bg-yellow-500 p-6 rounded-lg shadow-md flex flex-col justify-center">
          <span className="text-xs font-semibold uppercase opacity-80">Pending Orders</span>
          <h2 className="text-3xl font-black">{stats.pendingOrders}</h2>
        </div>
      </div>

      {/* Placeholder for future Charts/Tables using the 'data_analytics' or 'report_type' info */}
      <div className="mt-8 p-6 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
        Detailed Analytics Charts (Linked to sales_id and report_date) will appear here.
      </div>
    </div>
  );
}
  )
}

export default AdminDashboard

export default AdminDashboard;