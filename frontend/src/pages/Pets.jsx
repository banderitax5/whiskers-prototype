import { useState } from 'react'
import { usePets } from '../context/PetsContext'
import { useShop } from '../context/ShopContext'
import PetProfileForm from '../components/PetProfileForm'
import RecommendationResults from '../components/RecommendationResults'
import ConfirmModal from '../components/ConfirmModal'
import {
  ACTIVITY_OPTIONS,
  allergyLabels,
  BREED_SIZE_OPTIONS,
  ENVIRONMENT_OPTIONS,
  findLabel,
  findShortLabel,
  SPECIES_OPTIONS,
  HEALTH_CONDITION_OPTIONS,
  getLifeStageOptions,
} from '../data/petFormOptions'
import { formatAge } from '../lib/petAge'

// the main pets page - shows the saved pets as a sidebar of tabs (a row of
// chips on phones) and the recommendations for the selected pet.
// nobody has to sign in: profiles are kept in this browser, and a visitor's
// pets move into the account the first time they sign in on this device.
// users can add unlimited pets (for owners with multiple pets),
// edit an existing pet's profile, or delete one
function Pets() {
  const {
    pets,
    activePetId,
    setActivePetId,
    addPet,
    updatePet,
    removePet,
    getActivePet,
    hydrated,
    isAuthenticated,
    localOnly,
    loadError,
    retryLoad,
  } = usePets()
  const { openLogin } = useShop()
  const [mode, setMode] = useState('view')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [busy, setBusy] = useState(false)
  const activePet = getActivePet()

  async function handleAdd(petData) {
    setSaveError('')
    setBusy(true)
    try {
      await addPet(petData)
      setMode('view')
    } catch (err) {
      setSaveError(err?.message || 'Could not save this pet. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdate(petData) {
    if (!activePetId) return
    setSaveError('')
    setBusy(true)
    try {
      await updatePet(activePetId, petData)
      setMode('view')
    } catch (err) {
      setSaveError(err?.message || 'Could not update this pet. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function handleDelete() {
    if (!activePetId) return
    setConfirmDelete(true)
  }

  async function confirmDeletePet() {
    if (!activePetId) return
    setConfirmDelete(false)
    try {
      await removePet(activePetId)
      setMode('view')
    } catch (err) {
      setSaveError(err?.message || 'Could not remove this pet. Please try again.')
    }
  }

  // reading the stored profile, not the form: older pets may only have a stage.
  // This is also where raw codes turn into labels - a pet saved before an option
  // was renamed ("wheat") must never print the code, and an unknown value is
  // shown as words rather than as stored
  const avoided = allergyLabels(activePet?.allergies)
  const hasCondition = Boolean(activePet?.healthCondition) && activePet.healthCondition !== 'healthy'
  const ageText = activePet?.birthDate ? formatAge(activePet.birthDate) : null
  const weightText =
    activePet?.weight != null && activePet.weight !== '' ? `${activePet.weight} kg` : null
  const neuteredText =
    activePet?.neutered === 'yes'
      ? 'Neutered / spayed'
      : activePet?.neutered === 'no'
        ? 'Not neutered'
        : null

  // only the daily-life answers the owner actually chose are printed; the
  // neutral ones would just repeat themselves on every pet's line, and the
  // questions only exist for dogs and cats
  const isMammal = activePet?.species === 'dog' || activePet?.species === 'cat'
  const activityText =
    isMammal && activePet?.activity && activePet.activity !== 'normal'
      ? findShortLabel(ACTIVITY_OPTIONS, activePet.activity)
      : null
  const environmentText =
    activePet?.species === 'cat' && activePet.environment && activePet.environment !== 'both'
      ? findShortLabel(ENVIRONMENT_OPTIONS, activePet.environment)
      : null
  const breedSizeText =
    activePet?.species === 'dog' && activePet.breedSize && activePet.breedSize !== 'unknown'
      ? findShortLabel(BREED_SIZE_OPTIONS, activePet.breedSize)
      : null

  const facts = activePet
    ? [
        findLabel(SPECIES_OPTIONS, activePet.species),
        findShortLabel(getLifeStageOptions(activePet.species), activePet.lifeStage),
        ageText ? `${ageText} old` : null,
        weightText,
        neuteredText,
        activityText,
        breedSizeText,
        environmentText,
      ].filter(Boolean)
    : []

  return (
    <div className="lg:mx-auto lg:max-w-7xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight dark:text-white">
          My Pets &amp; Food Recommendations
        </h1>
        <p className="mt-1.5 text-gray-500 text-sm sm:text-base dark:text-gray-400">
          Add each of your pets below. We&apos;ll recommend food products that match their species,
          life stage, and health conditions.
        </p>
      </header>

      {!isAuthenticated && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          <p>
            <strong>No sign-in needed.</strong> Your pets are saved in this browser only. Sign in to
            save them to your account so they follow you to another device.
          </p>
          <button
            type="button"
            onClick={openLogin}
            className="mt-2.5 rounded-lg bg-[#0b2e59] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0d3a6e] dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      )}

      {isAuthenticated && localOnly && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <p>
            <strong>Saved in this browser for now.</strong> The site is waiting on a server update,
            so these profiles are not on your account yet. They will stay safe on this device.
          </p>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          <p>{loadError}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-2.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {!hydrated ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]" aria-hidden="true">
          <div className="h-24 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[#1a2236] lg:h-64">
            <div className="m-4 h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mx-4 mt-3 h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-64 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[#1a2236]">
            <div className="m-5 h-5 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mx-5 mt-4 h-3 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[#1a2236]">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Your Pets</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {loadError ? '—' : pets.length}
                </span>
              </div>

              {loadError ? (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Your pets could not be loaded.
                </div>
              ) : pets.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  No pets yet. Click &quot;Add a Pet&quot; to start.
                </div>
              ) : (
                <ul className="flex gap-2 overflow-x-auto px-3 py-3 lg:block lg:divide-y lg:divide-gray-100 lg:overflow-visible lg:px-0 lg:py-0 lg:dark:divide-gray-700">
                  {pets.map((pet) => {
                    const isActive = pet.id === activePetId
                    const condition =
                      pet.healthCondition && pet.healthCondition !== 'healthy'
                        ? findLabel(HEALTH_CONDITION_OPTIONS, pet.healthCondition)
                        : null
                    return (
                      <li key={pet.id} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => { setActivePetId(pet.id); setMode('view') }}
                          aria-current={isActive ? 'true' : undefined}
                          className={`block w-full rounded-xl px-3.5 py-2.5 text-left transition-colors lg:rounded-none lg:border-l-4 lg:px-4 lg:py-3 ${
                            isActive
                              ? 'bg-[#0b2e59] text-white lg:border-[#0b2e59] lg:bg-[#0b2e59]/5 lg:text-gray-900 lg:dark:border-blue-400 lg:dark:bg-blue-500/10 lg:dark:text-white'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 lg:border-transparent lg:bg-transparent lg:hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 lg:dark:bg-transparent lg:dark:hover:bg-gray-800/60'
                          }`}
                        >
                          <div
                            className={`truncate text-sm font-medium ${
                              isActive
                                ? 'text-white lg:text-gray-900 lg:dark:text-white'
                                : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {pet.name}
                          </div>
                          <div
                            className={`mt-0.5 truncate text-xs ${
                              isActive
                                ? 'text-white/70 lg:text-gray-500 lg:dark:text-gray-400'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {findLabel(SPECIES_OPTIONS, pet.species)} &middot;{' '}
                            {findShortLabel(getLifeStageOptions(pet.species), pet.lifeStage)}
                          </div>
                          {condition && (
                            <span className="mt-1.5 hidden rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 lg:inline-block dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              {condition}
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
              onClick={() => setMode('add')}
              className="w-full rounded-lg bg-[#dbb727] px-4 py-2.5 font-semibold text-[#0b2e59] transition-colors hover:bg-[#c9a820] dark:bg-[#c9a820] dark:text-white dark:hover:bg-[#b8991d]"
            >
              + Add a Pet
            </button>
            <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
              {isAuthenticated && !localOnly
                ? 'Pets saved to your account follow you to any device.'
                : 'Pets are saved in this browser only.'}
            </p>
          </aside>

          <section className="min-w-0 space-y-4">
            {saveError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
              >
                {saveError}
              </div>
            )}

            {mode === 'add' && (
              <>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-5 dark:border-gray-700 dark:bg-[#1a2236]">
                  <h2 className="font-semibold text-gray-900 dark:text-white">Add a new pet</h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Dropdowns keep the profile consistent, and the date of birth sets the life
                    stage for you.
                  </p>
                </div>
                <PetProfileForm
                  onSubmit={handleAdd}
                  onCancel={pets.length > 0 ? () => setMode('view') : undefined}
                  submitLabel={busy ? 'Saving...' : 'Save Pet'}
                />
              </>
            )}

            {mode === 'edit' && activePet && (
              <>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-5 dark:border-gray-700 dark:bg-[#1a2236]">
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    Edit {activePet.name}&apos;s profile
                  </h2>
                </div>
                <PetProfileForm
                  initialPet={activePet}
                  onSubmit={handleUpdate}
                  onCancel={() => setMode('view')}
                  submitLabel={busy ? 'Saving...' : 'Update Pet'}
                />
              </>
            )}

            {mode === 'view' && !loadError && pets.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-gray-700 dark:bg-[#1a2236]">
                <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Welcome!</h2>
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                  Add your first pet to see food that suits them. No account needed &mdash; profiles
                  stay in this browser.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('add')}
                  className="rounded-lg bg-[#0b2e59] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0d3a6e] dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  Add My First Pet
                </button>
              </div>
            )}

            {mode === 'view' && activePet && (
              <>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-700 dark:bg-[#1a2236]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                          {activePet.name}
                        </h2>
                        {hasCondition && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            {findLabel(HEALTH_CONDITION_OPTIONS, activePet.healthCondition)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {facts.join(' · ')}
                      </p>
                      {avoided.length > 0 && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-600 dark:text-gray-300">
                            Avoiding:
                          </span>{' '}
                          {avoided.join(', ')}
                        </p>
                      )}
                      {!activePet.birthDate && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Add a date of birth and the life stage updates itself as your pet ages.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setMode('edit')}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
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
      )}

      <ConfirmModal
        isOpen={confirmDelete}
        title={`Remove ${activePet?.name}?`}
        message="This pet profile and its food recommendations will be removed from this browser. This cannot be undone."
        confirmLabel="Remove"
        danger
        onConfirm={confirmDeletePet}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

export default Pets
