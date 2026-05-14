import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Card, CardHeader, Button, ConfirmDialog, Input } from '../components/ui'
import { RefreshCw, Trash2, Download, Upload, Shield } from 'lucide-react'
import { authAPI } from '../services/api'

// Maximum file size for import (5MB)
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024
import {
  useCategoryStore,
  selectCategories,
} from '../stores/categoryStore'
import {
  useSubcategoryStore,
  selectSubcategories,
} from '../stores/subcategoryStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import { useRestaurantStore, selectRestaurant } from '../stores/restaurantStore'
import { toast } from '../stores/toastStore'
import { STORAGE_KEYS } from '../utils/constants'
import { handleError } from '../utils/logger'
import { helpContent } from '../utils/helpContent'
import { useState } from 'react'

function clearAllStorageData(): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key)
  })
}

function TwoFactorSection() {
  const { t } = useTranslation()
  const [step, setStep] = useState<'idle' | 'setup' | 'verify' | 'enabled'>('idle')
  const [qrUrl, setQrUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSetup = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await authAPI.setup2FA()
      setQrUrl(result.qr_url)
      setSecret(result.secret)
      setStep('setup')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!verifyCode.trim()) return
    setLoading(true)
    setError(null)
    try {
      await authAPI.verify2FA(verifyCode.trim())
      setStep('enabled')
      toast.success(t('settings.2fa.enabled', '2FA activado correctamente'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Codigo invalido'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    if (!disableCode.trim()) return
    setLoading(true)
    setError(null)
    try {
      await authAPI.disable2FA(disableCode.trim())
      setStep('idle')
      setDisableCode('')
      toast.success(t('settings.2fa.disabled', '2FA desactivado'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Codigo invalido'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6">
      <Card>
        <CardHeader
          title={t('settings.2fa.title', 'Autenticacion de dos factores')}
          subtitle={t('settings.2fa.subtitle', 'Agrega una capa extra de seguridad a tu cuenta')}
        />
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-sm text-[var(--danger-text)]">
              {error}
            </div>
          )}

          {step === 'idle' && (
            <Button
              onClick={handleSetup}
              isLoading={loading}
              leftIcon={<Shield className="w-4 h-4" />}
            >
              {t('settings.2fa.setup', 'Configurar 2FA')}
            </Button>
          )}

          {step === 'setup' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                {t('settings.2fa.scanQR', 'Escanea este codigo QR con tu app de autenticacion (Google Authenticator, Authy, etc.)')}
              </p>
              <div className="flex justify-center">
                <img
                  src={qrUrl}
                  alt="2FA QR Code"
                  className="w-48 h-48 rounded-lg border border-[var(--border-default)] bg-white p-2"
                />
              </div>
              <p className="text-xs text-[var(--text-muted)] text-center break-all">
                {t('settings.2fa.manualKey', 'Clave manual')}: <code className="text-[var(--primary-500)]">{secret}</code>
              </p>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Input
                    label={t('settings.2fa.verifyLabel', 'Codigo de verificacion')}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    placeholder="000000"
                  />
                </div>
                <Button onClick={handleVerify} isLoading={loading}>
                  {t('settings.2fa.verify', 'Verificar')}
                </Button>
              </div>
            </div>
          )}

          {step === 'enabled' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[var(--success-text)]">
                <Shield className="w-5 h-5" />
                <span className="font-medium">{t('settings.2fa.active', '2FA esta activo')}</span>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Input
                    label={t('settings.2fa.disableLabel', 'Ingresa tu codigo para desactivar')}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    placeholder="000000"
                  />
                </div>
                <Button variant="danger" onClick={handleDisable} isLoading={loading}>
                  {t('settings.2fa.disable', 'Desactivar')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.settings.title'))

  // Using selectors
  const categories = useCategoryStore(selectCategories)
  const setCategories = useCategoryStore((s) => s.setCategories)

  const subcategories = useSubcategoryStore(selectSubcategories)
  const setSubcategories = useSubcategoryStore((s) => s.setSubcategories)

  const products = useProductStore(selectProducts)
  const setProducts = useProductStore((s) => s.setProducts)

  const restaurant = useRestaurantStore(selectRestaurant)
  const setRestaurant = useRestaurantStore((s) => s.setRestaurant)

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)

  // Ref for hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ref for hidden download link
  const downloadLinkRef = useRef<HTMLAnchorElement>(null)

  const handleExportData = useCallback(() => {
    try {
      const data = {
        restaurant,
        categories,
        subcategories,
        products,
        exportedAt: new Date().toISOString(),
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)

      if (downloadLinkRef.current) {
        downloadLinkRef.current.href = url
        downloadLinkRef.current.download = `buen-sabor-backup-${new Date().toISOString().split('T')[0]}.json`
        downloadLinkRef.current.click()
        // Delay revoke to ensure download starts
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }

      toast.success(t('pages.settings.dataExported'))
    } catch (error) {
      handleError(error, 'SettingsPage.handleExportData')
      toast.error(t('pages.settings.exportError'))
    }
  }, [restaurant, categories, subcategories, products])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Validate object has required string fields
  const hasRequiredFields = useCallback((obj: unknown, fields: string[]): boolean => {
    if (!obj || typeof obj !== 'object') return false
    const record = obj as Record<string, unknown>
    return fields.every(field => typeof record[field] === 'string' || record[field] === undefined)
  }, [])

  // Validate imported data structure with deep validation
  const validateImportData = useCallback((data: unknown): data is {
    restaurant?: unknown
    categories?: unknown[]
    subcategories?: unknown[]
    products?: unknown[]
  } => {
    if (!data || typeof data !== 'object') return false
    const obj = data as Record<string, unknown>

    // Validate restaurant object structure if present
    if (obj.restaurant !== undefined) {
      if (typeof obj.restaurant !== 'object' || obj.restaurant === null) return false
      const rest = obj.restaurant as Record<string, unknown>
      if (typeof rest.name !== 'string' || typeof rest.slug !== 'string') return false
    }

    // Validate categories array and items if present
    if (obj.categories !== undefined) {
      if (!Array.isArray(obj.categories)) return false
      if (!obj.categories.every(item => hasRequiredFields(item, ['id', 'name', 'branch_id']))) return false
    }

    // Validate subcategories array and items if present
    if (obj.subcategories !== undefined) {
      if (!Array.isArray(obj.subcategories)) return false
      if (!obj.subcategories.every(item => hasRequiredFields(item, ['id', 'name', 'category_id']))) return false
    }

    // Validate products array and items if present
    if (obj.products !== undefined) {
      if (!Array.isArray(obj.products)) return false
      if (!obj.products.every(item => hasRequiredFields(item, ['id', 'name', 'category_id']))) return false
    }

    return true
  }, [hasRequiredFields])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Validate file size to prevent DoS
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        toast.error(t('pages.settings.fileTooLarge'))
        return
      }

      // Validate file type
      if (!file.name.endsWith('.json')) {
        toast.error(t('pages.settings.onlyJsonAllowed'))
        return
      }

      try {
        const text = await file.text()
        const data = JSON.parse(text)

        // Validate structure before importing
        if (!validateImportData(data)) {
          toast.error(t('pages.settings.invalidStructure'))
          return
        }

        // Only import valid data
        if (data.restaurant && typeof data.restaurant === 'object') {
          setRestaurant(data.restaurant)
        }
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories)
        }
        if (data.subcategories && Array.isArray(data.subcategories)) {
          setSubcategories(data.subcategories)
        }
        if (data.products && Array.isArray(data.products)) {
          setProducts(data.products)
        }

        toast.success(t('pages.settings.dataImported'))
      } catch (error) {
        handleError(error, 'SettingsPage.handleFileChange')
        toast.error(t('pages.settings.importError'))
      }

      // Reset input value to allow re-importing same file
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [setRestaurant, setCategories, setSubcategories, setProducts, validateImportData]
  )

  const handleResetData = useCallback(() => {
    clearAllStorageData()
    window.location.reload()
  }, [])

  const handleClearCache = useCallback(() => {
    clearAllStorageData()
    toast.success(t('pages.settings.cacheCleared'))
  }, [])

  return (
    <PageContainer
      title={t('pages.settings.title')}
      description={t('pages.settings.descriptionFull')}
      helpContent={helpContent.settings}
    >
      {/* Hidden elements for file operations */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
        aria-label={t('pages.settings.selectBackupFile')}
      />
      <a
        ref={downloadLinkRef}
        className="hidden"
        aria-hidden="true"
      />

      <div className="max-w-2xl space-y-6">
        {/* Data Management */}
        <Card>
          <CardHeader
            title={t('pages.settings.dataManagement')}
            description={t('pages.settings.dataManagementDesc')}
          />

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[var(--bg-tertiary)]/50 rounded-lg">
              <div>
                <p className="font-medium text-[var(--text-primary)]">{t('pages.settings.exportDataTitle')}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {t('pages.settings.exportDataDesc')}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleExportData}
                leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
              >
                {t('pages.settings.export')}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 bg-[var(--bg-tertiary)]/50 rounded-lg">
              <div>
                <p className="font-medium text-[var(--text-primary)]">{t('pages.settings.importDataTitle')}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {t('pages.settings.importDataDesc')}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleImportClick}
                leftIcon={<Upload className="w-4 h-4" aria-hidden="true" />}
              >
                {t('pages.settings.import')}
              </Button>
            </div>
          </div>
        </Card>

        {/* Cache */}
        <Card>
          <CardHeader
            title={t('pages.settings.cache')}
            description={t('pages.settings.cacheDesc')}
          />

          <div className="flex items-center justify-between p-4 bg-[var(--bg-tertiary)]/50 rounded-lg">
            <div>
              <p className="font-medium text-[var(--text-primary)]">{t('pages.settings.clearCache')}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {t('pages.settings.clearCacheDesc')}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleClearCache}
              leftIcon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
            >
              {t('pages.settings.clear')}
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="border-[var(--danger-border)]/30">
          <CardHeader
            title={t('pages.settings.dangerZone')}
            description={t('pages.settings.dangerZoneDesc')}
          />

          <div className="flex items-center justify-between p-4 bg-[var(--danger-border)]/10 rounded-lg border border-[var(--danger-border)]/30">
            <div>
              <p className="font-medium text-[var(--danger-text)]">{t('pages.settings.resetData')}</p>
              <p className="text-sm text-[var(--danger-text)]/70">
                {t('pages.settings.resetDataDesc')}
              </p>
            </div>
            <Button
              variant="danger"
              onClick={() => setIsResetDialogOpen(true)}
              leftIcon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
            >
              {t('pages.settings.reset')}
            </Button>
          </div>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader title={t('pages.settings.info')} />
          <div className="space-y-2 text-sm" role="list">
            <div className="flex justify-between" role="listitem">
              <span className="text-[var(--text-muted)]">{t('pages.settings.version')}</span>
              <span className="text-[var(--text-primary)]">1.0.0</span>
            </div>
            <div className="flex justify-between" role="listitem">
              <span className="text-[var(--text-muted)]">{t('pages.settings.categories')}</span>
              <span className="text-[var(--text-primary)]">{categories.length}</span>
            </div>
            <div className="flex justify-between" role="listitem">
              <span className="text-[var(--text-muted)]">{t('pages.settings.subcategories')}</span>
              <span className="text-[var(--text-primary)]">{subcategories.length}</span>
            </div>
            <div className="flex justify-between" role="listitem">
              <span className="text-[var(--text-muted)]">{t('pages.settings.productsLabel')}</span>
              <span className="text-[var(--text-primary)]">{products.length}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 2FA Section */}
      <TwoFactorSection />

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isResetDialogOpen}
        onClose={() => setIsResetDialogOpen(false)}
        onConfirm={handleResetData}
        title={t('pages.settings.resetConfirmTitle')}
        message={t('pages.settings.resetConfirmMessage')}
        confirmLabel={t('pages.settings.reset')}
      />
    </PageContainer>
  )
}

export default SettingsPage
