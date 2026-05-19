> Creado: 2026-04-04 | Actualizado: 2026-04-05 | Estado: vigente

# Estructura del Codigo

## Vista General del Monorepo

El proyecto Integrador / Buen Sabor es un **monorepo** que contiene 4 aplicaciones frontend, 1 API REST, 1 Gateway WebSocket y la infraestructura de despliegue. Cada componente es independiente pero comparte convenciones y un modulo `shared/` en el backend.

```
Jr-main/
├── backend/                          # Backend Python (REST API)
├── ws_gateway/                       # WebSocket Gateway (en raiz del proyecto)
├── Dashboard/                        # Panel de Administracion (React 19)
├── pwaMenu/                          # PWA del Cliente/Comensal (React 19)
├── pwaWaiter/                        # PWA del Mozo (React 19)
├── devOps/                           # Infraestructura Docker
├── .devcontainer/                    # VSCode DevContainer
├── knowledge-base/                   # Documentacion del sistema
├── CLAUDE.md                         # Hub navegacional del proyecto (~11KB)
├── AGENTS.md                         # Mirror model-agnostic de CLAUDE.md
├── README.md                         # README general
├── archive/legacy-docs/2026-05-19/   # Docs historicos archivados (proyehisto*, prompt00*, doc*.md, etc.)
└── openspec/CHANGES.md               # Roadmap de changes (entry point OPSX)
```

---

## Backend (backend/)

El backend implementa Clean Architecture con FastAPI, PostgreSQL y Redis.

```
backend/
├── rest_api/                         # Aplicacion REST API
│   ├── main.py                       # App FastAPI, middlewares, CORS
│   ├── seed.py                       # Datos semilla para la BD (41KB)
│   ├── core/                         # Nucleo de la aplicacion (startup, etc.)
│   │
│   ├── models/                       # Modelos SQLAlchemy 2.0 (18 archivos)
│   │   ├── tenant.py                 # Tenant (restaurante), Branch (sucursal)
│   │   ├── menu.py                   # Category, Subcategory, Product
│   │   ├── allergen.py               # Allergen, ProductAllergen, CrossReaction
│   │   ├── table.py                  # Table, TableSession, Diner
│   │   ├── round.py                  # Round, RoundItem
│   │   ├── kitchen.py                # KitchenTicket, KitchenTicketItem
│   │   ├── billing.py                # Check (app_check), Charge, Allocation, Payment
│   │   ├── user.py                   # User, UserBranchRole
│   │   ├── sector.py                 # BranchSector, WaiterSectorAssignment
│   │   ├── promotion.py              # Promotion, PromotionBranch, PromotionItem
│   │   ├── recipe.py                 # Recipe, Ingredient, SubIngredient
│   │   ├── outbox.py                 # OutboxEvent (transactional outbox)
│   │   ├── audit.py                  # AuditLog, AuditMixin
│   │   ├── customer.py               # Customer (loyalty)
│   │   ├── service_call.py           # ServiceCall
│   │   ├── inventory.py              # StockItem, StockMovement, StockAlert, Supplier, PurchaseOrder, etc.
│   │   ├── cash_register.py          # CashRegister, CashSession, CashMovement
│   │   ├── tip.py                    # Tip, TipDistribution, TipPool
│   │   ├── fiscal.py                 # FiscalPoint, FiscalInvoice, CreditNote
│   │   ├── scheduling.py             # Shift, ShiftTemplate, ShiftTemplateItem, AttendanceLog
│   │   ├── crm.py                    # CustomerProfile, CustomerVisit, LoyaltyTransaction, LoyaltyRule
│   │   ├── floor_plan.py             # FloorPlan, FloorPlanTable
│   │   ├── reservation.py            # Reservation
│   │   ├── delivery.py               # DeliveryOrder, DeliveryOrderItem
│   │   └── __init__.py               # Re-exporta todos los modelos
│   │
│   ├── routers/                      # Controladores HTTP (delgados)
│   │   ├── auth.py                   # /api/auth/* (login, refresh, logout, me)
│   │   ├── admin/                    # /api/admin/* (CRUD administrativo)
│   │   │   └── reports.py            # /api/admin/reports/* (estadisticas)
│   │   ├── waiter.py                 # /api/waiter/* (operaciones del mozo)
│   │   ├── diner.py                  # /api/diner/* (operaciones del comensal)
│   │   ├── kitchen.py                # /api/kitchen/* (operaciones de cocina)
│   │   ├── billing.py                # /api/billing/* (pagos y facturacion)
│   │   ├── public.py                 # /api/public/* (sin autenticacion)
│   │   ├── recipes.py                # /api/recipes/* (recetas)
│   │   └── customer.py               # /api/customer/* (fidelizacion)
│   │
│   ├── services/                     # Capa de servicios
│   │   ├── domain/                   # Servicios de dominio (logica de negocio)
│   │   │   ├── __init__.py           # Re-exporta todos los servicios
│   │   │   ├── category_service.py   # CRUD de categorias
│   │   │   ├── subcategory_service.py
│   │   │   ├── branch_service.py     # Gestion de sucursales
│   │   │   ├── sector_service.py     # Sectores del salon
│   │   │   ├── table_service.py      # Gestion de mesas
│   │   │   ├── product_service.py    # Productos y precios
│   │   │   ├── allergen_service.py   # Alergenos
│   │   │   ├── staff_service.py      # Personal y roles
│   │   │   ├── promotion_service.py  # Promociones
│   │   │   ├── round_service.py      # Rondas de pedidos
│   │   │   ├── billing_service.py    # Facturacion y pagos
│   │   │   ├── diner_service.py      # Comensales
│   │   │   ├── service_call_service.py # Llamadas de servicio
│   │   │   ├── ticket_service.py     # Tickets de cocina
│   │   │   └── inventory_service.py  # Inventario y costos
│   │   │
│   │   ├── crud/                     # Patron Repository
│   │   │   ├── repository.py         # TenantRepository, BranchRepository
│   │   │   └── soft_delete.py        # cascade_soft_delete()
│   │   │
│   │   ├── events/                   # Servicios de eventos
│   │   │   └── outbox_service.py     # write_billing_outbox_event()
│   │   │
│   │   ├── payments/                 # Abstraccion de pagos
│   │   │   ├── gateway.py            # PaymentGateway ABC
│   │   │   ├── mercadopago_gateway.py # MercadoPagoGateway
│   │   │   └── __init__.py
│   │   │
│   │   ├── permissions.py            # PermissionContext (Strategy Pattern)
│   │   └── base_service.py           # BaseCRUDService, BranchScopedService
│   │
│   ├── seeds/                        # Datos semilla modulares
│   │   ├── tenants.py
│   │   ├── users.py
│   │   ├── allergens.py
│   │   ├── menu.py
│   │   └── tables.py
│   │
│   └── repositories/                 # Repositorios adicionales
│
├── shared/                           # Modulo compartido (REST API + WS Gateway)
│   ├── config/
│   │   ├── settings.py               # Pydantic Settings (lectura de .env)
│   │   ├── constants.py              # Roles, RoundStatus, MANAGEMENT_ROLES, ORDERABLE
│   │   └── logging.py               # Configuracion de logging centralizado
│   ├── infrastructure/
│   │   ├── db.py                     # get_db(), safe_commit(), SessionLocal
│   │   └── events.py                 # get_redis_pool(), publish_event()
│   ├── security/
│   │   └── auth.py                   # current_user_context(), verify_jwt()
│   └── utils/
│       ├── exceptions.py             # NotFoundError, ForbiddenError, ValidationError
│       ├── admin_schemas.py          # Schemas Pydantic de salida
│       └── validators.py             # validate_image_url(), escape_like_pattern()
│
├── alembic/                          # Migraciones de base de datos
│   ├── env.py                        # Configuracion (importa modelos, lee DATABASE_URL)
│   └── versions/                     # 11 migraciones (001-011)
│
├── tests/                            # Tests del backend (20 archivos)
│   ├── test_auth.py                  # Tests de autenticacion
│   ├── test_billing.py               # Tests de facturacion
│   ├── test_rounds.py                # Tests de rondas
│   ├── conftest.py                   # Fixtures compartidos
│   └── ...
│
├── Dockerfile                        # Imagen Docker del backend
├── requirements.txt                  # Dependencias Python
├── pytest.ini                        # Configuracion de pytest
├── cli.py                            # Utilidades CLI (db-seed, etc.)
└── .env.example                      # Variables de entorno de ejemplo
```

---

## WebSocket Gateway (ws_gateway/)

El Gateway WebSocket vive en la **raiz del proyecto** (no dentro de `backend/`), pero comparte el modulo `shared/` del backend. Requiere `PYTHONPATH=backend` para importar correctamente.

```
ws_gateway/
├── main.py                           # App FastAPI, 4 endpoints WebSocket
├── connection_manager.py             # Fachada orquestadora (composicion)
├── redis_subscriber.py               # Suscriptor Redis Pub/Sub + Circuit Breaker
│
├── core/                             # Modulos internos del manager
│   ├── connection/                   # Gestion de conexiones
│   │   ├── lifecycle.py              # ConnectionLifecycle (accept/disconnect)
│   │   ├── broadcaster.py            # ConnectionBroadcaster (worker pool)
│   │   ├── cleanup.py                # ConnectionCleanup (stale, dead, locks)
│   │   ├── index.py                  # ConnectionIndex (indices multidimensionales)
│   │   └── stats.py                  # ConnectionStats (metricas)
│   └── subscriber/                   # Procesamiento de mensajes
│       ├── processor.py              # Procesador de mensajes Redis
│       ├── validator.py              # Validacion de eventos
│       └── drop_tracker.py           # Tracking de mensajes descartados
│
├── components/                       # Componentes modulares
│   ├── auth/
│   │   └── strategies.py             # JWT, TableToken, Composite, Null auth
│   ├── broadcast/
│   │   └── router.py                 # BroadcastRouter (estrategias de difusion)
│   ├── connection/
│   │   ├── index.py                  # Indice de conexiones
│   │   ├── locks.py                  # Sharded locks por sucursal
│   │   ├── heartbeat.py              # Heartbeat manager
│   │   └── rate_limiter.py           # Rate limiter por conexion
│   ├── endpoints/
│   │   └── handlers.py               # Handlers: Waiter, Kitchen, Admin, Diner
│   ├── events/
│   │   └── router.py                 # EventRouter (routing por tipo y rol)
│   ├── resilience/
│   │   ├── circuit_breaker.py        # CircuitBreaker (CLOSED->OPEN->HALF_OPEN)
│   │   └── retry.py                  # Retry con backoff
│   ├── metrics/
│   │   ├── prometheus.py             # Metricas Prometheus
│   │   └── collector.py              # Colector de metricas
│   ├── data/
│   │   └── sector_repository.py      # SectorRepository con cache (5 min TTL)
│   └── redis/
│       └── lua_scripts.py            # Scripts Lua para operaciones atomicas
│
├── README.md                         # Documentacion del gateway
└── arquiws_gateway.md                # Documento de arquitectura detallado
```

---

## Dashboard (Dashboard/)

Panel de administracion para gestion multi-sucursal. 34 paginas, 22 stores Zustand.

```
Dashboard/
├── src/
│   ├── App.tsx                       # Router principal, paginas lazy
│   ├── main.tsx                      # Entry point, PWA, WebVitals
│   │
│   ├── pages/                        # 34 paginas del panel
│   │   ├── DashboardPage.tsx         # Vista principal con metricas
│   │   ├── CategoriesPage.tsx        # CRUD de categorias
│   │   ├── ProductsPage.tsx          # CRUD de productos
│   │   ├── TablesPage.tsx            # Gestion de mesas
│   │   ├── BranchesPage.tsx          # Gestion de sucursales
│   │   ├── StaffPage.tsx             # Gestion de personal
│   │   ├── SectorsPage.tsx           # Sectores del salon
│   │   ├── AllergensPage.tsx         # Alergenos
│   │   ├── PromotionsPage.tsx        # Promociones
│   │   ├── OrdersPage.tsx            # Pedidos en tiempo real
│   │   ├── Kitchen.tsx               # Vista de cocina (3 columnas)
│   │   ├── Sales.tsx                 # Estadisticas de ventas
│   │   ├── BillingPage.tsx           # Facturacion
│   │   ├── Inventory.tsx             # Inventario y stock
│   │   ├── Suppliers.tsx             # Proveedores
│   │   ├── CashRegister.tsx          # Cierre de caja
│   │   ├── Tips.tsx                  # Propinas y distribucion
│   │   ├── Fiscal.tsx                # Facturacion electronica AFIP
│   │   ├── Scheduling.tsx            # Turnos y horarios
│   │   ├── CRM.tsx                   # CRM de clientes
│   │   ├── FloorPlan.tsx             # Plan de piso visual
│   │   └── ...                       # Recetas, ingredientes, etc.
│   │
│   ├── components/
│   │   ├── layout/                   # Layout, Sidebar, Header
│   │   ├── auth/                     # ProtectedRoute (guard de rutas)
│   │   ├── ui/                       # Componentes reutilizables
│   │   │   ├── Modal.tsx             # Modal generico
│   │   │   ├── Button.tsx            # Boton con variantes
│   │   │   ├── Input.tsx             # Input con validacion
│   │   │   ├── DataTable.tsx         # Tabla de datos con paginacion
│   │   │   ├── ConfirmDialog.tsx     # Dialogo de confirmacion
│   │   │   └── ...
│   │   └── tables/                   # Componentes especificos de mesas
│   │       ├── SectorModal.tsx       # Modal de sectores
│   │       ├── SessionDetailModal.tsx # Detalle de sesion
│   │       └── BulkTableModal.tsx    # Creacion masiva de mesas
│   │
│   ├── stores/                       # 22 stores Zustand
│   │   ├── authStore.ts              # Autenticacion y sesion
│   │   ├── branchStore.ts            # Sucursales y seleccion activa
│   │   ├── categoryStore.ts          # Categorias
│   │   ├── productStore.ts           # Productos
│   │   ├── tableStore.ts             # Mesas y sesiones
│   │   ├── staffStore.ts             # Personal
│   │   ├── orderStore.ts             # Pedidos
│   │   ├── billingStore.ts           # Facturacion
│   │   └── ...                       # Sectores, alergenos, promociones, etc.
│   │
│   ├── hooks/                        # Custom hooks
│   │   ├── useFormModal.ts           # Modal + form state en un solo hook
│   │   ├── useConfirmDialog.ts       # Confirmacion de acciones destructivas
│   │   ├── usePagination.ts          # Paginacion
│   │   └── ...
│   │
│   ├── services/
│   │   ├── api.ts                    # Cliente REST con retry y 401 handling
│   │   └── websocket.ts             # Servicio WebSocket admin (610+ lineas)
│   │
│   ├── i18n/                         # Internacionalizacion (parcial)
│   │   ├── index.ts                  # Configuracion i18next
│   │   └── locales/
│   │       ├── es.json               # Espanol
│   │       └── en.json               # Ingles
│   │
│   ├── types/                        # Interfaces TypeScript
│   ├── utils/                        # Validacion, logger, theme, sanitizacion
│   └── config/
│       └── env.ts                    # Configuracion de entorno
│
├── CLAUDE.md                         # Guia especifica del Dashboard
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## pwaMenu (pwaMenu/)

PWA del cliente/comensal. Menu compartido, carrito colaborativo, i18n (es/en/pt), 52 componentes.

```
pwaMenu/
├── src/
│   ├── App.tsx                       # Router (Home, CloseTable, PaymentResult)
│   │
│   ├── pages/                        # Paginas principales
│   │   ├── Home.tsx                  # Pagina principal del menu
│   │   ├── CloseTable.tsx            # Cierre de mesa y pago
│   │   └── PaymentResult.tsx         # Resultado de pago (MP callback)
│   │
│   ├── components/ (52 archivos)
│   │   ├── Header.tsx                # Cabecera con info de sesion
│   │   ├── BottomNav.tsx             # Navegacion inferior movil
│   │   ├── HamburgerMenu.tsx         # Menu lateral
│   │   ├── CategoryTabs.tsx          # Pestanas de categorias
│   │   ├── ProductCard.tsx           # Tarjeta de producto (lazy)
│   │   ├── ProductDetailModal.tsx    # Detalle de producto (lazy)
│   │   ├── SharedCart.tsx            # Carrito compartido (lazy)
│   │   ├── cart/                     # Subcomponentes del carrito
│   │   │   ├── CartItem.tsx
│   │   │   ├── CartSummary.tsx
│   │   │   └── CartActions.tsx
│   │   ├── JoinTable/               # Unirse a mesa
│   │   │   ├── JoinTableFlow.tsx
│   │   │   ├── QRScanner.tsx
│   │   │   └── NameInput.tsx
│   │   ├── QRSimulator.tsx           # Simulador QR para desarrollo
│   │   ├── close-table/ (11 componentes)
│   │   │   ├── CloseTableFlow.tsx
│   │   │   ├── BillSummary.tsx
│   │   │   ├── PaymentMethodSelector.tsx
│   │   │   ├── SplitBillOptions.tsx
│   │   │   └── ...
│   │   ├── AIChat/                   # Chat con IA (lazy, experimental)
│   │   │   ├── AIChatModal.tsx
│   │   │   └── AIChatMessages.tsx
│   │   └── ui/                       # Componentes base
│   │       ├── Modal.tsx
│   │       ├── LoadingSpinner.tsx
│   │       └── ...
│   │
│   ├── stores/
│   │   ├── tableStore/               # Store modular de mesa
│   │   │   ├── store.ts              # Definicion principal del store
│   │   │   ├── types.ts              # Tipos TypeScript
│   │   │   ├── selectors.ts          # Selectores optimizados
│   │   │   └── helpers.ts            # Funciones auxiliares
│   │   ├── menuStore.ts              # Datos del menu
│   │   └── serviceCallStore.ts       # Llamadas de servicio
│   │
│   ├── hooks/ (24 custom hooks)
│   │   ├── useTableSession.ts        # Gestion de sesion
│   │   ├── useCart.ts                 # Operaciones del carrito
│   │   ├── useOptimisticCart.ts       # Cart optimista con React 19 useOptimistic
│   │   ├── useMenu.ts                # Carga y filtrado del menu
│   │   ├── useWebSocket.ts           # Conexion WS del comensal
│   │   └── ...
│   │
│   ├── services/
│   │   ├── api.ts                    # Cliente REST con deduplicacion
│   │   ├── websocket.ts              # Servicio WS del comensal
│   │   └── mercadoPago.ts            # Integracion Mercado Pago
│   │
│   ├── i18n/                         # Internacionalizacion
│   │   ├── es.json                   # Espanol
│   │   ├── en.json                   # Ingles
│   │   └── pt.json                   # Portugues
│   │
│   ├── types/                        # Interfaces TypeScript
│   ├── constants/                    # Constantes
│   ├── utils/                        # Utilidades
│   └── test/                         # Tests
│
├── CLAUDE.md                         # Guia especifica de pwaMenu
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## pwaWaiter (pwaWaiter/)

PWA del mozo. Gestion de mesas en tiempo real con agrupacion por sector, soporte offline, push notifications.

```
pwaWaiter/
├── src/
│   ├── App.tsx                       # Flujo de autenticacion (pre-login -> login -> main)
│   │
│   ├── pages/
│   │   ├── MainPage.tsx              # Vista principal con mesas por sector
│   │   ├── LoginPage.tsx             # Login del mozo
│   │   ├── PreLoginBranchSelect.tsx  # Seleccion de sucursal PRE-login
│   │   ├── AccessDeniedPage.tsx      # Acceso denegado (sin asignacion)
│   │   └── ...
│   │
│   ├── components/
│   │   ├── TableCard.tsx             # Tarjeta de mesa con estado visual
│   │   ├── TableDetailModal.tsx      # Detalle de mesa (sesion, pedidos)
│   │   ├── AutogestionModal.tsx      # Autogestion del mozo
│   │   ├── ComandaTab.tsx            # Tab de comanda rapida
│   │   ├── StatusBadge.tsx           # Badge de estado (OPEN/PAYING/CLOSED)
│   │   ├── FiscalInvoiceModal.tsx    # Modal de facturacion fiscal
│   │   ├── PWAManager.tsx            # Gestion de instalacion PWA
│   │   ├── OfflineBanner.tsx         # Banner de modo offline
│   │   ├── ConnectionBanner.tsx      # Estado de conexion WS
│   │   └── ui/                       # Componentes base
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       └── ConfirmDialog.tsx
│   │
│   ├── stores/
│   │   ├── authStore.ts              # Autenticacion + pre-login branch
│   │   ├── tablesStore.ts            # Mesas y sesiones (por sector)
│   │   ├── waiterStore.ts            # Estado del mozo
│   │   └── retryQueueStore.ts        # Cola de reintentos offline
│   │
│   ├── services/
│   │   ├── api.ts                    # Cliente REST
│   │   ├── websocket.ts              # Servicio WS del mozo (con event catch-up)
│   │   ├── pushNotifications.ts      # Gestion de push notifications (VAPID)
│   │   └── offline.ts                # Servicio de persistencia offline
│   │
│   ├── utils/
│   │   ├── constants.ts              # Constantes
│   │   ├── format.ts                 # Formateo de datos
│   │   └── logger.ts                 # Logger centralizado
│   │
│   ├── public/
│   │   └── sw-push.js                # Service worker para push notifications
│   │
│   └── test/                         # Tests
│
├── CLAUDE.md                         # Guia especifica de pwaWaiter
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## DevOps e Infraestructura

```
devOps/
├── docker-compose.yml                # Compose principal (todos los servicios)
├── docker-compose.prod.yml           # Overlay de produccion (2x backend, 2x ws, nginx LB, Redis Sentinel)
├── .env.example                      # Variables de entorno para produccion
├── backup/
│   ├── backup.sh                     # Backup PostgreSQL + Redis (rotacion: 7 diarios, 4 semanales)
│   └── restore.sh                    # Restore interactivo con health check
├── grafana/                          # Dashboards de monitoreo Grafana
├── reset_tables.sql                  # Script SQL para limpiar datos de mesas
├── start.sh                          # Script de inicio (Linux/Mac)
├── start.ps1                         # Script de inicio (Windows PowerShell)
└── README.md                         # Documentacion de infraestructura

.devcontainer/                        # Configuracion de VSCode DevContainer
├── Dockerfile                        # Imagen del contenedor de desarrollo
├── docker-compose.dev.yml            # Compose para desarrollo
├── post-create.sh                    # Script post-creacion del contenedor
└── post-start.sh                     # Script post-inicio del contenedor

.github/workflows/
├── ci.yml                            # CI: lint, type-check, test, build (4 jobs paralelos)
└── docker-build.yml                  # Validacion de build de imagenes Docker

e2e/
├── playwright.config.ts              # Configuracion de Playwright
├── package.json
└── tests/
    ├── dashboard/login.spec.ts
    ├── pwa-menu/join-table.spec.ts
    └── pwa-waiter/branch-select.spec.ts

scripts/
└── generate-types.sh                 # OpenAPI → TypeScript types

shared/
├── websocket-client.ts               # Cliente WS compartido (scaffold)
└── ui/
    └── README.md                     # Propuesta de componentes UI compartidos
```

---

## Convenciones de Nombres

| Contexto | Convencion | Ejemplo |
|----------|------------|---------|
| Frontend variables/funciones | camelCase | `branchId`, `handleSubmit()` |
| Backend variables/funciones | snake_case | `branch_id`, `handle_submit()` |
| Modelos SQLAlchemy | PascalCase | `BranchSector`, `RoundItem` |
| Componentes React | PascalCase | `ProductCard.tsx`, `SharedCart.tsx` |
| Stores Zustand | camelCase + "Store" | `authStore.ts`, `tableStore.ts` |
| Servicios de dominio | PascalCase + "Service" | `CategoryService`, `BillingService` |
| Routers FastAPI | snake_case | `auth.py`, `billing.py` |
| Tests backend | test_ prefix | `test_auth.py`, `test_billing.py` |
| Tests frontend | .test.ts suffix | `branchStore.test.ts` |
| Variables de entorno | UPPER_SNAKE_CASE | `JWT_SECRET`, `VITE_API_URL` |
| Migraciones Alembic | NNN_descripcion | `001_initial`, `008_fiscal_tables` |
