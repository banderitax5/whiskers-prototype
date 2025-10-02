/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Custom animations and utilities
      keyframes: {
        slide: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' }
        },
        fadeInOut: {
          '0%, 100%': { opacity: '0.9' },
          '75%': { opacity: '1' }
        }
      },
      animation: {
        'slide': 'slide 15s linear infinite',
        'pulse-slow': 'fadeInOut 2.5s ease-in-out infinite'
      }
    },
  },
  plugins: [
    function({ addUtilities }) {
      const newUtils = {
        '.no-scrollbar': {
          /* Hide scrollbar for all browsers */
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
        },
        '.no-scrollbar::-webkit-scrollbar': {
          display: 'none',
          width: '0',
          height: '0'
        },
      }
      addUtilities(newUtils)
    }
  ],
}
