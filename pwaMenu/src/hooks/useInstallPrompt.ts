/**
 * PWA Install Prompt Hook
 *
 * Provides a beautiful, customizable install prompt experience for the PWA.
 * Captures the beforeinstallprompt event and exposes methods to show/hide
 * the install UI.
 *
 * Features:
 * - Detects if app can be installed
 * - Captures deferred install prompt
 * - Tracks install state (pending, installed, dismissed)
 * - Detects if running in standalone mode (already installed)
 *
 * Usage:
 * ```tsx
 * const { canInstall, isInstalled, promptInstall, dismissPrompt } = useInstallPrompt()
 *
 * if (canInstall && !isInstalled) {
 *   return <InstallBanner onInstall={promptInstall} onDismiss={dismissPrompt} />
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[]
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed'
        platform: string
    }>
    prompt(): Promise<void>
}

interface InstallPromptState {
    /** Whether the app can be installed (browser supports it and not already installed) */
    canInstall: boolean
    /** Whether the app is already installed (running in standalone mode) */
    isInstalled: boolean
    /** Whether the user has dismissed the install prompt in this session */
    isDismissed: boolean
    /** Whether an install is currently in progress */
    isInstalling: boolean
    /** Prompt the user to install the app */
    promptInstall: () => Promise<boolean>
    /** Dismiss the install prompt for this session */
    dismissPrompt: () => void
    /** Reset dismissed state (for showing prompt again) */
    resetDismissed: () => void
}

// Storage key for tracking if user dismissed prompt
const DISMISS_STORAGE_KEY = 'pwa-install-dismissed'
const DISMISS_DURATION_DAYS = 7 // Show again after 7 days

export function useInstallPrompt(): InstallPromptState {
    const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
    const [canInstall, setCanInstall] = useState(false)
    const [isInstalled, setIsInstalled] = useState(false)
    const [isDismissed, setIsDismissed] = useState(false)
    const [isInstalling, setIsInstalling] = useState(false)

    // Check if running in standalone mode (already installed)
    useEffect(() => {
        const checkStandalone = () => {
            const isStandalone =
                window.matchMedia('(display-mode: standalone)').matches ||
                // iOS Safari
                (window.navigator as { standalone?: boolean }).standalone === true ||
                // Installed PWA on some browsers
                document.referrer.includes('android-app://') ||
                window.matchMedia('(display-mode: fullscreen)').matches ||
                window.matchMedia('(display-mode: minimal-ui)').matches

            setIsInstalled(isStandalone)
        }

        checkStandalone()

        // Listen for display mode changes
        const mediaQuery = window.matchMedia('(display-mode: standalone)')
        const handleChange = (e: MediaQueryListEvent) => {
            setIsInstalled(e.matches)
        }

        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
    }, [])

    // Check if user previously dismissed the prompt
    useEffect(() => {
        try {
            const dismissedAt = localStorage.getItem(DISMISS_STORAGE_KEY)
            if (dismissedAt) {
                const dismissedDate = new Date(dismissedAt)
                const now = new Date()
                const daysSinceDismiss = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)

                if (daysSinceDismiss < DISMISS_DURATION_DAYS) {
                    setIsDismissed(true)
                } else {
                    // Expired, remove from storage
                    localStorage.removeItem(DISMISS_STORAGE_KEY)
                }
            }
        } catch {
            // localStorage not available
        }
    }, [])

    // Listen for beforeinstallprompt event
    useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault()

            // Store the event for later use
            deferredPromptRef.current = e as BeforeInstallPromptEvent

            // Update state to show install button
            setCanInstall(true)
        }

        const handleAppInstalled = () => {
            // Clear the deferred prompt
            deferredPromptRef.current = null
            setCanInstall(false)
            setIsInstalled(true)
            setIsInstalling(false)

            // Clear any dismiss state
            try {
                localStorage.removeItem(DISMISS_STORAGE_KEY)
            } catch {
                // Ignore
            }
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        window.addEventListener('appinstalled', handleAppInstalled)

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
            window.removeEventListener('appinstalled', handleAppInstalled)
        }
    }, [])

    // Prompt the user to install the app
    const promptInstall = useCallback(async (): Promise<boolean> => {
        const deferredPrompt = deferredPromptRef.current

        if (!deferredPrompt) {
            return false
        }

        setIsInstalling(true)

        try {
            // Show the install prompt
            await deferredPrompt.prompt()

            // Wait for user response
            const { outcome } = await deferredPrompt.userChoice

            // Clear the deferred prompt - can only be used once
            deferredPromptRef.current = null
            setCanInstall(false)
            setIsInstalling(false)

            if (outcome === 'accepted') {
                // User accepted, isInstalled will be set by appinstalled event
                return true
            } else {
                // User dismissed
                dismissPromptInternal()
                return false
            }
        } catch {
            setIsInstalling(false)
            return false
        }
    }, [])

    // Internal dismiss function
    const dismissPromptInternal = () => {
        setIsDismissed(true)
        try {
            localStorage.setItem(DISMISS_STORAGE_KEY, new Date().toISOString())
        } catch {
            // localStorage not available
        }
    }

    // Dismiss the install prompt for this session
    const dismissPrompt = useCallback(() => {
        dismissPromptInternal()
    }, [])

    // Reset dismissed state
    const resetDismissed = useCallback(() => {
        setIsDismissed(false)
        try {
            localStorage.removeItem(DISMISS_STORAGE_KEY)
        } catch {
            // Ignore
        }
    }, [])

    return {
        canInstall,
        isInstalled,
        isDismissed,
        isInstalling,
        promptInstall,
        dismissPrompt,
        resetDismissed,
    }
}
