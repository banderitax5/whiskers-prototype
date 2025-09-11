import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-gray-700">The page you are looking for does not exist.</p>
      <Link to="/" className="text-blue-600 underline">Go home</Link>
    </div>
  )
}

export default NotFound


