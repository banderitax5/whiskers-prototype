import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BsChevronDown } from 'react-icons/bs'

const FAQ_ITEMS = [
  {
    q: 'What is Whiskers?',
    a: 'Whiskers is a pet e-commerce platform dedicated to providing quality pet food and supplies for dogs, cats, birds, fish, and small pets.',
  },
  {
    q: 'How do I place an order?',
    a: 'Simply browse our menu, add items to your cart, and proceed to checkout. You can pay via GCash, PayMaya, or cash on delivery (COD).',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept GCash, PayMaya, and cash on delivery (COD). Online payments are securely processed.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Standard delivery within Metro Manila takes 2-5 business days. Provincial deliveries may take 5-7 business days.',
  },
  {
    q: 'Can I return or exchange items?',
    a: 'Yes! You can request a return or exchange within 7 days of delivery for unopened and unused items. Contact our support team to get started.',
  },
  {
    q: 'How do I track my order?',
    a: 'Go to your Orders page after logging in. Each order shows its current status from Pending to Delivered.',
  },
  {
    q: 'Do you have a physical store?',
    a: 'Currently we operate online only, but we are planning to open a physical storefront in the future. Follow us on social media for updates!',
  },
]

function FaqItem({ item }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 pr-4">{item.q}</span>
        <BsChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {item.a}
        </div>
      )}
    </div>
  )
}

function About() {
  return (
    <div className="space-y-8 lg:mx-auto lg:max-w-7xl">
      <div className="space-y-3">
        <h1 className="text-xl sm:text-2xl font-bold">About Whiskers</h1>
        <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
          Whiskers is a pet e-commerce platform built to connect pet owners with the best products for their furry,
          feathered, and finned friends. We are a team of 4 students from FEU Roosevelt, Marikina, Philippines,
          working on this capstone project to make pet care more accessible.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold">Our Mission</h2>
        <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
          To provide a seamless online shopping experience for pet owners, offering a wide selection of quality
          pet products at competitive prices, backed by reliable customer support.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg sm:text-xl font-bold">Frequently Asked Questions</h2>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, idx) => (
            <FaqItem key={idx} item={item} />
          ))}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Still have questions?{' '}
          <Link to="/support" className="font-semibold text-[#0b2e59] dark:text-yellow-300 hover:underline">
            Contact our support team
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

export default About
