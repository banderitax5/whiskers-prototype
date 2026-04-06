import React from 'react'

function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Data Analytics</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-500 p-4 rounded-lg">Total Sales</div>
        <div className="bg-yellow-500 p-4 rounded-lg">Total Orders</div>
        <div className="bg-yellow-500 p-4 rounded-lg">Pending</div>
      </div>
    </div>
  )
}

export default AdminDashboard
