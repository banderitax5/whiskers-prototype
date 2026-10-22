// Mirrors the Supabase project's password policy (error_code "weak_password"):
// at least 8 characters with one lowercase, one uppercase, one digit and one
// symbol. The server stays authoritative; this only gives shoppers actionable
// feedback before they submit.
const SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"

export const PASSWORD_HINT =
  'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'lower', label: 'One lowercase letter (a-z)', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'One uppercase letter (A-Z)', test: (v) => /[A-Z]/.test(v) },
  { id: 'number', label: 'One number (0-9)', test: (v) => /[0-9]/.test(v) },
  { id: 'symbol', label: 'One symbol (! @ # $ %)', test: (v) => [...v].some((c) => SYMBOLS.includes(c)) },
]

export function passwordProblems(value) {
  const password = String(value || '')
  return PASSWORD_RULES.filter((rule) => !rule.test(password))
}

export function passwordError(value) {
  return passwordProblems(value).length === 0 ? '' : PASSWORD_HINT
}
