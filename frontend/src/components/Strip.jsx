import React from 'react'

// promo strip above the navbar
// text animation is clipped to the same inner container as the navbar
// left and right edge masks act as invisible walls at the container boundaries
function Strip() {
  const message = 'Pay via GCash / PayMaya / Debit'

  return (
    <div className="bg-[#FF7C3A]/80">
      <div className="mx-auto max-w-7xl px-4 -py-2">
        <div className="relative overflow-hidden sm:h-7">
          <div className="absolute inset-y-0 left-0 flex w-max items-center text-xs text-white animate-slide sm:text-sm md:text-base">
            <span className="pr-8">{message}</span>
            <span className="pr-8">{message}</span>
            <span className="pr-8">{message}</span>
            <span className="pr-8">{message}</span>
			      <span className="pr-8">{message}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Strip
