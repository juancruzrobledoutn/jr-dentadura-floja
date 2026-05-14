import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'

interface QRSimulatorProps {
  onScanQR: (tableNumber: string) => void
}

export default function QRSimulator({ onScanQR }: QRSimulatorProps) {
  const { t } = useTranslation()

  // Fixed table code for simplified flow (matches seed_completo.py)
  const tableNumber = 'INT-01'

  // Generates the URL that the physical table QR would have
  const getQRUrl = (table: string) => {
    const baseUrl = window.location.origin
    return `${baseUrl}?mesa=${encodeURIComponent(table)}`
  }

  const handleScanQR = () => {
    onScanQR(tableNumber)
  }

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col overflow-x-hidden w-full max-w-full">
      {/* Header */}
      <header className="bg-dark-bg border-b border-dark-border px-4 sm:px-6 py-4 safe-area-top">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-center">
            Sabor
          </h1>
        </div>
      </header>

      {/* QR Display */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8">
        <div className="w-full max-w-sm">
          {/* QR Card */}
          <div className="bg-dark-card rounded-2xl p-6 border border-dark-border shadow-xl">
            {/* Info card */}
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{t('qrSimulator.simulationMode')}</p>
                  <p className="text-dark-muted text-xs mt-0.5">
                    {t('qrSimulator.simulationDescription')}
                  </p>
                </div>
              </div>
            </div>

            {/* Table number */}
            <div className="text-center mb-6">
              <p className="text-dark-muted text-sm mb-1">{t('qrSimulator.table')}</p>
              <p className="text-4xl font-bold text-white">{tableNumber}</p>
            </div>

            {/* QR Code */}
            <div className="bg-white rounded-xl p-4 mb-6">
              <QRCodeSVG
                value={getQRUrl(tableNumber)}
                size={200}
                level="M"
                includeMargin={false}
                className="w-full h-auto"
              />
            </div>

            {/* Instructions */}
            <p className="text-dark-muted text-center text-sm mb-6">
              {t('qrSimulator.scanInstruction')}
            </p>

            {/* Simulate scan button */}
            <button
              onClick={handleScanQR}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
              </svg>
              {t('qrSimulator.simulateScan')}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
