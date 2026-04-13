const AdminPayments = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Payments</h2>

      {/* summary row */}
      <div className="flex gap-6 text-sm">
        <span>Total Revenue: <b className="text-primary">$25,000</b></span>
        <span>Pending: <b className="text-yellow-400">$1,200</b></span>
        <span>Failed: <b className="text-red-400">$300</b></span>
      </div>

      {/* table */}
      <div className="overflow-x-auto bg-base-200 rounded-xl border border-base-300">
        <table className="table">
          <thead className="bg-base-300">
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>

          <tbody>
            <tr className="hover">
              <td>#TX001</td>
              <td>Christine Robles</td>
              <td>P200</td>
              <td className="text-green-400">Completed</td>
              <td>12 Apr</td>
            </tr>

            <tr className="hover">
              <td>#TX002</td>
              <td>Nathaniel Velasco</td>
              <td>P75</td>
              <td className="text-yellow-400">Pending</td>
              <td>13 Apr</td>
            </tr>

            <tr className="hover">
              <td>#TX003</td>
              <td>Angelo Oborza</td>
              <td>P500</td>
              <td className="text-red-400">Failed</td>
              <td>13 Apr</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminPayments;