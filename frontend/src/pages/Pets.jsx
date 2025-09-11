import { useEffect, useState } from 'react'

function Pets() {
  const [pets, setPets] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadPets() {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        // Placeholder data for now
        const data = [
          { id: '1', name: 'Buddy', species: 'Dog' },
          { id: '2', name: 'Mittens', species: 'Cat' },
        ]
        if (!cancelled) setPets(data)
      } catch (err) {
        if (!cancelled) setErrorMessage(err.message ?? 'Unknown error')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    loadPets()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pets</h1>
      {isLoading && <p className="text-gray-600">Loading...</p>}
      {errorMessage && <p className="text-red-600">{errorMessage}</p>}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pets.map((pet) => (
          <li key={pet.id} className="rounded border p-3 bg-white">
            <div className="font-semibold">{pet.name}</div>
            <div className="text-gray-600">{pet.species}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Pets


