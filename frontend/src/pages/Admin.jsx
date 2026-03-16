import React from 'react'

// the admin dashboard page - only accessible to users with role 'admin'
// the RequireAdmin guard in App.jsx blocks anyone else from reaching this
// for now it's just a placeholder - you can build out the admin features here later
function Admin() {
  return (
    <div>
        <h1 className="text-7xl font-bold flex justify-center items-center">This is admin page</h1>
    </div>
  )
}

export default Admin
