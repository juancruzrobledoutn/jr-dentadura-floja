import { memo } from 'react'

interface ErrorBannerProps {
  message: string
}

export const ErrorBanner = memo(function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
      <p className="text-red-400 text-sm text-center">{message}</p>
    </div>
  )
})
