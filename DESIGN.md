# DESIGN.md — Whiskers

Style direction for all UI work in this repo. The established app language below is the source of truth; the antislop filter is applied on top of it.

## Identity

Whiskers is a pet-shop and adoption prototype (React + Vite + Tailwind, Express backend). Screens are utility-first: forms, lists, dashboards. Tone is plain and friendly, not marketing-heavy.

## Palette

- Brand blue `#0039a6`, hover `#0046cc`: primary buttons and text links. This is the only accent.
- Neutrals: Tailwind gray scale. Light cards `bg-white`, dark mode `bg-gray-800` (`darkMode: 'class'`).
- Error: light mode `bg-red-50` / `text-red-700` for banners, `text-red-600` for field errors; dark mode chips `dark:bg-red-900` / `dark:text-red-200`, naked field errors `dark:text-red-400`.
- Success: light `bg-green-50` / `text-green-700`; dark `dark:bg-green-900` / `dark:text-green-200`.
- Contrast floor: WCAG AA (4.5:1 normal text) in both themes.

## Typography

- Tailwind default sans stack (system fonts); no custom webfont.
- Field labels: uppercase, `text-xs sm:text-sm font-medium`. Body copy: `text-sm`. Card headings: `text-xl font-bold`.

## Shape and elevation

- Inputs, buttons, small chips: `rounded-lg`. Cards and modals: `rounded-2xl`.
- Elevation: `shadow-xl` only on primary cards and modals (they lift off the page). Everything else sits flat.

## Motion

- Hover/active transitions 150-200ms; `active:scale-[0.98]` press feedback on primary buttons.
- `animate-pulse` only on "still checking" states; no decorative loops.
- Modal open: short fade.

## Dials

ENERGY 1 / RHYTHM 1 / MOTION 1 — calm utility screens, uniform composition, hover states only.

## Interaction floor

44px minimum button height, keyboard-reachable controls (including password-eye toggles), Escape closes dialogs, visible focus rings (`focus:ring-2`), and every display state (empty, loading, error) implemented.
