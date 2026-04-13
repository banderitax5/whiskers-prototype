const AdminDashboard = () => {
  return (
    <div className="space-y-6">

      {/* STATS */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-base-200 p-4 rounded-xl border border-base-300">
          <p className="text-sm opacity-60">Total Sales</p>
          <h2 className="text-xl font-bold text-primary">P350K</h2>
        </div>

        <div className="bg-base-200 p-4 rounded-xl border border-base-300">
          <p className="text-sm opacity-60">Orders</p>
          <h2 className="text-xl font-bold text-primary">10,700</h2>
        </div>

        <div className="bg-base-200 p-4 rounded-xl border border-base-300">
          <p className="text-sm opacity-60">Pending</p>
          <h2 className="text-xl font-bold text-primary">500</h2>
        </div>
      </div>

      {/* CHART */}
      <div className="bg-base-200 h-64 rounded-xl border border-base-300 flex items-center justify-center">
        <p className="opacity-50">Analytics Chart</p>
      </div>
    </div>
  );
};

export default AdminDashboard;