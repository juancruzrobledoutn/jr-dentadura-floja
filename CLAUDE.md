# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Quick Reference

### Prerequisites

- **Python 3.12+** (CI uses 3.12)
- **Node.js 22+** (CI uses 22)
- **Docker & Docker Compose** (recommended for backend services)
- **Ollama** (optional — only needed for AI/RAG chatbot features)

**Environment variables**: All 3 frontends use `VITE_API_URL=http://localhost:8000` (no `/api` suffix — each app's API client adds the prefix internally). pwaMenu and pwaWaiter also need `VITE_WS_URL=ws://localhost:8001`. pwaMenu additionally requires `VITE_BRANCH_SLUG` and `VITE_MP_PUBLIC_KEY`.

**Start Development (Docker - recommended):**
```bash
cd devOps && docker compose up -d --build   # All services (DB, Redis, API, WS)
docker compose logs -f backend ws_gateway   # Watch logs
```

**Start Frontends:**
```bash
cd Dashboard && npm install && npm run dev    # Port 5177
cd pwaMenu && npm install && npm run dev      # Port 5176
cd pwaWaiter && npm install && npm run dev    # Port 5178
```

**Run Tests:**
```bash
cd Dashboard && npm test -- src/stores/branchStore.test.ts  # Single file (watch mode)
cd Dashboard && npm run test:coverage                        # Coverage report
cd pwaMenu && npm run test:run                               # Single run (no watch)
cd pwaMenu && npm test                                       # Watch mode
cd pwaWaiter && npm run test:run                             # Single run (no watch)
cd pwaWaiter && npm test -- src/stores/waiterStore.test.ts  # Single file (watch mode)
cd backend && python -m pytest tests/test_auth.py -v         # Backend single file
cd backend && python -m pytest tests/ -v                     # Backend all tests
```

**Type Check / Lint:**
```bash
cd Dashboard && npm run type-check    # Dashboard TypeScript check
npx tsc --noEmit                      # Any frontend (from its directory)
cd Dashboard && npm run lint           # ESLint (same for pwaMenu, pwaWaiter)
```

**Backend (manual - without Docker):**
```bash
docker compose -f devOps/docker-compose.yml up -d db redis   # Start only DB + Redis
cd backend && pip install -r requirements.txt
cd backend && python -m uvicorn rest_api.main:app --reload --port 8000
# WS Gateway (from project root, requires PYTHONPATH)
$env:PYTHONPATH = "$PWD\backend"                              # Windows PowerShell
python -m uvicorn ws_gateway.main:app --reload --port 8001
```

**Database Migrations (Alembic):**
```bash
cd backend
alembic revision --autogenerate -m "describe change"   # Generate migration
alembic upgrade head                                    # Apply all migrations
alembic downgrade -1                                    # Rollback last migration
alembic history                                         # Show migration history
```

**First-time Database Setup:**
```bash
cd backend && alembic upgrade head          # Apply all migrations (001-011)
cd backend && python cli.py db-seed         # Load seed data (tenants, users, allergens, menu, tables)
cd backend && python cli.py db-seed --only=users  # Load specific module only
```

**Backup & Restore:**
```bash
cd devOps
./backup/backup.sh                    # Full backup (PostgreSQL + Redis) → ./backups/
./backup/restore.sh backups/file.tar.gz   # Restore from backup (interactive)
```

**Production Deployment (Scaled):**
```bash
cd devOps
cp .env.example .env                  # Edit with production secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# Deploys: 2x backend, 2x ws_gateway, nginx LB, Redis Sentinel
```

**First-time setup:** Copy `.env.example` to `.env` in `backend/`, `Dashboard/`, `pwaMenu/`, `pwaWaiter/`, `devOps/`.

**Test Users:** `admin@demo.com` / `admin123` (ADMIN), `waiter@demo.com` / `waiter123` (WAITER), `kitchen@demo.com` / `kitchen123` (KITCHEN), `ana@demo.com` / `ana123` (WAITER), `alberto.cortez@demo.com` / `waiter123` (WAITER)

**Key Ports:** REST API `:8000` | WebSocket `:8001` | Redis `:6380` | PostgreSQL `:5432` | pgAdmin `:5050`

**Stack:** React 19.2 | Vite 7.2 | TypeScript 5.9 | Vitest 4.0 (pwaWaiter: 3.2) | FastAPI 0.115 | SQLAlchemy 2.0 | `babel-plugin-react-compiler` (Dashboard only)

---

## Project Overview

**Integrador** is a restaurant management system monorepo:

| Component | Port | Description |
|-----------|------|-------------|
| **Dashboard** | 5177 | Admin panel for multi-branch restaurant management (React 19 + Zustand) |
| **pwaMenu** | 5176 | Customer-facing shared menu PWA with collaborative ordering, i18n (es/en/pt) |
| **pwaWaiter** | 5178 | Waiter PWA for real-time table management with sector grouping |
| **backend** | 8000 | FastAPI REST API (PostgreSQL, Redis, JWT) |
| **ws_gateway** | 8001 | WebSocket Gateway for real-time events (at project root) |

Frontend sub-projects (`Dashboard/`, `pwaMenu/`, `pwaWaiter/`) each have their own `CLAUDE.md` with sub-project-specific patterns (hooks, store architecture, UI workflows). Backend and ws_gateway patterns are documented here and in their respective `README.md` files. See `ws_gateway/README.md` and `ws_gateway/arquiws_gateway.md` for gateway-specific architecture.

---

## Architecture

### Data Model

```
Tenant (Restaurant)
  ├── CookingMethod, FlavorProfile, TextureProfile, CuisineType (tenant-scoped catalogs)
  ├── IngredientGroup → Ingredient → SubIngredient (tenant-scoped)
  └── Branch (N)
        ├── Category (N) → Subcategory (N) → Product (N)
        ├── BranchSector (N) → Table (N) → TableSession → Diner (N)
        │                   → WaiterSectorAssignment (daily)
        │                   → Round → RoundItem → KitchenTicket
        ├── Check (table: app_check) → Charge → Allocation (FIFO) ← Payment
        └── ServiceCall

User ←→ UserBranchRole (M:N, roles: WAITER/KITCHEN/MANAGER/ADMIN)
Product ←→ BranchProduct (per-branch pricing in cents)
Product ←→ ProductAllergen (M:N with presence_type + risk_level)
Customer ←→ Diner (1:N via customer_id, device tracking, implicit preferences)
```

### Clean Architecture (Backend)

```
ROUTERS (thin controllers - HTTP only)
    → DOMAIN SERVICES (business logic: rest_api/services/domain/)
        → REPOSITORIES (data access: rest_api/services/crud/repository.py)
            → MODELS (SQLAlchemy: rest_api/models/)
```

**CRUDFactory is deprecated.** Use Domain Services for new features:

```python
# Router (thin - delegates to service)
@router.get("/categories")
def list_categories(db: Session = Depends(get_db), user: dict = Depends(current_user)):
    ctx = PermissionContext(user)
    service = CategoryService(db)
    return service.list_by_branch(ctx.tenant_id, branch_id)

# Available services (27 total in rest_api/services/domain/): CategoryService, SubcategoryService,
# BranchService, SectorService, TableService, ProductService, AllergenService, StaffService,
# PromotionService, RoundService, BillingService, DinerService, ServiceCallService, TicketService,
# AuditService, CashService, CrmService, CustomizationService, DeliveryService, FloorPlanService,
# OverrideService, ReceiptService, ReservationService, SchedulingService, TipService,
# InventoryService, FiscalService
# Base classes: BaseCRUDService[Model, Output], BranchScopedService[Model, Output]
```

**Creating a new Domain Service:**
```python
# 1. Create in rest_api/services/domain/my_entity_service.py
from rest_api.services.base_service import BranchScopedService
from shared.utils.admin_schemas import MyEntityOutput

class MyEntityService(BranchScopedService[MyEntity, MyEntityOutput]):
    def __init__(self, db: Session):
        super().__init__(db=db, model=MyEntity, output_schema=MyEntityOutput, entity_name="Mi Entidad")
    def _validate_create(self, data: dict, tenant_id: int) -> None: ...
    def _after_delete(self, entity_info: dict, user_id: int, user_email: str) -> None: ...
# 2. Export in rest_api/services/domain/__init__.py
# 3. Use in router (keep router thin!)
```

### Backend API Structure

```
/api/auth/login, /me, /refresh            # JWT authentication
/api/public/menu/{slug}                    # Public menu (no auth)
/api/public/branches                       # Public branches (no auth, pwaWaiter pre-login)
/api/tables/{id}/session                   # Session by numeric ID
/api/tables/code/{code}/session            # Session by table code (e.g., "INT-01")
/api/diner/*                               # Diner operations (X-Table-Token auth)
/api/customer/*                            # Customer loyalty (X-Table-Token auth)
/api/kitchen/*                             # Kitchen operations (JWT + KITCHEN role)
/api/recipes/*                             # Recipe CRUD (JWT + KITCHEN/MANAGER/ADMIN)
/api/billing/*                             # Payment operations
/api/waiter/*                              # Waiter operations (JWT + WAITER role)
/api/waiter/tables/{id}/activate           # Waiter-managed table activation (create session)
/api/waiter/sessions/{id}/rounds           # Waiter submits round for phoneless customers
/api/waiter/sessions/{id}/check            # Waiter requests check
/api/waiter/payments/manual                # Register cash/card/transfer payment
/api/waiter/tables/{id}/close              # Close table after payment
/api/waiter/branches/{id}/menu             # Compact menu for comanda rápida (no images)
/api/admin/*                               # Dashboard CRUD (JWT + role-based, ?limit=50&offset=0 defaults)
```

### WebSocket Events (port 8001)

```
Endpoints:
  /ws/waiter?token=JWT    # Waiter notifications (sector-targeted)
  /ws/kitchen?token=JWT   # Kitchen notifications
  /ws/diner?table_token=  # Diner real-time updates
  /ws/admin?token=JWT     # Dashboard admin notifications

Round lifecycle: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
  ROUND_PENDING, ROUND_CONFIRMED, ROUND_SUBMITTED, ROUND_IN_KITCHEN, ROUND_READY, ROUND_SERVED, ROUND_CANCELED
Cart sync: CART_ITEM_ADDED, CART_ITEM_UPDATED, CART_ITEM_REMOVED, CART_CLEARED
Service: SERVICE_CALL_CREATED, SERVICE_CALL_ACKED, SERVICE_CALL_CLOSED
Billing: CHECK_REQUESTED, CHECK_PAID, PAYMENT_APPROVED, PAYMENT_REJECTED
Tables: TABLE_SESSION_STARTED, TABLE_CLEARED, TABLE_STATUS_CHANGED
Admin: ENTITY_CREATED, ENTITY_UPDATED, ENTITY_DELETED, CASCADE_DELETE

Heartbeat: {"type":"ping"} → {"type":"pong"} (30s interval)
Close codes: 4001 (auth failed), 4003 (forbidden), 4029 (rate limited)
```

**Round Event Routing:**
| Event | Admin | Kitchen | Waiters | Diners |
|-------|-------|---------|---------|--------|
| `ROUND_PENDING` | yes | no | yes (all branch) | no |
| `ROUND_CONFIRMED` | yes | no | yes | no |
| `ROUND_SUBMITTED` | yes | yes | yes | no |
| `ROUND_IN_KITCHEN`+ | yes | yes | yes | yes |

Sector-based filtering: events with `sector_id` go only to assigned waiters. ADMIN/MANAGER always receive all branch events.

### Round Status Flow (Role-Restricted)

```
PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
(Diner)   (Waiter)   (Admin/Mgr)   (Kitchen)  (Kitchen) (Staff)
```

Kitchen does NOT see PENDING or CONFIRMED orders. Only SUBMITTED+ appears in kitchen view.

### Outbox Pattern (Guaranteed Event Delivery)

Financial/critical events use Transactional Outbox: event written to DB atomically with business data, then published by background processor.

```python
from rest_api.services.events.outbox_service import write_billing_outbox_event
write_billing_outbox_event(db=db, tenant_id=t, event_type=CHECK_REQUESTED, ...)
db.commit()  # Atomic with business data
```

| Pattern | Events |
|---------|--------|
| Outbox (must not lose) | CHECK_REQUESTED/PAID, PAYMENT_*, ROUND_SUBMITTED/READY, SERVICE_CALL_CREATED |
| Direct Redis (lower latency) | ROUND_CONFIRMED/IN_KITCHEN/SERVED, CART_*, TABLE_*, ENTITY_* |

---

## Core Patterns

### Critical Zustand Pattern (All Frontends)

```typescript
// CORRECT: Always use selectors
const items = useStore(selectItems)
const addItem = useStore((s) => s.addItem)

// WRONG: Never destructure (causes infinite re-render loops)
// const { items } = useStore()

// CRITICAL: Stable references for fallback arrays
const EMPTY_ARRAY: number[] = []
export const selectBranchIds = (s: State) => s.user?.branch_ids ?? EMPTY_ARRAY

// CRITICAL: useShallow for filtered/computed arrays
import { useShallow } from 'zustand/react/shallow'
const activeItems = useStore(useShallow(state => state.items.filter(i => i.active)))
```

### Backend Patterns

```python
# User context from JWT
user_id = int(user["sub"])       # "sub" contains user ID
tenant_id = user["tenant_id"]
branch_ids = user["branch_ids"]
roles = user["roles"]

# Permission Strategy Pattern
from rest_api.services.permissions import PermissionContext
ctx = PermissionContext(user)
ctx.require_management()           # Raises ForbiddenError if not ADMIN/MANAGER
ctx.require_branch_access(branch_id)

# Safe commit with automatic rollback
from shared.infrastructure.db import safe_commit
safe_commit(db)

# Eager loading to avoid N+1
from sqlalchemy.orm import selectinload, joinedload
rounds = db.execute(select(Round).options(
    selectinload(Round.items).joinedload(RoundItem.product)
)).scalars().unique().all()

# Race condition prevention
locked = db.scalar(select(Entity).where(...).with_for_update())

# SQLAlchemy boolean comparison - use .is_(True), not == True
.where(Model.is_active.is_(True))

# Repository pattern
from rest_api.services.crud import TenantRepository, BranchRepository
product_repo = TenantRepository(Product, db)
products = product_repo.find_all(tenant_id=1, options=[selectinload(Product.allergens)])

# Redis - async pool (singleton, don't close manually)
from shared.infrastructure.events import get_redis_pool, publish_event
redis = await get_redis_pool()

# Centralized exceptions with auto-logging
from shared.utils.exceptions import NotFoundError, ForbiddenError, ValidationError
raise NotFoundError("Producto", product_id, tenant_id=tenant_id)

# Centralized constants
from shared.config.constants import Roles, RoundStatus, MANAGEMENT_ROLES

# Cascade soft delete
from rest_api.services.crud import cascade_soft_delete
affected = cascade_soft_delete(db, product, user_id, user_email)

# Input validation
from shared.utils.validators import validate_image_url, escape_like_pattern
```

### Soft Delete Convention

All entities use soft delete (`is_active = False`) by default. Hard delete only for ephemeral records (e.g., cart items, expired sessions). Always filter by `.where(Model.is_active.is_(True))` in queries — repositories do this automatically, but raw queries must include it.

`cascade_soft_delete(db, entity, user_id, user_email)` deactivates the entity and all dependents, returning affected counts. Emits `CASCADE_DELETE` WebSocket event.

### Frontend-Backend Type Conversions

```typescript
// IDs: backend = number, frontend = string
const frontendId = String(backendId)
const backendId = parseInt(frontendId, 10)

// Prices: backend = cents (int), frontend = pesos (float)
const displayPrice = backendCents / 100    // 12550 → 125.50
const backendCents = Math.round(price * 100)

// Session status: backend UPPERCASE → frontend lowercase
```

### Frontend WebSocket Pattern

```typescript
// Use ref pattern to avoid listener accumulation
const handleEventRef = useRef(handleEvent)
useEffect(() => { handleEventRef.current = handleEvent })
useEffect(() => {
  const unsubscribe = ws.on('*', (e) => handleEventRef.current(e))
  return unsubscribe
}, [])  // Empty deps - subscribe once
```

### Logout Infinite Loop Prevention

In `api.ts`, `authAPI.logout()` must disable retry on 401. Otherwise: expired token → 401 → onTokenExpired → logout() → 401 → infinite loop. Pass `false` as third arg to `fetchAPI` to disable retry.

### React 19 Patterns (Frontends)

**`useActionState` for form submissions** (Dashboard + pwaMenu):
```typescript
const [state, formAction, isPending] = useActionState<FormState, FormData>(
  async (prevState, formData) => {
    const value = formData.get('field')
    // Validate, submit, return { isSuccess, errors }
  },
  { isSuccess: false }
)
// In JSX: <form action={formAction}> with <Button isLoading={isPending}>
```

**`useOptimisticCart` hook** (pwaMenu): Uses React 19's `useOptimistic` for instant cart feedback with automatic rollback on API failure. See `pwaMenu/src/hooks/useOptimisticCart.ts`.

**Store migrations with type guards** (Dashboard): Zustand persist migrations use `unknown` for `persistedState` (never `any`), validate structure with type guards, and return safe defaults on validation failure. Always increment `STORE_VERSIONS` when changing data structure. See `Dashboard/CLAUDE.md` → "Store Migrations".

**`useFormModal` + `useConfirmDialog`** (Dashboard): Eliminate boilerplate in CRUD pages — `useFormModal` replaces 3 useState calls, `useConfirmDialog` replaces 2. See `Dashboard/src/hooks/`.

**React Compiler**: Dashboard uses `babel-plugin-react-compiler` for automatic memoization (pwaMenu/pwaWaiter do not currently include it in devDeps). `eslint-plugin-react-hooks` 7.x enforces stricter rules — hooks must be called unconditionally, prefer derived state over `setState` in `useEffect`.

### Async Hook Mount Guard

```typescript
useEffect(() => {
  let isMounted = true
  fetchData().then(data => {
    if (!isMounted) return
    setData(data)
  })
  return () => { isMounted = false }
}, [])
```

---

## Conventions

- **UI language**: Spanish
- **Code comments**: English
- **Theme**: Orange (#f97316) accent
- **IDs**: `crypto.randomUUID()` in frontend, `BigIntPK` in backend (alias for `BigInteger().with_variant(Integer, "sqlite")` in `rest_api/models/base.py` — required for SQLite test autoincrement; using raw `BigInteger` on a PK breaks SQLite-backed tests)
- **Prices**: Stored as cents (e.g., $125.50 = 12550)
- **Logging**: Use centralized `utils/logger.ts`, never direct `console.*`
- **Naming**: Frontend camelCase, backend snake_case
- **SQL Reserved Words**: Avoid as table names (e.g., `Check` → `__tablename__ = "app_check"`)
- **pwaMenu i18n**: ALL user-facing text must use `t()` — zero hardcoded strings (es/en/pt)
- **localStorage expiry**: pwaMenu uses 8-hour TTL for cached data (menu, session). Stores check expiry on load and clear stale data. Other frontends use session-scoped storage.
- **Mobile viewport**: pwaMenu containers must include `overflow-x-hidden w-full max-w-full` to prevent horizontal scroll on mobile
- **HTTP status codes**: POST creates → `201 Created`, DELETE → `204 No Content` (not `200`). Update tests if you see a route returning `200` for these — the route is wrong, not the test.

---

## Security Configuration

### Authentication

| Context | Method | Header/Param |
|---------|--------|--------------|
| Dashboard, pwaWaiter | JWT | `Authorization: Bearer {token}` |
| pwaMenu diners | Table Token (HMAC) | `X-Table-Token: {token}` |
| WebSocket | JWT/Table Token | Query param `?token=` |

**Token Lifetimes:** Access 15min | Refresh 7 days (HttpOnly cookie) | Table token 3 hours

**Refresh Strategy:** Dashboard and pwaWaiter proactively refresh every 14 min. Refresh tokens stored in HttpOnly cookies (`credentials: 'include'` on fetch). Token blacklist in Redis with fail-closed pattern.

### Security Middlewares

- **CORS**: Production uses `ALLOWED_ORIGINS` env var; dev uses localhost defaults
- **Security Headers**: CSP, HSTS (prod), X-Frame-Options: DENY, nosniff
- **Content-Type Validation**: POST/PUT/PATCH must be JSON or form-urlencoded
- **WebSocket Origin Validation**: Checks against allowed origins
- **Rate Limiting**: Billing endpoints protected (5-20/minute depending on endpoint)
- **Input Validation**: `validate_image_url()` blocks SSRF (internal IPs, cloud metadata)

### Production `.env` Requirements

```bash
JWT_SECRET=<32+ char random>
TABLE_TOKEN_SECRET=<32+ char random>
ALLOWED_ORIGINS=https://yourdomain.com
DEBUG=false
ENVIRONMENT=production
COOKIE_SECURE=true
```

---

## RBAC

| Role | Create | Edit | Delete |
|------|--------|------|--------|
| ADMIN | All | All | All |
| MANAGER | Staff, Tables, Allergens, Promotions (own branches) | Same | None |
| KITCHEN | None | None | None |
| WAITER | None | None | None |

### pwaWaiter Pre-Login Flow

Waiters select branch BEFORE login:
1. `GET /api/public/branches` → select branch (no auth)
2. Login → `GET /api/waiter/verify-branch-assignment?branch_id={id}` (must be assigned TODAY)
3. If not assigned → "Acceso Denegado" screen

---

## Key Features

### Table Session Lifecycle

`OPEN` → `PAYING` → `CLOSED`. Once check is requested (PAYING), customers **cannot** create new rounds.
Table codes are alphanumeric (e.g., "INT-01") and NOT unique across branches — `branch_slug` is required. Branch slugs ARE globally unique.

### Shared Cart (pwaMenu)

Cart is **per-device** (not real-time multi-device sync). Each diner manages their own cart locally. All diners' items are combined into one round only when submitted via group confirmation. WebSocket syncs round status, not cart state. Items show who added them (diner name/color).

### Comanda Rápida (pwaWaiter)

Waiter takes orders for customers without phones via compact menu endpoint (`GET /api/waiter/branches/{id}/menu`, no images).

### PWA & Service Workers

**pwaMenu** caching strategies (Workbox in `vite.config.ts`):
- **CacheFirst**: Images (30d TTL), fonts (1y TTL)
- **NetworkFirst**: API calls with timeout fallback for offline support
- **SPA fallback**: Navigates to `index.html` offline
- Offline-first with local fallback images (`fallback-product.svg`, `default-avatar.svg`)

**pwaWaiter** push notifications:
- `sw-push.js` service worker for background push events
- `pushNotifications.ts` manages subscription via `POST /api/waiter/notifications/subscribe`
- Requires VAPID keys in backend config
- `RetryQueueStore` queues failed operations for retry when connectivity returns
- Sound alerts for service calls and check requests

### Customer Loyalty

Device tracking (Phase 1) → Implicit preferences sync (Phase 2) → Customer opt-in with GDPR consent (Phase 4).

---

## WebSocket Gateway

The ws_gateway (`ws_gateway/` at project root) uses composition and design patterns:

- `connection_manager.py` and `redis_subscriber.py` are thin orchestrators composing modules from `core/`
- `components/` contains modular architecture: auth strategies, broadcast router, event router, rate limiter, circuit breaker
- Both old (`from ws_gateway.components import X`) and new (`from ws_gateway.components.broadcast.router import X`) import paths work
- Authentication via Strategy pattern: `JWTAuthStrategy` for staff, `TableTokenAuthStrategy` for diners
- Sharded locks per branch for high concurrency (400+ users)
- Worker pool broadcast (10 parallel workers, ~160ms for 400 users) with legacy batch fallback (50 per batch)
- Redis Streams consumer for critical events (at-least-once delivery, DLQ for failed messages)

See `ws_gateway/README.md` for architecture details.

---

## Common Issues

### Backend not reloading (Windows)
Windows StatReload may fail. Project uses `watchfiles` but new routes may require manual restart.

### WebSocket disconnects every ~30s
Check JWT token expiration. Refresh the page for a new token. Heartbeat: client pings every 30s, server timeout 60s.

### uvicorn not in PATH (Windows)
Use `python -m uvicorn` instead. WS Gateway requires `$env:PYTHONPATH = "$PWD\backend"`.

### Table status not updating on QR scan
1. Verify `VITE_BRANCH_SLUG` in `pwaMenu/.env` matches DB
2. Check `branch_slug` is passed to session endpoint
3. Verify WS Gateway is running on :8001

### pwaMenu 404 on API calls
Ensure `VITE_API_URL=http://localhost:8000` (no `/api` suffix — the app's API client adds it internally). Also verify `VITE_BRANCH_SLUG` matches the branch slug in the database.

### CORS issues
Dev uses default localhost ports. When adding new origins, update `DEFAULT_CORS_ORIGINS` in `backend/rest_api/main.py` and `ws_gateway/components/core/constants.py`.

---

## AI/RAG Integration (Optional)

Ollama-based chatbot scaffolded for pwaMenu AI assistant. **Not required for core development.**

```bash
# backend/.env — only needed if using AI features
OLLAMA_URL=http://localhost:11434
EMBED_MODEL=nomic-embed-text
CHAT_MODEL=qwen2.5:7b
```

pwaMenu's `AIChat/` component uses `useActionState` with a strategy pattern for response handling (`responseHandlers.ts`). The backend RAG endpoint is optional — the app functions fully without it.

---

## Testing

**Vitest versions**: Dashboard & pwaMenu use Vitest 4.0 | pwaWaiter uses Vitest 3.2

**Frontend tests:**
- `npm test` — watch mode (all frontends)
- `npm run test:run` — single run, CI-friendly (pwaMenu, pwaWaiter)
- `npm run test:coverage` — coverage report (Dashboard, pwaMenu)
- Dashboard: 25 archivos de test (Vitest), ~3.5s. Store tests use Zustand persist migrations with type guards.
- See each sub-project's `CLAUDE.md` for detailed test patterns and hooks.

**Backend tests:**
- Requires PostgreSQL (`menu_ops_test` DB) + Redis running (CI uses `pgvector/pgvector:pg16` + `redis:7-alpine`)
- `cd backend && python -m pytest tests/ -v --tb=short`
- CI env: `ENVIRONMENT=test`, test-specific JWT/table token secrets

**E2E tests**: `cd e2e && npm install && npx playwright test` (Playwright, all 3 frontends)

---

## Rate Limiting Details

| Endpoint | Limit | Notes |
|----------|-------|-------|
| `POST /api/auth/login` | 5/minute | Per-IP + per-email (Redis-backed with Lua scripts) |
| `POST /api/auth/refresh` | 5/minute | Stricter limit for token refresh |
| Billing: check request | 10/minute | Outbox pattern for guaranteed delivery |
| Billing: payment operations | 20/minute | — |
| Billing: critical operations | 5/minute | Most restrictive |
| WebSocket messages | 30/window/connection | Configurable via `WS_MESSAGE_RATE_LIMIT` |
| Login attempts | 5 per 60s window | Configurable via `LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW` env vars |

Rate limiter uses `slowapi` with Redis backend and a `ThreadPoolExecutor` (2 workers) for sync Redis operations. WS Gateway has its own rate limiter component (`ws_gateway/components/`).

---

## Canonical Import Paths

```python
# Backend
from shared.infrastructure.db import get_db, SessionLocal, safe_commit
from shared.config.settings import settings
from shared.config.logging import get_logger
from shared.security.auth import current_user_context, verify_jwt
from shared.infrastructure.events import get_redis_pool, publish_event
from shared.utils.exceptions import NotFoundError, ForbiddenError, ValidationError
from shared.utils.admin_schemas import CategoryOutput, ProductOutput
from shared.config.constants import Roles, RoundStatus, MANAGEMENT_ROLES
from rest_api.models import Product, Category, Round
from rest_api.services.domain import ProductService, CategoryService
from rest_api.services.crud import TenantRepository, BranchRepository
from rest_api.services.crud.soft_delete import soft_delete
from rest_api.services.permissions import PermissionContext
from rest_api.services.events.outbox_service import write_billing_outbox_event

# WebSocket Gateway
from ws_gateway.components.core.constants import WSCloseCode, WSConstants
from ws_gateway.components.broadcast.router import BroadcastRouter
from ws_gateway.core.connection import ConnectionLifecycle, ConnectionBroadcaster
```

---

## Governance

This project uses IA-Native governance with Policy Tickets. Before modifying any domain, check the corresponding autonomy level:

- **CRITICO** (Auth, Billing, Allergens, Staff): Analysis only, no production code changes
- **ALTO** (Products, WebSocket, Rate Limiting): Propose changes, wait for human review
- **MEDIO** (Orders, Kitchen, Waiter, Tables, Customer): Implement with checkpoints
- **BAJO** (Categories, Sectors, Recipes, Ingredients, Promotions): Full autonomy if tests pass

Complete user story backlog: [proyehisto0.md](proyehisto0.md) | Gap-focused backlog: [proyehisto1.md](proyehisto1.md) | Implementation prompts: [prompt00.md](prompt00.md)

---

## CI/CD & Infrastructure

**GitHub Actions** (`.github/workflows/`):
- `ci.yml`: Runs on push/PR to main/develop. 4 parallel jobs: backend (pytest + PostgreSQL + Redis), Dashboard (lint + type-check + test + build), pwaMenu (lint + type-check + test + build), pwaWaiter (lint + type-check + test + build).
- `docker-build.yml`: Validates Docker image builds on backend/ws_gateway/devOps changes.

**Database Migrations**: Alembic configured in `backend/alembic/`. The `env.py` imports all models from `rest_api.models.Base` and reads `DATABASE_URL` from `shared.config.settings`. No `sqlalchemy.url` in `alembic.ini` — it's loaded dynamically. Migration chain: `None → 001 → ... → 014 → 015 → 016` (16 migrations, no gaps). 013 = round item void fields, 014 = manager override table, 015 = TOTP encrypted column, 016 = 2FA backup codes.

**Backups**: `devOps/backup/` contains `backup.sh` (PostgreSQL dump + Redis AOF → .tar.gz with rotation: 7 daily, 4 weekly) and `restore.sh` (interactive restore with health check verification).

**Horizontal Scaling**: `devOps/docker-compose.prod.yml` overlay adds nginx load balancer, 2x backend replicas, 2x ws_gateway replicas, Redis Sentinel. WebSocket requires `ip_hash` sticky sessions in nginx because ConnectionManager keeps connections in-memory per instance. See `devOps/SCALING.md`.

**Secrets**: `devOps/docker-compose.yml` uses `${VAR:-default}` syntax. Development works without `.env` file. Production requires `devOps/.env` with strong secrets. See `devOps/.env.example`.

**Knowledge Base**: `knowledge-base/` v4 — 35 docs in 7 carpetas: `01-negocio/`, `02-arquitectura/`, `03-seguridad/`, `04-infraestructura/`, `05-dx/`, `06-estado-del-proyecto/`, `07-anexos/`. See `knowledge-base/README.md` for navigation.

**Design Patterns**: `UsadoPatrones.md` documents all 57 design patterns found across backend, ws_gateway, and the 3 frontends (GoF, DDD, modern React/Python patterns with file paths and code evidence).

**E2E Tests**: `e2e/` contains Playwright config + tests for all 3 frontends. Run: `cd e2e && npx playwright test` (requires `npm install` first).

**OpenAPI Codegen**: `scripts/generate-types.sh` fetches OpenAPI spec from running backend and generates TypeScript types for all frontends.

---

## Key Architectural Decisions

- **Product availability vs active**: `BranchProduct.is_available` (kitchen toggle, runtime) is different from `is_active` (soft delete, permanent). Both must be checked in menu queries.
- **Event catch-up**: After WS reconnect, all 3 frontends call catch-up endpoints. Staff: `GET /ws/catchup?branch_id=&since=&token=` (JWT). Diners: `GET /ws/catchup/session?session_id=&since=&table_token=`. Redis sorted set, 100 events, 5-min TTL.
- **Shared WebSocket client**: `shared/websocket-client.ts` — `BaseWebSocketClient` abstract class. Subclasses: `DashboardWebSocket`, `DinerWebSocket`, `WebSocketService`. All 3 frontends extend `BaseWebSocketClient` — Dashboard and pwaWaiter import via the `@shared` alias; pwaMenu uses a relative path (`../../../shared/websocket-client`) to the same module. Path style is inconsistent (alias vs relative); the class itself is unified.
- **Payment gateway**: `PaymentGateway` ABC in `backend/rest_api/services/payments/gateway.py`. `MercadoPagoGateway` is the current implementation. Billing router uses the abstraction (no inline MP code).
- **Redis menu cache**: Public menu cached per branch slug (`cache:menu:{slug}`), 5-min TTL. Auto-invalidated on product/category CRUD and availability toggles. Module: `shared/infrastructure/cache/menu_cache.py`.
- **AFIP fiscal**: `_call_afip_wsfe()` is a **STUB** returning simulated CAE. Production requires `pyafipws` + AFIP certificates.
- **Dashboard i18n**: 38 pages fully translated (es/en). `react-i18next` with 700+ keys. Language toggle in sidebar.
- **Dashboard**: 38 pages total (including AuditLog, Reservations, Delivery). Each sub-project's `CLAUDE.md` has detailed patterns.
- **Manager overrides**: `ManagerOverride` model for item voids, discounts, payment reversals. `OverrideService` in domain services. Migration 014.
- **Item void**: `RoundItem.is_voided` + `void_reason` fields (migration 013). Void from SUBMITTED/IN_KITCHEN/READY states. Auto-cancels round if all items voided.
- **Receipt printing**: `ReceiptService` generates thermal-printer HTML (kitchen tickets, customer receipts, daily reports). Print buttons in Kitchen + Sales pages.
- **Stock validation**: `round_service.submit_round()` validates inventory before creating items. Returns 409 if insufficient stock.
- **GDPR compliance**: `GET /admin/data-export/customer/{id}` (full export) + `DELETE` (anonymize PII). Buttons in CRM page.
- **Kitchen alerts**: Web Audio API beep + visual flash on ROUND_SUBMITTED. Sound toggle persisted to localStorage.
- **2FA**: TOTP via `pyotp`. Setup/verify/disable endpoints. Conditional TOTP field on login. Settings page section.
- **Email service**: `shared/infrastructure/email/service.py` — SMTP (optional, no-op if unconfigured). Used for reservation confirmations.
- **Idle timeout** (Dashboard only): `useIdleTimeout` hook — warning at 25min, auto-logout at 30min. Skips Kitchen page.
- **Production**: TLS via `devOps/nginx/nginx-ssl.conf` + Let's Encrypt (`devOps/ssl/init-letsencrypt.sh`). Monitoring: Prometheus + Grafana + Loki in `devOps/monitoring/`. Load testing: k6 scripts in `devOps/loadtest/`. Runbook: `devOps/RUNBOOK.md`.
