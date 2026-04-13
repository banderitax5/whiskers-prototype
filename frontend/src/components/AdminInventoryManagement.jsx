const AdminInventoryManagement = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Inventory Management</h2>

      {/* filters */}
      <div className="flex gap-3">
        <button className="btn btn-sm btn-primary text-black">All</button>
        <button className="btn btn-sm">Low Stock</button>
        <button className="btn btn-sm">Out of Stock</button>
      </div>

      {/* table */}
      <div className="overflow-x-auto bg-base-200 rounded-xl border border-base-300">
        <table className="table">
          <thead className="bg-base-300">
            <tr>
              <th>Product</th>
              <th>Warehouse</th>
              <th>Stock</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            <tr className="hover">
              <td>Pedigree</td>
              <td>A1</td>
              <td>120</td>
              <td className="text-green-400">In Stock</td>
            </tr>

            <tr className="hover">
              <td>Royal Canin</td>
              <td>B2</td>
              <td>10</td>
              <td className="text-yellow-400">Low</td>
            </tr>

            <tr className="hover">
              <td>Dog Treats</td>
              <td>C1</td>
              <td>0</td>
              <td className="text-red-400">Out</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminInventoryManagement;