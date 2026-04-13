const AdminProductManagement = () => {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Products</h2>

      <div className="overflow-x-auto bg-base-200 rounded-xl border border-base-300">
        <table className="table">
          <thead className="bg-base-300 text-base-content">
            <tr>
              <th>Name</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            <tr className="hover">
              <td>Royal Canin Dog Food</td>
              <td>P250</td>
              <td>20</td>
              <td className="text-primary">Active</td>
            </tr>
            <tr className="hover">
              <td>Dog Leash</td>
              <td>P120</td>
              <td>50</td>
              <td className="text-primary">Active</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminProductManagement;