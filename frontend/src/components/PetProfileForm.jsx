import { useState, useEffect, useMemo } from 'react'
import {
  SPECIES_OPTIONS,
  HEALTH_CONDITION_OPTIONS,
  ALLERGY_OPTIONS,
  getLifeStageOptions,
} from '../data/petFormOptions'

// the pet profile form - all inputs are dropdowns or checkboxes so users
// cannot type free text into fields the recommendation engine needs to parse
// life stage dropdown options cascade from the selected species
// used in both "add pet" and "edit pet" modes based on the initialPet prop
function PetProfileForm({ initialPet, onSubmit, onCancel, submitLabel = 'Save Pet' }) {
  const [name, setName] = useState(initialPet?.name || '')
  const [species, setSpecies] = useState(initialPet?.species || '')
  const [lifeStage, setLifeStage] = useState(initialPet?.lifeStage || '')
  const [healthCondition, setHealthCondition] = useState(initialPet?.healthCondition || '')
  const [allergies, setAllergies] = useState(initialPet?.allergies || [])
  const [formError, setFormError] = useState('')

  const lifeStageOptions = useMemo(() => getLifeStageOptions(species), [species])

  // whenever species changes, reset lifeStage because the valid options shifted
  // (a dog is "puppy / adult / senior" but a fish is "juvenile / adult")
  useEffect(() => {
    if (species && !lifeStageOptions.some((opt) => opt.value === lifeStage)) {
      setLifeStage('')
    }
  }, [species, lifeStage, lifeStageOptions])

  function toggleAllergy(value) {
    setAllergies((prev) => {
      if (value === 'none') {
        return prev.includes('none') ? [] : ['none']
      }
      const withoutNone = prev.filter((a) => a !== 'none')
      if (withoutNone.includes(value)) {
        return withoutNone.filter((a) => a !== value)
      }
      return [...withoutNone, value]
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!name.trim()) { setFormError('Please enter your pet\'s name.'); return }
    if (!species) { setFormError('Please choose a species.'); return }
    if (!lifeStage) { setFormError('Please choose a life stage.'); return }
    if (!healthCondition) { setFormError('Please choose a health condition (choose "Healthy" if none).'); return }

    onSubmit({
      name: name.trim(),
      species,
      lifeStage,
      healthCondition,
      allergies: allergies.length === 0 ? ['none'] : allergies,
    })
  }

  const inputClass = 'w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:border-[#0b2e59] focus:ring-1 focus:ring-[#0b2e59] transition-colors outline-none'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5'
  const selectClass = `${inputClass} appearance-none bg-white cursor-pointer`

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-5">
      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm" role="alert">
          {formError}
        </div>
      )}

      <div>
        <label htmlFor="petName" className={labelClass}>Pet Name</label>
        <input
          id="petName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Buddy, Mittens, Rex"
          className={inputClass}
          maxLength={40}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="petSpecies" className={labelClass}>Species</label>
          <select
            id="petSpecies"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            className={selectClass}
          >
            <option value="">-- Select species --</option>
            {SPECIES_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="petLifeStage" className={labelClass}>Life Stage</label>
          <select
            id="petLifeStage"
            value={lifeStage}
            onChange={(e) => setLifeStage(e.target.value)}
            disabled={!species}
            className={`${selectClass} disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`}
          >
            <option value="">
              {species ? '-- Select life stage --' : 'Choose species first'}
            </option>
            {lifeStageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="petHealth" className={labelClass}>Health Condition</label>
        <select
          id="petHealth"
          value={healthCondition}
          onChange={(e) => setHealthCondition(e.target.value)}
          className={selectClass}
        >
          <option value="">-- Select health condition --</option>
          {HEALTH_CONDITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-gray-500">
          Based on veterinary assessment or prescription. Choose &quot;Healthy&quot; if your pet has no known conditions.
        </p>
      </div>

      <div>
        <p className={labelClass}>Known Allergies / Ingredients to Avoid</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALLERGY_OPTIONS.map((opt) => {
            const checked = allergies.includes(opt.value)
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  checked
                    ? 'border-[#0b2e59] bg-[#0b2e59]/5 text-[#0b2e59]'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAllergy(opt.value)}
                  className="w-4 h-4 accent-[#0b2e59]"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            )
          })}
        </div>
        <p className="mt-1.5 text-xs text-gray-500">Select all that apply. Choose &quot;None&quot; if unsure.</p>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-[#0b2e59] hover:bg-[#0d3a6e] text-white text-sm font-semibold transition-colors"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default PetProfileForm
