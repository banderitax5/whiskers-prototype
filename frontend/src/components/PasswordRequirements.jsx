import { PASSWORD_RULES } from '../lib/passwordRules'

// Live checklist so shoppers can see exactly which requirement is missing.
export default function PasswordRequirements({ value, id }) {
  return (
    <ul id={id} className="mt-1 grid gap-0.5 text-xs" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(String(value || ''))
        return (
          <li
            key={rule.id}
            className={met ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}
          >
            <span aria-hidden="true" className="inline-block w-4">{met ? '✓' : '•'}</span>
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}
