import React from 'react'

// the main admin dashboard page that shows high level stats
// the grid is responsive: 1 column on mobile, 2 on tablet, 3 on desktop
// these are placeholder cards for now, will be replaced with real data later
function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-black">Data Analytics</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-yellow-500 p-4 rounded-lg text-black">Total Sales</div>
        <div className="bg-yellow-500 p-4 rounded-lg text-black">Total Orders</div>
        <div className="bg-yellow-500 p-4 rounded-lg text-black">Pending</div>
      </div>
    </div>
  )
}

export default AdminDashboard
