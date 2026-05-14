import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getSafeImageUrl, FALLBACK_IMAGES } from '../utils/validation'
import type { Product } from '../types'

interface FeaturedCarouselProps {
  products: Product[]
  onProductClick?: (product: Product) => void
}

// Constant for carousel padding (px-4 = 16px)
const CAROUSEL_PADDING = 16
// Delay to consider scroll complete
const SCROLL_ANIMATION_DELAY_MS = 300

export default function FeaturedCarousel({ products, onProductClick }: FeaturedCarouselProps) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = null
      }
    }
  }, [])

  // Memoize click handler factory to avoid creating new functions on each render
  const handleProductClick = useCallback((product: Product) => {
    onProductClick?.(product)
  }, [onProductClick])

  // Handle image load error
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = FALLBACK_IMAGES.product
  }, [])

  // Memoize keydown handler factory
  const createKeyDownHandler = useCallback((product: Product) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onProductClick?.(product)
    }
  }, [onProductClick])

  // scrollTo with correct dependency on products.length
  const scrollTo = useCallback((index: number) => {
    const container = carouselRef.current
    if (!container || products.length === 0) return

    const items = container.children
    const item = items[index]

    // Validate that element exists and is an HTMLElement
    if (!item || !(item instanceof HTMLElement)) return

    isScrollingRef.current = true
    container.scrollTo({
      left: item.offsetLeft - CAROUSEL_PADDING,
      behavior: 'smooth'
    })
    setCurrentIndex(index)

    // Clear previous timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    // Allow scroll update after animation
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false
    }, SCROLL_ANIMATION_DELAY_MS)
  }, [products.length])

  const handleScroll = useCallback(() => {
    const container = carouselRef.current
    // Avoid race condition during programmatic scroll
    if (!container || isScrollingRef.current) return

    const scrollLeft = container.scrollLeft
    // Filter only valid HTMLElement elements
    const items = Array.from(container.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    )

    if (items.length === 0) return

    let closestIndex = 0
    let closestDistance = Infinity

    items.forEach((item, index) => {
      const distance = Math.abs(item.offsetLeft - CAROUSEL_PADDING - scrollLeft)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    setCurrentIndex(closestIndex)
  }, [])

  // MEMORY LEAK FIX: Register scroll listener via useEffect for guaranteed cleanup
  useEffect(() => {
    const container = carouselRef.current
    if (!container) return

    // Use passive listener for better scroll performance
    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  // Early return AFTER all hooks
  if (products.length === 0) {
    return null
  }

  return (
    <section id="featured-products" className="mb-6">
      <div className="px-4 sm:px-6 md:px-8 lg:px-12 mb-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h2 className="text-lg sm:text-xl md:text-2xl font-semibold">{t('home.recommended')}</h2>
          <div className="flex gap-2">
            <button
              onClick={() => scrollTo(Math.max(0, currentIndex - 1))}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-dark-card border border-dark-border flex items-center justify-center hover:border-primary transition-colors disabled:opacity-50"
              disabled={currentIndex === 0}
              aria-label={t('home.previous')}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scrollTo(Math.min(products.length - 1, currentIndex + 1))}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-dark-card border border-dark-border flex items-center justify-center hover:border-primary transition-colors disabled:opacity-50"
              disabled={currentIndex >= products.length - 1}
              aria-label={t('home.next')}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={carouselRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto scroll-smooth px-4 sm:px-6 md:px-8 lg:px-12 pb-2 snap-x snap-mandatory scrollbar-hide"
        role="region"
        aria-label={t('accessibility.featuredProducts')}
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="flex-shrink-0 w-[75%] sm:w-[60%] md:w-[45%] lg:w-[30%] xl:w-[25%] snap-start"
          >
            <div
              onClick={() => handleProductClick(product)}
              className="relative bg-dark-card rounded-2xl overflow-hidden border border-dark-border cursor-pointer hover:border-white transition-colors"
              role="button"
              tabIndex={0}
              onKeyDown={createKeyDownHandler(product)}
            >
              {/* Image - with lazy loading and fixed dimensions to avoid CLS */}
              <div className="relative h-36 sm:h-40 md:h-44 lg:h-48 bg-dark-elevated">
                <img
                  src={getSafeImageUrl(product.image, 'product')}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                  width={400}
                  height={400}
                  className="w-full h-full object-cover"
                  onError={handleImageError}
                />
              </div>

              {/* Content - only name and description */}
              <div className="p-3 sm:p-4">
                <h3 className="font-semibold text-white mb-1 text-sm sm:text-base">{product.name}</h3>
                <p className="text-xs sm:text-sm text-dark-muted line-clamp-2">
                  {product.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dots indicator - hidden on larger screens */}
      <div className="flex justify-center gap-1.5 mt-3 md:hidden" role="tablist" aria-label={t('accessibility.positionIndicator')}>
        {products.map((product, index) => (
          <button
            key={product.id}
            onClick={() => scrollTo(index)}
            className={`h-1.5 rounded-full transition-all ${
              index === currentIndex
                ? 'w-6 bg-white'
                : 'w-1.5 bg-dark-border hover:bg-dark-muted'
            }`}
            role="tab"
            aria-selected={index === currentIndex}
            aria-label={`Go to ${product.name}`}
          />
        ))}
      </div>
    </section>
  )
}
