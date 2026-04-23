import React, { useState, useEffect } from 'react';
import supabase from '../lib/supabase';

const AdminPayments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment')
      .select(`
        payment_id, amount, method, payment_date,
        orders ( profiles ( first_name, last_name ) )
      `)
      .order('payment_date', { ascending: false });

    if (!error) setPayments(data || []);
    setLoading(false);
  };

  const totalRevenue = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 text-black uppercase tracking-wide">Payment Transactions</h1>

      {/* Analytics-style Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="bg-yellow-500 p-6 rounded-lg shadow-md flex flex-col justify-center">
          <span className="text-xs font-semibold uppercase opacity-80 text-black">Total Revenue</span>
          <h2 className="text-3xl font-black text-black">₱{totalRevenue.toLocaleString()}</h2>
        </div>
        <div className="bg-yellow-500 p-6 rounded-lg shadow-md flex flex-col justify-center">
          <span className="text-xs font-semibold uppercase opacity-80 text-black">Total Transactions</span>
          <h2 className="text-3xl font-black text-black">{payments.length}</h2>
        </div>
      </div>

      <div className="overflow-x-auto bg-base-200 rounded-xl border border-base-300 shadow-sm">
        <table className="table w-full">
          <thead className="bg-base-300">
            <tr className="text-white uppercase text-xs font-bold">
              <th className="py-4 px-6">Trans. ID</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody className="text-black">
            {loading ? (
              <tr><td colSpan="5" className="text-center py-10 opacity-50">Syncing payments...</td></tr>
            ) : (
              payments.map((p) => (
                <tr key={p.payment_id} className="hover border-b border-base-300">
                  <td className="text-xs font-mono opacity-50 py-4 px-6">
                    {p.payment_id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="font-black uppercase text-sm">
                    {p.orders?.profiles?.first_name} {p.orders?.profiles?.last_name || 'Guest'}
                  </td>
                  <td className="font-black text-lg text-green-700">
                    ₱{p.amount?.toLocaleString()}
                  </td>
                  <td>
                    <span className="badge badge-outline border-black text-black font-bold text-[10px] uppercase">
                      {p.method}
                    </span>
                  </td>
                  <td className="text-sm font-medium opacity-60">
                    {new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminPayments;