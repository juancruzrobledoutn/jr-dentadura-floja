import { validateImageUrl } from '../utils/validation'

interface PromoBannerProps {
  title?: string
  discount?: string
  buttonText?: string
  backgroundImage?: string
  onButtonClick?: () => void
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=400&fit=crop'

export default function PromoBanner({
  title = 'Happy Hour!',
  discount = '50% OFF',
  buttonText = 'View promos',
  backgroundImage = DEFAULT_IMAGE,
  onButtonClick
}: PromoBannerProps) {
  // Sanitize image URL to prevent XSS
  const validUrl = validateImageUrl(backgroundImage).isValid ? backgroundImage : DEFAULT_IMAGE

  return (
    <div className="px-4 sm:px-6 md:px-8 lg:px-12 mb-6">
      <div className="max-w-7xl mx-auto">
        <div className="relative h-40 sm:h-48 md:h-56 lg:h-64 rounded-2xl overflow-hidden">
          {/* LCP Optimization: Use <img> with fetchpriority="high" instead of CSS background-image */}
          <img
            src={validUrl}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="sync"
            width={800}
            height={400}
            className="absolute inset-0 w-full h-full object-cover object-right"
          />

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />

          {/* Content */}
          <div className="relative h-full flex flex-col justify-center px-5 sm:px-8 md:px-10">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1">{title}</h2>
            <p className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white mb-3 sm:mb-4">{discount}</p>

            <button
              onClick={onButtonClick}
              className="self-start bg-dark-button text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-medium hover:bg-dark-button-hover transition-colors"
              aria-label={buttonText}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
