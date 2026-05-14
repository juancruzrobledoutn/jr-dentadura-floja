import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useHeaderData } from '../stores/tableStore'
import { useModal } from '../hooks/useModal'
import LanguageFlagSelector from './LanguageFlagSelector'
import HamburgerMenu from './HamburgerMenu'
import type { Diner } from '../types'

interface HeaderProps {
  onCartClick?: () => void
}

export default function Header({ onCartClick }: HeaderProps) {
  const { t } = useTranslation()
  const { session, currentDiner, cartCount, diners } = useHeaderData()
  const hamburgerMenu = useModal()

  return (
    <header className="bg-dark-bg px-4 pt-4 pb-2 sm:px-6 md:px-8 lg:px-12 safe-area-top">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo + Table info */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-white tracking-tight whitespace-nowrap">
            Sabor
          </h1>

          {session && (
            <div className="flex items-center gap-2 bg-dark-card px-3 py-1.5 rounded-full">
              <span className="text-dark-muted text-xs sm:text-sm">{t('header.table')}</span>
              <span className="text-white font-semibold text-sm sm:text-base">
                {session.table_number}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language selector flags - hidden on mobile, visible on larger screens */}
          <div className="hidden md:flex">
            <LanguageFlagSelector />
          </div>

          {/* Diners count */}
          {diners.length > 1 && <DinersAvatars diners={diners} />}

          {/* Current diner avatar */}
          {currentDiner && (
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm"
              style={{ backgroundColor: currentDiner.avatar_color }}
              title={currentDiner.name}
              aria-label={t('header.yourProfile', { name: currentDiner.name })}
            >
              {currentDiner.name.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Cart button */}
          <CartButton cartCount={cartCount} onClick={onCartClick} />

          {/* Hamburger menu button - visible on mobile when session exists, hidden on larger screens */}
          {session && (
            <button
              onClick={() => hamburgerMenu.open()}
              className="p-2 hover:bg-dark-elevated rounded-lg transition-colors md:hidden"
              aria-label={t('header.menu')}
              title={t('header.menu')}
            >
              <HamburgerIcon />
            </button>
          )}
        </div>
      </div>

      {/* Hamburger Menu - Mobile Language Selector */}
      <HamburgerMenu
        isOpen={hamburgerMenu.isOpen}
        onClose={hamburgerMenu.close}
      />
    </header>
  )
}

// Memoized sub-components to prevent unnecessary re-renders

interface DinersAvatarsProps {
  diners: Diner[]
}

const DinersAvatars = memo(function DinersAvatars({ diners }: DinersAvatarsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5 bg-dark-card px-2.5 py-1.5 rounded-full">
      <div className="flex -space-x-1.5">
        {diners.slice(0, 3).map((diner) => (
          <div
            key={diner.id}
            className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-dark-card"
            style={{ backgroundColor: diner.avatar_color }}
            title={diner.name}
            aria-hidden="true"
          />
        ))}
        {diners.length > 3 && (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-dark-elevated border-2 border-dark-card flex items-center justify-center">
            <span className="text-[10px] text-dark-muted">
              +{diners.length - 3}
            </span>
          </div>
        )}
      </div>
      <span className="sr-only">{t('header.dinersAtTable', { count: diners.length })}</span>
    </div>
  )
})

function HamburgerIcon() {
  return (
    <svg
      className="w-6 h-6 text-white"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  )
}

interface CartButtonProps {
  cartCount: number
  onClick?: () => void
}

const CartButton = memo(function CartButton({ cartCount, onClick }: CartButtonProps) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className={`relative p-2 rounded-full transition-all ${cartCount > 0 ? 'bg-primary hover:bg-primary/90' : 'hover:bg-dark-elevated'
        }`}
      aria-label={cartCount > 0 ? t('header.cartItems', { count: cartCount }) : t('header.cart')}
      title={t('cart.myOrders')}
    >
      <svg
        className="w-6 h-6 sm:w-7 sm:h-7 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
        />
      </svg>
      {cartCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 bg-white text-primary text-xs font-bold rounded-full flex items-center justify-center shadow-lg animate-bounce-subtle">
          {cartCount}
        </span>
      )}
    </button>
  )
})
