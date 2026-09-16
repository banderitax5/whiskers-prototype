import { useState, useEffect } from 'react'
import { BsArrowUp } from 'react-icons/bs'

export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 400)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-20 right-4 sm:right-6 z-[9998] h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-[#0b2e59] text-white shadow-lg flex items-center justify-center hover:bg-[#15407a] transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-yellow-300"
      aria-label="Back to top"
    >
      <BsArrowUp className="h-4 w-4 sm:h-5 sm:w-5" />
    </button>
  )
}
