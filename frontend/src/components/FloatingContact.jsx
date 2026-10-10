import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BsChatDotsFill, BsX, BsInstagram, BsFacebook, BsTelephone, BsEnvelope } from 'react-icons/bs'

export default function FloatingContact() {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9997]">
      {open && (
        <div className="mb-3 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 w-56 sm:w-64 border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Contact Us</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
              <BsX className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            <Link
              to="/support"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-[#0b2e59] dark:hover:text-yellow-300 transition p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <BsEnvelope className="h-4 w-4 text-yellow-600" />
              Message Support
            </Link>
            <a
              href="https://www.facebook.com/profile.php?id=61561539844519"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-[#0b2e59] dark:hover:text-yellow-300 transition p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <BsFacebook className="h-4 w-4 text-blue-600" />
              Facebook
            </a>
            <a
              href="https://www.instagram.com/petcareswhiskers"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-[#0b2e59] dark:hover:text-yellow-300 transition p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <BsInstagram className="h-4 w-4 text-pink-500" />
              Instagram
            </a>
            <a
              href="tel:+639123456789"
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-[#0b2e59] dark:hover:text-yellow-300 transition p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <BsTelephone className="h-4 w-4 text-green-500" />
              +63 912 345 6789
            </a>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-yellow-400 text-[#0b2e59] shadow-lg flex items-center justify-center hover:bg-yellow-500 transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-yellow-300"
        aria-label="Contact us"
      >
        {open ? <BsX className="h-5 w-5 sm:h-6 sm:w-6" /> : <BsChatDotsFill className="h-5 w-5 sm:h-6 sm:w-6" />}
      </button>
    </div>
  )
}
