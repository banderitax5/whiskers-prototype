const AdminCustomers = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Customers</h2>

      {/* top stats */}
      <div className="flex gap-6 text-sm">
        <span>Total: <b className="text-primary">11,040</b></span>
        <span>New: <b className="text-green-400">2,370</b></span>
        <span>Revenue: <b className="text-primary">$250K</b></span>
      </div>

      {/* table */}
      <div className="overflow-x-auto bg-base-200 rounded-xl border border-base-300">
        <table className="table">
          <thead className="bg-base-300">
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Orders</th>
              <th>Spent</th>
            </tr>
          </thead>

          <tbody>
            <tr className="hover">
              <td>Ken Ashley</td>
              <td>123456789</td>
              <td>5</td>
              <td>P300</td>
            </tr>

            <tr className="hover">
              <td>Tine Joy</td>
              <td>987654321</td>
              <td>3</td>
              <td>P430</td>
            </tr>

            <tr className="hover">
              <td>Angelo Salalac</td>
              <td>555123456</td>
              <td>8</td>
              <td>P320</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminCustomers;