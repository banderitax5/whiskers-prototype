import React, { useRef, useEffect, useState, useCallback } from 'react'
import { BsChevronLeft, BsChevronRight } from 'react-icons/bs'

const BRANDS = [
  { id: 1, name: 'Royal Canin', image: '/brands/royal.png' },
  { id: 2, name: 'Pedigree', image: '/brands/aozi.png' },
  { id: 3, name: 'Whiskas', image: '/brands/topbreed.png' },
  { id: 4, name: 'Purina', image: '/brands/vitality.png' },
]

function Banner() {
  const scrollRef = useRef(null)
  const [centerIndex, setCenterIndex] = useState(0)
  const [scrolling, setScrolling] = useState(false)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const autoPlayRef = useRef(null)

  const scroll = useCallback((direction) => {
    if (!scrollRef.current || scrolling) return
    setScrolling(true)
    const container = scrollRef.current
    const slides = Array.from(container.querySelectorAll('.brand-slide'))
    
    let targetIndex
    if (direction === 'left') {
      targetIndex = centerIndex === 0 ? slides.length - 1 : centerIndex - 1
    } else {
      targetIndex = centerIndex === slides.length - 1 ? 0 : centerIndex + 1
    }
    
    const slide = slides[targetIndex]
    if (slide) {
      const targetLeft = Math.max(
        0,
        slide.offsetLeft - (container.clientWidth - slide.clientWidth) / 2
      )
      container.scrollTo({ left: targetLeft, behavior: 'smooth' })
    }
    setTimeout(() => setScrolling(false), 400)
  }, [scrolling, centerIndex])

  // Auto-play functionality (loops back to start)
  useEffect(() => {
    let intervalId;
    if (isAutoPlaying) {
      intervalId = setInterval(() => {
        if (centerIndex >= BRANDS.length - 1) {
          // Loop back to first slide
          const container = scrollRef.current
          if (container) {
            const firstSlide = container.querySelector('.brand-slide')
            if (firstSlide) {
              container.scrollTo({ left: 0, behavior: 'smooth' })
            }
          }
        } else {
          scroll('right')
        }
      }, 1000)
    }
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [isAutoPlaying, scroll, centerIndex])

  // Compute centered slide based on scroll position for smoother activation
  const handleScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    const containerCenter = container.scrollLeft + container.clientWidth / 2
    const slides = Array.from(container.querySelectorAll('.brand-slide'))

    let closestIndex = 0
    let minDistance = Number.POSITIVE_INFINITY

    slides.forEach((slide, index) => {
      const slideCenter = slide.offsetLeft + slide.clientWidth / 2
      const distance = Math.abs(slideCenter - containerCenter)
      if (distance < minDistance) {
        minDistance = distance
        closestIndex = index
      }
    })

    setCenterIndex(closestIndex)
  }, [])

  // Initialize once on mount
  useEffect(() => {
    handleScroll()
  }, [handleScroll])

  // For manual controls, allow looping but disable arrows at actual scroll bounds
  const atStart = centerIndex === 0
  const atEnd = centerIndex === BRANDS.length - 1

  return (
		<div 
			className="relative py-1 bg-gradient-to-b from-[#0b2e59]/10 to-transparent overflow-hidden"
			onMouseEnter={() => setIsAutoPlaying(false)}
			onMouseLeave={() => setIsAutoPlaying(true)}
		>
			<div className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-10">
				<button
					onClick={() => {
						setIsAutoPlaying(false)
						scroll('left')
					}}
					disabled={scrolling}
					className="p-2 sm:p-3 rounded-full bg-black/20 hover:bg-black/30 transition-colors backdrop-blur-sm disabled:opacity-50"
					aria-label="Scroll left"
				>
					<BsChevronLeft className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
				</button>
			</div>
			
			<div 
				ref={scrollRef}
				className="flex overflow-x-auto gap-4 sm:gap-8 lg:gap-12 px-4 sm:px-8 lg:px-16 items-center min-h-[240px] sm:min-h-[360px] lg:min-h-[500px] no-scrollbar select-none"
				style={{ 
					scrollSnapType: 'x mandatory',
					WebkitOverflowScrolling: 'touch',
					scrollbarWidth: 'none',
					msOverflowStyle: 'none'
				}}
				onScroll={handleScroll}
			>
				{BRANDS.map((brand, index) => (
					<div
						key={brand.id}
						data-index={index}
						className={`brand-slide flex-none w-[85vw] sm:w-[600px] lg:w-[1000px] h-[180px] sm:h-[300px] lg:h-[450px] rounded-lg overflow-hidden
							flex items-center justify-center transition-all duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] transform-gpu
							${centerIndex === index 
								? 'scale-100 opacity-100' 
								: 'scale-[0.98] sm:scale-[0.96] lg:scale-[0.95] opacity-80 lg:opacity-70'}`}
						style={{ scrollSnapAlign: 'center' }}
					>
						<img
							src={brand.image}
							alt={brand.name}
							className="w-full h-full object-cover"
						/>
					</div>
				))}
			</div>

			<div className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-10">
				<button
					onClick={() => {
						setIsAutoPlaying(false)
						scroll('right')
					}}
					disabled={scrolling}
					className="p-2 sm:p-3 rounded-full bg-black/20 hover:bg-black/30 transition-colors backdrop-blur-sm disabled:opacity-50"
					aria-label="Scroll right"
				>
					<BsChevronRight className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
				</button>
			</div>
		</div>
  )
}

export default Banner