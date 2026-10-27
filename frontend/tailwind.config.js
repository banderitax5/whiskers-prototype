import daisyui from 'daisyui'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Touch screens keep a tapped element in the :hover state until the next tap,
  // so a card that scales on hover appeared to "stick" while a shopper tried to
  // swipe the grid - the tap looked swallowed and the layout jumped. This wraps
  // every `hover:` utility (and `group-hover:`, which Tailwind builds from the
  // same pseudo-variant) in `@media (hover: hover) and (pointer: fine)`, so the
  // effect only exists for a real pointer. `active:` is untouched, so press
  // feedback on buttons still works on phones.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: 
  {
    extend: 
    {
      keyframes: 
      {
        slide: 
        {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' }
        },
        fadeInOut: 
        {
          '0%, 100%': { opacity: '0.9' },
          '75%': { opacity: '1' }
        }
      },
      animation: 
      {
        'slide': 'slide 10s linear infinite',
        'pulse-slow': 'fadeInOut 2.5s ease-in-out infinite'
      }
    },
  },
  plugins: 
  [
    daisyui,
    function({ addUtilities }) 
    {
      const newUtils = 
      {
        '.no-scrollbar': 
        {
          /* Hide scrollbar for all browsers */
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
        },
        '.no-scrollbar::-webkit-scrollbar': 
        {
          display: 'none',
          width: '0',
          height: '0'
        },
      }
      addUtilities(newUtils)
    }
  ],
  daisyui: 
  {
    themes: ['light', 'dark', 'cupcake'],
  },
}
