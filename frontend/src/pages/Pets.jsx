import { useState } from 'react'
import { usePets } from '../context/PetsContext'
import { useShop } from '../context/ShopContext'
import PetProfileForm from '../components/PetProfileForm'
import RecommendationResults from '../components/RecommendationResults'
import ConfirmModal from '../components/ConfirmModal'
import {
  findLabel,
  SPECIES_OPTIONS,
  HEALTH_CONDITION_OPTIONS,
  getLifeStageOptions,
} from '../data/petFormOptions'
import ProductQuickViewDialog from '../components/ProductQuickViewDialog'

// the main pets page - shows the signed-in user's saved pets as a sidebar of tabs
// clicking a pet reveals its recommended foods based on its profile
// users can add unlimited pets (for owners with multiple pets),
// edit an existing pet's profile, or delete one
function Pets() {
  const { pets, activePetId, setActivePetId, addPet, updatePet, removePet, getActivePet, isAuthenticated } = usePets()
  const { openLogin } = useShop()
  const [mode, setMode] = useState('view')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const activePet = getActivePet()

  function handleAdd(petData) {
    addPet(petData)
    setMode('view')
  }

  function handleUpdate(petData) {
    if (activePetId) {
      updatePet(activePetId, petData)
      setMode('view')
    }
  }

  function handleDelete() {
    if (!activePetId) return
    setConfirmDelete(true)
  }

  function confirmDeletePet() {
    if (!activePetId) return
    removePet(activePetId)
    setMode('view')
    setConfirmDelete(false)
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 dark:bg-[#1a2236] dark:border-gray-700">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pet Food Recommendations</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Sign in to save your pets&apos; profiles and get personalized food recommendations
            tailored to their health conditions.
          </p>
          <button
            type="button"
            onClick={openLogin}
            className="px-6 py-2.5 rounded-lg bg-[#0b2e59] hover:bg-[#0d3a6e] text-white text-sm font-semibold transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="lg:mx-auto lg:max-w-7xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight dark:text-white">
          My Pets &amp; Food Recommendations
        </h1>
        <p className="mt-1.5 text-gray-500 text-sm sm:text-base">
          Add each of your pets below. We&apos;ll recommend food products that match their species,
          life stage, and health conditions.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 ">
        <aside className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden dark:bg-[#1a2236] dark:border-gray-700 dark:text-white dark:focus:border-blue-500"> 
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-white">Your Pets</h2>
              <span className="text-xs text-gray-400">{pets.length}</span>
            </div>

            {pets.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No pets yet. Click &quot;Add a Pet&quot; to start.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {pets.map((pet) => {
                  const isActive = pet.id === activePetId
                  return (
                    <li key={pet.id}>
                      <button
                        type="button"
                        onClick={() => { setActivePetId(pet.id); setMode('view') }}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          isActive
                            ? 'bg-[#0b2e59]/5 border-l-4 border-[#0b2e59] dark:border-yellow-500'
                            : 'hover:bg-gray-50 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="font-medium text-gray-900 text-sm dark:text-white">{pet.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                          {findLabel(SPECIES_OPTIONS, pet.species)} &middot;{' '}
                          {findLabel(getLifeStageOptions(pet.species), pet.lifeStage)}
                        </div>
                        {pet.healthCondition && pet.healthCondition !== 'healthy' && (
                          <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            {findLabel(HEALTH_CONDITION_OPTIONS, pet.healthCondition)}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setMode('add'); setActivePetId(null) }}
            className="w-full px-4 py-2.5 rounded-lg bg-[#dbb727] hover:bg-[#c9a820] text-[#0b2e59] dark:text-white dark:bg-[#c9a820] dark:hover:bg-[#b8991d] font-semibold transition-colors"
          >
            + Add a Pet
          </button>
        </aside>

        <section className="space-y-4">
          {mode === 'add' && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 dark:bg-[#1a2236] dark:border-gray-700 dark:text-white dark:focus:border-blue-500">
                <h2 className="font-semibold text-gray-900 dark:text-white">Add a new pet</h2>
                <p className="text-xs text-gray-500 mt-0.5">All fields use dropdowns to keep your profile consistent.</p>
              </div>
              <PetProfileForm
                onSubmit={handleAdd}
                onCancel={pets.length > 0 ? () => setMode('view') : undefined}
                submitLabel="Save Pet"
              />
            </>
          )}

          {mode === 'edit' && activePet && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3">
                <h2 className="font-semibold text-gray-900">Edit {activePet.name}&apos;s profile</h2>
              </div>
              <PetProfileForm
                initialPet={activePet}
                onSubmit={handleUpdate}
                onCancel={() => setMode('view')}
                submitLabel="Update Pet"
              />
            </>
          )}

          {mode === 'view' && pets.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center dark:bg-[#1a2236] dark:border-gray-700 dark:text-white dark:focus:border-blue-500">
              <h2 className="text-lg font-semibold text-gray-900 mb-1 dark:text-white">Welcome!</h2>
              <p className="text-sm text-gray-600 mb-4 dark:text-gray-400">
                Add your first pet to get started with personalized food recommendations.
              </p>
              <button
                type="button"
                onClick={() => setMode('add')}
                className="px-5 py-2.5 rounded-lg bg-[#0b2e59] hover:bg-[#0d3a6e] text-white text-sm font-semibold transition-colors"
              >
                Add My First Pet
              </button>
            </div>
          )}

          {mode === 'view' && activePet && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 dark:bg-[#1a2236]">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{activePet.name}</h2>
                    <div className="text-sm text-gray-600 mt-1 space-x-1 dark:text-gray-400">
                      <span>{findLabel(SPECIES_OPTIONS, activePet.species)}</span>
                      <span className="text-gray-300">&middot;</span>
                      <span>{findLabel(getLifeStageOptions(activePet.species), activePet.lifeStage)}</span>
                      <span className="text-gray-300">&middot;</span>
                      <span>{findLabel(HEALTH_CONDITION_OPTIONS, activePet.healthCondition)}</span>
                    </div>
                    {activePet.allergies && activePet.allergies.length > 0 && !activePet.allergies.includes('none') && (
                      <div className="text-xs text-gray-500 mt-1.5 dark:text-gray-400">
                        Avoiding: {activePet.allergies.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('edit')}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <RecommendationResults pet={activePet} />
            </>
          )}
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        title={`Remove ${activePet?.name}?`}
        message="This pet profile and its food recommendations will be removed from your account. This cannot be undone."
        confirmLabel="Remove"
        danger
        onConfirm={confirmDeletePet}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

export default Pets
