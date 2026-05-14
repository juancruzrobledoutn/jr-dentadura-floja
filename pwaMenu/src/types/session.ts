// ============================================
// PWA Menu - Diner & Cart Types
// ============================================

/**
 * Frontend Diner entity
 * Represents a person at a table (may or may not have backend ID)
 */
export interface Diner {
  id: string
  name: string
  avatarColor: string   // Color to identify the diner (camelCase normalized)
  joinedAt: string      // ISO timestamp
  isCurrentUser: boolean
  userId?: string       // Backend user ID if authenticated
  email?: string        // Email if authenticated
  picture?: string      // Profile picture URL if authenticated
  backendDinerId?: number // Backend diner ID when registered (Phase 2)
  registrationFailed?: boolean // True if backend registration failed after retries
}

/**
 * Item in the shared cart
 */
export interface CartItem {
  id: string
  productId: string     // camelCase normalized
  name: string
  price: number
  image: string
  quantity: number
  dinerId: string       // Who added this item (camelCase normalized)
  dinerName: string     // Diner name
  dinerColor?: string   // Diner avatar color (from backend for remote items)
  notes?: string        // Special notes for the item
  _submitting?: boolean // Internal flag: item is being submitted (prevents race condition)
  backendItemId?: number // Backend cart_item.id for API sync
}

/**
 * Input for adding items to cart
 */
export interface AddToCartInput {
  productId: string     // camelCase normalized
  name: string
  price: number
  image?: string        // Optional - store provides fallback
  quantity?: number
  notes?: string
}

// ============================================
// PWA Menu - Table Session Types
// ============================================

/**
 * Session status enum
 */
export type SessionStatus = 'active' | 'closed' | 'paying'

/**
 * Represents an active table session
 */
export interface TableSession {
  id: string
  tableNumber: string   // camelCase normalized
  tableName?: string
  restaurantId: string
  branchId?: string     // Optional branch reference
  status: SessionStatus
  createdAt: string     // ISO timestamp
  lastActivity?: string // SESSION TTL FIX: Timestamp of last user activity
  diners: Diner[]
  sharedCart: CartItem[] // camelCase normalized
  // Backend session data (when connected to backend)
  backendSessionId?: number  // camelCase normalized
  backendTableId?: number
  backendCheckId?: number    // Check ID from billing/check/request
  // Round confirmation (Confirmación Grupal)
  roundConfirmation?: RoundConfirmation | null
}

// ============================================
// PWA Menu - Order Types
// ============================================

/**
 * Order status enum - matches backend RoundStatus
 */
export type OrderStatus =
  | 'submitted'   // Just submitted (SUBMITTED)
  | 'confirmed'   // Confirmed by kitchen (IN_KITCHEN)
  | 'preparing'   // In preparation
  | 'ready'       // Ready to serve (READY)
  | 'delivered'   // Delivered to table (SERVED)
  | 'paid'        // Paid
  | 'cancelled'   // Cancelled (CANCELED)

/**
 * Order record representing a submitted round
 */
export interface OrderRecord {
  id: string
  roundNumber: number       // Round number (1, 2, 3...) - camelCase normalized
  items: CartItem[]
  subtotal: number          // Sum of items
  status: OrderStatus
  submittedBy: string       // Diner ID who submitted - camelCase normalized
  submittedByName: string   // Diner name
  submittedAt: string       // Submission timestamp
  confirmedAt?: string      // When kitchen confirmed
  readyAt?: string          // When ready
  deliveredAt?: string      // When delivered
  backendRoundId?: number   // Backend round ID (when connected to backend)
}

/**
 * Order submission process state
 */
export type OrderState = 'idle' | 'submitting' | 'success' | 'error'

// ============================================
// PWA Menu - Payment Types
// ============================================

/**
 * Payment method enum
 */
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed'

/**
 * Split method enum
 */
export type SplitMethod = 'equal' | 'byConsumption' | 'custom' // camelCase normalized

/**
 * Payment share for a diner
 */
export interface PaymentShare {
  dinerId: string     // camelCase normalized
  dinerName: string
  amount: number
  paid: boolean
  paidAt?: string
  method?: PaymentMethod
}

/**
 * Table payment record
 */
export interface TablePayment {
  id: string
  tableSessionId: string  // camelCase normalized
  totalAmount: number
  splitMethod: SplitMethod
  shares: PaymentShare[]
  completed: boolean
  completedAt?: string
}

// ============================================
// PWA Menu - Round Confirmation Types (Confirmación Grupal)
// ============================================

/**
 * Estado de confirmación de un comensal para enviar ronda
 */
export interface DinerReadyStatus {
  dinerId: string
  dinerName: string
  isReady: boolean
  readyAt?: string  // Timestamp cuando confirmó
}

/**
 * Estado de confirmación grupal para la ronda actual
 */
export type RoundConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired'

export interface RoundConfirmation {
  id: string                        // UUID único para esta propuesta
  proposedBy: string                // dinerId que inició la votación
  proposedByName: string            // Nombre del que propuso
  proposedAt: string                // Timestamp
  dinerStatuses: DinerReadyStatus[]
  status: RoundConfirmationStatus
  expiresAt: string                 // Timeout de 5 minutos
}

/**
 * @deprecated Use OrderRecord instead. This type is only used in api.ts
 * for backwards compatibility with the backend API contract.
 * The backend uses Round/RoundItem models; this maps to that format.
 */
export interface Order {
  id: string
  tableSessionId: string  // camelCase normalized
  items: CartItem[]
  total: number
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered'
  createdAt: string
  submittedBy: string     // Diner ID who submitted the order
}
