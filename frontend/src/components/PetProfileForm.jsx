import { useState, useEffect, useMemo } from 'react'
import {
  ACTIVITY_OPTIONS,
  ALLERGY_OPTIONS,
  BREED_SIZE_OPTIONS,
  canonicalAllergy,
  DEFAULT_ACTIVITY,
  DEFAULT_BREED_SIZE,
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_OPTIONS,
  findLabel,
  getLifeStageOptions,
  NEUTERED_OPTIONS,
  SPECIES_OPTIONS,
  HEALTH_CONDITION_OPTIONS,
} from '../data/petFormOptions'
import { computeLifeStage, parseDateInput, todayInputValue } from '../lib/petAge'

// Minimum / maximum weight in kilograms. The widest real range (a large dog) is
// about 90 kg, so 200 is only a guard against a mistyped number.
const MIN_WEIGHT_KG = 0.1
const MAX_WEIGHT_KG = 200

// dog and cat are the species where neutering is a real question
const MAMMALS = ['dog', 'cat']

// a saved profile may hold an old allergy name ("wheat"), so it is folded onto
// today's value when the form opens. That way the right box is ticked and saving
// writes the current value back.
function initialAllergies(pet) {
  const list = Array.isArray(pet?.allergies) ? pet.allergies : []
  const values = list.filter((a) => a).map((a) => canonicalAllergy(a))
  const unique = [...new Set(values)]
  return unique.length === 0 ? [] : unique
}

function PetProfileForm({ initialPet, onSubmit, onCancel, submitLabel = 'Save Pet' }) {
  const [name, setName] = useState(initialPet?.name || '')
  const [species, setSpecies] = useState(initialPet?.species || '')
  const [birthDate, setBirthDate] = useState(initialPet?.birthDate || '')
  // "manual" means the owner overrode the date-derived stage, and it is saved
  // with the profile so the override survives an edit later. A pet saved before
  // birth dates existed only has a stage, so that stage is also treated as manual.
  const [stageManual, setStageManual] = useState(() => {
    if (initialPet?.stageSource) return initialPet.stageSource === 'manual'
    return Boolean(initialPet?.lifeStage) && !initialPet?.birthDate
  })
  const [lifeStage, setLifeStage] = useState(initialPet?.lifeStage || '')
  const [weight, setWeight] = useState(
    initialPet?.weight != null ? String(initialPet.weight) : ''
  )
  const [neutered, setNeutered] = useState(initialPet?.neutered || 'unknown')
  const [activity, setActivity] = useState(initialPet?.activity || DEFAULT_ACTIVITY)
  const [environment, setEnvironment] = useState(initialPet?.environment || DEFAULT_ENVIRONMENT)
  const [breedSize, setBreedSize] = useState(initialPet?.breedSize || DEFAULT_BREED_SIZE)
  const [healthCondition, setHealthCondition] = useState(initialPet?.healthCondition || '')
  const [allergies, setAllergies] = useState(() => initialAllergies(initialPet))
  const [formError, setFormError] = useState('')

  const lifeStageOptions = useMemo(() => getLifeStageOptions(species), [species])
  // a value with no checkbox (an older or hand-edited profile) is kept, not
  // dropped: the owner can see it and remove it on purpose, and saving never
  // quietly stops avoiding something the pet was flagged for
  const unmatchedAllergies = allergies.filter(
    (value) => !ALLERGY_OPTIONS.some((opt) => opt.value === value)
  )
  // what the birth date says, or null when there is no usable date yet
  const computedStage = useMemo(
    () => (species && birthDate ? computeLifeStage(species, birthDate) : null),
    [species, birthDate]
  )
  const stageLocked = Boolean(computedStage) && !stageManual

  // fill the stage from the birth date unless the owner picked one by hand, and
  // never keep a stage that does not belong to the chosen species
  useEffect(() => {
    setLifeStage((prev) => {
      if (species && birthDate && !stageManual) {
        const auto = computeLifeStage(species, birthDate)
        if (auto) return auto
      }
      return lifeStageOptions.some((opt) => opt.value === prev) ? prev : ''
    })
  }, [species, birthDate, stageManual, lifeStageOptions])

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

    const birth = birthDate ? parseDateInput(birthDate) : null
    if (birthDate && !birth) { setFormError('Please enter a valid date of birth.'); return }
    if (birth && birth.getTime() > Date.now()) {
      setFormError('The date of birth cannot be in the future.'); return
    }

    if (!lifeStage) {
      setFormError(
        computedStage ? 'Please choose a life stage.' : 'Please add a date of birth, or choose a life stage.'
      )
      return
    }
    if (!healthCondition) {
      setFormError('Please choose a health condition (choose "Healthy" if none).')
      return
    }

    const weightNumber = weight.trim() === '' ? null : Number(weight)
    if (weight.trim() !== '' && (!Number.isFinite(weightNumber) || weightNumber < MIN_WEIGHT_KG || weightNumber > MAX_WEIGHT_KG)) {
      setFormError(`Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`)
      return
    }

    onSubmit({
      name: name.trim(),
      species,
      lifeStage,
      // remembers whether the stage came from the date or the owner picked it,
      // so reopening this pet does not lose the choice. Without a date the stage
      // can only have come from the owner.
      stageSource: stageManual || !birthDate ? 'manual' : 'birthDate',
      birthDate: birthDate || null,
      weight: weightNumber,
      neutered: MAMMALS.includes(species) ? neutered : null,
      // the daily-life questions only show for dogs and cats; other species
      // store the neutral answers so the engine treats them as unknown
      activity: MAMMALS.includes(species) ? activity : DEFAULT_ACTIVITY,
      environment: species === 'cat' ? environment : DEFAULT_ENVIRONMENT,
      breedSize: species === 'dog' ? breedSize : DEFAULT_BREED_SIZE,
      healthCondition,
      allergies: allergies.length === 0 ? ['none'] : allergies,
    })
  }

  const inputClass = 'w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:border-[#0b2e59] focus:ring-1 focus:ring-[#0b2e59] transition-colors outline-none dark:bg-[#1a2236] dark:border-gray-700 dark:text-white dark:focus:border-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5 dark:text-gray-200'
  const selectClass = `${inputClass} appearance-none cursor-pointer`
  const hintClass = 'mt-1.5 text-xs text-gray-500 dark:text-gray-400'
  const stageLabel = lifeStageOptions.find((opt) => opt.value === lifeStage)?.label

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 md:p-8 space-y-5 dark:bg-[#1a2236] dark:border-gray-700">
      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" role="alert">
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
            onChange={(e) => {
              setSpecies(e.target.value)
              // a stage picked for the old species rarely fits the new one, and
              // the date of birth is the better guide once the species is right
              if (birthDate) setStageManual(false)
            }}
            className={selectClass}
          >
            <option value="">-- Select species --</option>
            {SPECIES_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="petBirthDate" className={labelClass}>Date of birth</label>
          <input
            id="petBirthDate"
            type="date"
            value={birthDate}
            max={todayInputValue()}
            onChange={(e) => setBirthDate(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          />
          <p className={hintClass}>
            {species
              ? 'We work out the life stage for you, and it stays correct as your pet ages.'
              : 'Choose a species first.'}
          </p>
        </div>

        <div>
          <label htmlFor="petLifeStage" className={labelClass}>Life Stage</label>
          <select
            id="petLifeStage"
            value={lifeStage}
            onChange={(e) => setLifeStage(e.target.value)}
            disabled={!species || stageLocked}
            className={`${selectClass} disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed dark:disabled:bg-gray-800 dark:disabled:text-gray-500`}
          >
            <option value="">
              {!species ? 'Choose species first' : stageLocked ? 'Set from date of birth' : '-- Select life stage --'}
            </option>
            {lifeStageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {computedStage && (
            <p className={hintClass}>
              {stageLocked ? (
                <>
                  Set from the date of birth: <span className="font-medium">{stageLabel}</span>.{' '}
                  <button
                    type="button"
                    onClick={() => setStageManual(true)}
                    className="font-semibold text-[#0b2e59] underline underline-offset-2 hover:text-[#0d3a6e] dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Choose it myself
                  </button>
                </>
              ) : (
                <>
                  Using your own choice.{' '}
                  <button
                    type="button"
                    onClick={() => setStageManual(false)}
                    className="font-semibold text-[#0b2e59] underline underline-offset-2 hover:text-[#0d3a6e] dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Use the date of birth
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="petWeight" className={labelClass}>Weight</label>
          <div className="relative">
            <input
              id="petWeight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={MIN_WEIGHT_KG}
              max={MAX_WEIGHT_KG}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 12.5"
              className={`${inputClass} pr-12`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500">
              kg
            </span>
          </div>
          <p className={hintClass}>Optional. We show it on your pet&apos;s card so you can ask your vet about the right portion.</p>
        </div>
      </div>

      {MAMMALS.includes(species) && (
        <div>
          <label htmlFor="petNeutered" className={labelClass}>Neutered / spayed</label>
          <select
            id="petNeutered"
            value={neutered}
            onChange={(e) => setNeutered(e.target.value)}
            className={selectClass}
          >
            {NEUTERED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className={hintClass}>Neutered pets usually need a little less food, so this helps your vet advise you.</p>
        </div>
      )}

      {MAMMALS.includes(species) && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/40">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Daily life</p>
          <p className={`${hintClass} mb-3`}>
            These answers only adjust which foods we suggest first. They are not medical advice.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="petActivity" className={labelClass}>Activity level</label>
              <select
                id="petActivity"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                className={selectClass}
              >
                {ACTIVITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className={hintClass}>Active pets are shown energy-rich formulas first; calmer pets are shown lighter ones.</p>
            </div>

            {species === 'dog' && (
              <div>
                <label htmlFor="petBreedSize" className={labelClass}>Breed size</label>
                <select
                  id="petBreedSize"
                  value={breedSize}
                  onChange={(e) => setBreedSize(e.target.value)}
                  className={selectClass}
                >
                  {BREED_SIZE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className={hintClass}>Helps us pick food shaped for your dog&apos;s jaw and size.</p>
              </div>
            )}

            {species === 'cat' && (
              <div>
                <label htmlFor="petEnvironment" className={labelClass}>Where your cat lives</label>
                <select
                  id="petEnvironment"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className={selectClass}
                >
                  {ENVIRONMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className={hintClass}>Indoor cats are shown indoor and hairball formulas first.</p>
              </div>
            )}
          </div>
        </div>
      )}

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
        <p className={hintClass}>
          Based on veterinary assessment or prescription. Choose &quot;Healthy&quot; if your pet has no known conditions.
        </p>
      </div>

      <div>
        <p className={labelClass}>Known Allergies / Ingredients to Avoid</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ALLERGY_OPTIONS.map((opt) => {
            const checked = allergies.includes(opt.value)
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  checked
                    ? 'border-[#0b2e59] bg-[#0b2e59]/5 text-[#0b2e59] dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-200'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:bg-[#0f172a] dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAllergy(opt.value)}
                  className="w-4 h-4 accent-[#0b2e59] dark:accent-blue-500"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            )
          })}
        </div>
        <p className={hintClass}>Select all that apply. Choose &quot;None&quot; if unsure.</p>
        {unmatchedAllergies.length > 0 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            <p className="font-medium">Saved from an older profile, not in the list above:</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {unmatchedAllergies.map((value) => (
                <li key={value}>
                  <button
                    type="button"
                    onClick={() => setAllergies((prev) => prev.filter((a) => a !== value))}
                    aria-label={`Remove ${findLabel(ALLERGY_OPTIONS, value)}`}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100 dark:border-amber-600 dark:bg-transparent dark:hover:bg-amber-900/40"
                  >
                    {findLabel(ALLERGY_OPTIONS, value)}
                    <span aria-hidden="true">&times;</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition-colors dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-[#0b2e59] hover:bg-[#0d3a6e] text-white text-sm font-semibold transition-colors dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

export default PetProfileForm
