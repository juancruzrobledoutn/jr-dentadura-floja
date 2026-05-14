/**
 * Print utility for fetching receipt HTML with auth and opening in a print-ready window.
 *
 * Uses fetch() with JWT auth to get the HTML content, then writes it to a new
 * window and triggers the browser print dialog. This approach ensures the
 * Authorization header is properly sent (window.open() doesn't send JWT).
 */

import { getAuthToken } from '../services/api'
import { logError } from './logger'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * Fetch receipt HTML with auth and open it in a print-ready window.
 *
 * @param path - API path relative to base URL (e.g., "/api/admin/receipts/kitchen-ticket/42")
 */
export async function printReceipt(path: string): Promise<void> {
  const url = `${API_BASE_URL}${path}`
  const token = getAuthToken()

  try {
    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    })

    if (!response.ok) {
      logError(`Failed to fetch receipt: ${response.status}`, 'printReceipt')
      return
    }

    const html = await response.text()
    const printWindow = window.open('', '_blank', 'width=350,height=600')
    if (printWindow) {
      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      // Wait for content to render before triggering print
      printWindow.addEventListener('load', () => {
        printWindow.focus()
        printWindow.print()
      })
      // Fallback: if load doesn't fire (content already rendered), print after short delay
      setTimeout(() => {
        printWindow.focus()
        printWindow.print()
      }, 500)
    }
  } catch (error) {
    logError('Error fetching receipt for printing', 'printReceipt', error)
  }
}

/**
 * Print a kitchen ticket for a specific round.
 */
export function printKitchenTicket(roundId: number): void {
  printReceipt(`/api/admin/receipts/kitchen-ticket/${roundId}`)
}

/**
 * Print a customer receipt for a specific check.
 */
export function printCustomerReceipt(checkId: number): void {
  printReceipt(`/api/admin/receipts/customer-receipt/${checkId}`)
}

/**
 * Print a daily closing report for a branch.
 *
 * @param branchId - Branch ID
 * @param date - Optional date in YYYY-MM-DD format (defaults to today)
 */
export function printDailyReport(branchId: number, date?: string): void {
  const dateSuffix = date ? `?report_date=${date}` : ''
  printReceipt(`/api/admin/receipts/daily-report/${branchId}${dateSuffix}`)
}
