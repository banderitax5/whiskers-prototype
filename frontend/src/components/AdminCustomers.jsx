import React, { useState, useEffect } from 'react';
import supabase from '../lib/supabase';

const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, first_name, last_name, phone, role,
        feedback ( message )
      `)
      .eq('role', 'user');

    if (!error) setCustomers(data || []);
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 text-black uppercase tracking-wide">Customer Management</h1>

      {/* Analytics-style Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="bg-yellow-500 p-6 rounded-lg shadow-md flex flex-col justify-center">
          <span className="text-xs font-semibold uppercase opacity-80 text-black">Total Registered</span>
          <h2 className="text-3xl font-black text-black">{customers.length}</h2>
        </div>
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto bg-base-200 rounded-xl border border-base-300 shadow-sm">
        <table className="table w-full">
          <thead className="bg-base-300">
            <tr className="text-white uppercase text-xs font-bold">
              <th className="py-4 px-6">Customer</th>
              <th>Contact</th>
              <th>Feedback</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="text-white">
            {loading ? (
              <tr><td colSpan="4" className="text-center py-10 opacity-50">Syncing profiles...</td></tr>
            ) : (
              customers.map((user) => (
                <tr key={user.id} className="hover border-b border-base-300 transition-colors">
                  <td className="font-black py-4 px-6 uppercase text-sm">
                    {user.first_name} {user.last_name}
                  </td>
                  <td className="font-medium">{user.phone || 'N/A'}</td>
                  <td className="italic text-sm opacity-70">
                    "{user.feedback?.[0]?.message || "No feedback yet"}"
                  </td>
                  <td>
                    <span className="badge bg-black text-yellow-500 border-none font-bold text-[10px] px-3">USER</span>
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

export default AdminCustomers;