# AGENTS.md
> Versión model-agnostic de `CLAUDE.md`. Fuente canónica: `CLAUDE.md`. Si modificás uno, actualizás el otro.

## Stack

| Componente | Puerto | Tecnología |
|-----------|--------|-----------|
| backend | 8000 | Python 3.12 + FastAPI 0.115 + SQLAlchemy 2.0 |
| ws_gateway | 8001 | Python + Redis 7 Streams |
| Dashboard | 5177 | React 19.2 + TypeScript 5.9 + Zustand + Vite 7.2 |
| pwaMenu | 5176 | React 19.2 + i18n (es/en/pt) + PWA |
| pwaWaiter | 5178 | React 19.2 + Push Notifications |
| PostgreSQL | 5432 | pgvector/pgvector:pg16 |
| Redis | 6380 | redis:7-alpine |

**Prerrequisitos**: Python 3.12+, Node.js 22+, Docker & Docker Compose
**Variables críticas**: `VITE_API_URL=http://localhost:8000` (sin `/api`), `VITE_WS_URL=ws://localhost:8001`
**pwaMenu extras**: `VITE_BRANCH_SLUG`, `VITE_MP_PUBLIC_KEY`
**Test users**: `admin@demo.com/admin123`, `waiter@demo.com/waiter123`, `kitchen@demo.com/kitchen123`

## Comandos rápidos

```bash
# Backend (Docker - recomendado)
cd devOps && docker compose up -d --build
docker compose logs -f backend ws_gateway

# Frontends
cd Dashboard && npm install && npm run dev    # :5177
cd pwaMenu && npm install && npm run dev      # :5176
cd pwaWaiter && npm install && npm run dev    # :5178

# Tests
cd Dashboard && npm run test:coverage
cd pwaMenu && npm run test:run
cd backend && python -m pytest tests/ -v

# Type check / lint
cd Dashboard && npm run type-check && npm run lint

# Migraciones Alembic
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "describe change"

# DB seed (primera vez)
cd backend && python cli.py db-seed
```

## Modelo de Datos (resumen)

```
Tenant (Restaurant)
  ├── CookingMethod, FlavorProfile, TextureProfile, CuisineType (catálogos)
  ├── IngredientGroup → Ingredient → SubIngredient
  └── Branch (N)
        ├── Category → Subcategory → Product → BranchProduct (precios por sucursal)
        ├── BranchSector → Table → TableSession → Diner → Round → RoundItem → KitchenTicket
        ├── Check (app_check) → Charge → Allocation (FIFO) ← Payment
        └── ServiceCall
User ←→ UserBranchRole (M:N: WAITER/KITCHEN/MANAGER/ADMIN)
Product ←→ ProductAllergen (M:N con presence_type + risk_level)
```

Detalle completo: `knowledge-base/02-arquitectura/02_modelo_de_datos.md`

## Arquitectura Clean (Backend)

```
Router (thin — solo HTTP) → Domain Service (lógica) → Repository (datos) → Model
```

**CRUDFactory is deprecated** → usar `BranchScopedService` o `BaseCRUDService`.

## Reglas Críticas — No Negociables

### Backend
- **NUNCA** `db.commit()` directo → `safe_commit(db)`
- **NUNCA** `Model.is_active == True` → `Model.is_active.is_(True)`
- **NUNCA** lógica de negocio en routers → solo Domain Services
- **SIEMPRE** filtrar por `tenant_id` — sin excepción
- **SIEMPRE** soft delete (`is_active = False`)
- Precios en centavos (int), nunca float
- SQL reserved words: `Check` → `__tablename__ = "app_check"`
- Logger: `get_logger()`, nunca `print()` ni `logging.` directo

### Frontend
- **NUNCA** destructurar store → selectores: `useStore(selectItems)`
- **SIEMPRE** `useShallow` para objetos/arrays en selectores
- **SIEMPRE** `EMPTY_ARRAY` estable como fallback, nunca `?? []` inline
- IDs: `string` en frontend, `number` en backend — convertir en boundary
- Precios: centavos (int) — `12550 = $125.50`
- WebSocket: ref pattern (dos effects), `return unsubscribe` siempre

## Conventions

- **UI language**: Spanish | **Code**: English | **Theme**: Orange (#f97316)
- **IDs**: `crypto.randomUUID()` frontend, `BigIntPK` backend (alias — NO usar `BigInteger` directo)
- **Naming**: Frontend camelCase, backend snake_case
- **pwaMenu i18n**: todo `t()`, zero hardcoded (es/en/pt)
- **Mobile**: `overflow-x-hidden w-full max-w-full` en containers pwaMenu
- **HTTP codes**: POST create → `201`, DELETE → `204` (no `200`)

## Auth (resumen)

| Contexto | Método | Header |
|----------|--------|--------|
| Dashboard, pwaWaiter | JWT (15min access, 7d refresh) | `Authorization: Bearer` |
| pwaMenu diners | Table Token HMAC (3h) | `X-Table-Token` |
| WebSocket | JWT o Table Token | Query `?token=` |

Detalle: `knowledge-base/03-seguridad/01_modelo_de_seguridad.md`

## RBAC

| Role | Create | Edit | Delete |
|------|--------|------|--------|
| ADMIN | All | All | All |
| MANAGER | Staff, Tables, Allergens, Promotions (own branches) | Same | None |
| KITCHEN | None | None | None |
| WAITER | None | None | None |

## Governance

- **CRITICO** (Auth, Billing, Allergens, Staff): analysis only, no code changes
- **ALTO** (Products, WebSocket, Rate Limiting): propose, wait for review
- **MEDIO** (Orders, Kitchen, Waiter, Tables, Customer): implement with checkpoints
- **BAJO** (Categories, Sectors, Recipes, Ingredients, Promotions): full autonomy if tests pass

## Mapa de Navegación — Necesito X → Leer Y

| Necesito... | Leer |
|-------------|------|
| Entender el sistema | `knowledge-base/01-negocio/01_vision_y_contexto.md` |
| Reglas de negocio | `knowledge-base/01-negocio/04_reglas_de_negocio.md` ← SIEMPRE antes de implementar |
| Features por componente | `knowledge-base/01-negocio/03_funcionalidades.md` |
| Flujos y casos de uso | `knowledge-base/01-negocio/05_flujos_y_casos_de_uso.md` |
| Modelo de datos detallado | `knowledge-base/02-arquitectura/02_modelo_de_datos.md` |
| Endpoints API completos | `knowledge-base/02-arquitectura/03_api_y_endpoints.md` |
| Eventos WebSocket / Outbox | `knowledge-base/02-arquitectura/04_eventos_y_websocket.md` |
| Patrones de diseño (57) | `knowledge-base/02-arquitectura/05_patrones_de_diseno.md` |
| ADRs y tradeoffs | `knowledge-base/02-arquitectura/07_decisiones_y_tradeoffs.md` |
| Auth y seguridad completo | `knowledge-base/03-seguridad/01_modelo_de_seguridad.md` |
| Rate limiting detallado | `knowledge-base/03-seguridad/01_modelo_de_seguridad.md` §Rate Limiting |
| Configurar entornos (.env) | `knowledge-base/04-infraestructura/01_configuracion_y_entornos.md` |
| CI/CD y deploy | `knowledge-base/04-infraestructura/03_despliegue.md` |
| Migraciones Alembic | `knowledge-base/04-infraestructura/04_migraciones.md` |
| Integraciones (MP, Ollama, Redis) | `knowledge-base/04-infraestructura/05_integraciones.md` |
| Onboarding rápido | `knowledge-base/05-dx/01_onboarding.md` |
| Trampas conocidas / gotchas | `knowledge-base/05-dx/03_trampas_conocidas.md` |
| Convenciones y estándares | `knowledge-base/05-dx/04_convenciones_y_estandares.md` |
| Workflow de implementación | `knowledge-base/05-dx/05_workflow_implementacion.md` |
| Estrategia de testing | `knowledge-base/05-dx/06_estrategia_testing.md` |
| Imports canónicos (backend) | `knowledge-base/05-dx/08_canonical_imports.md` |
| Patrones React 19 específicos | `knowledge-base/05-dx/09_react19_frontend_patterns.md` |
| Estado del proyecto | `knowledge-base/06-estado-del-proyecto/03_salud_tecnica.md` |
| Qué construir ahora | `openspec/CHANGES.md` |
| Skills disponibles | `.agents/SKILLS.md` |
| Playbooks multi-agente | `playbooks/` |

## Estructura del Repo

```
knowledge-base/     ← documentación del dominio y arquitectura (37 docs)
openspec/           ← SDD: config, changes, specs, CHANGES.md (CLI-driven)
.agents/skills/     ← 35 skills con patterns y templates
playbooks/          ← coordinación multi-agente (5 playbooks)
backend/            ← FastAPI REST API
ws_gateway/         ← WebSocket Gateway
Dashboard/          ← Admin panel (React 19 + Zustand)
pwaMenu/            ← Customer PWA (React 19 + i18n)
pwaWaiter/          ← Waiter PWA (React 19)
devOps/             ← Docker, nginx, monitoring, backups
archive/            ← docs históricos archivados
```

## Delegación a Sub-Agents — Skills Discovery (CRÍTICO)

**Cuando the orchestrator delega un apply (o CUALQUIER trabajo de implementación) a a sub-agent via the Agent tool, el prompt DEBE incluir, al PRINCIPIO y de forma explícita, esta instrucción:**

> **PASO OBLIGATORIO ANTES DE ESCRIBIR CÓDIGO**: Leé `.agents/SKILLS.md`, identificá TODAS las skills aplicables según los tasks del change, y cargá cada `.agents/skills/<skill>/SKILL.md` antes de tocar una sola línea. Aplicá los patterns de cada skill cargada durante TODA la implementación.

**Reglas no negociables**:
- The orchestrator **NO** pre-lista las skills en el prompt — esa decisión es del sub-agent, que lee los tasks y conoce el detalle fino del trabajo.
- The orchestrator **SÍ** indica el path exacto (`.agents/SKILLS.md`) y la obligación de leerlo PRIMERO.
- La instrucción va **al principio del prompt**, no enterrada al final ni mezclada con otro contexto.
- Si el sub-agent vuelve sin haber consultado `.agents/SKILLS.md` → el apply se considera inválido y se relanza.

**Por qué**: sin enforcement, los sub-agents arrancan con contexto vacío y violan convenciones del proyecto (Zustand selectores, Clean Architecture, useActionState, etc).

## Slash Commands disponibles

### Familia OPSX (OpenSpec — change management)

| Comando | Cuándo usarlo |
|---------|---------------|
| `/opsx:propose <name>` | Proponer un nuevo change con todos los artefactos (proposal + design + tasks). Inicio del ciclo. |
| `/opsx:apply <name>` | Implementar las tasks de un change existente. |
| `/opsx:archive <name>` | Archivar un change completado. |
| `/opsx:explore [topic]` | Explorar una idea antes de comprometerse. Modo thinking partner — no genera código. |

### Familia Kiro (workflow alternativo estilo Amazon)

| Comando | Cuándo usarlo |
|---------|---------------|
| `/kiro:spec-init` | Iniciar una spec Kiro para un feature. |
| `/kiro:spec-requirements` | Generar requirements de la spec. |
| `/kiro:spec-design` | Generar el diseño técnico de la spec. |
| `/kiro:spec-tasks` | Generar el plan de tasks de la spec. |
| `/kiro:spec-impl` | Implementar tasks de la spec. |
| `/kiro:spec-status` | Ver el estado actual de la spec. |
| `/kiro:steering` | Gestionar steering docs existentes de `.kiro/steering/`. |
| `/kiro:steering-custom` | Crear un steering doc custom para el proyecto. |
| `/kiro:validate-design` | Validar el diseño de la spec antes de implementar. |
| `/kiro:validate-gap` | Detectar gaps entre spec y código existente. |
| `/kiro:validate-impl` | Validar que la implementación cumple la spec. |

> Ver todos los commands disponibles en `.claude/commands/`.

## Rules

- Never add "Co-Authored-By" or AI attribution to commits. Conventional commits only.
- Never build after changes unless explicitly asked.
- When asking a question, STOP and wait for response.
- Never agree with user claims without verification.
- Never commit or push unless explicitly asked.
- **Al delegar apply/implementación a a sub-agent**: el prompt DEBE indicar explícitamente que lea `.agents/SKILLS.md` y cargue todas las skills aplicables. The orchestrator no pre-lista skills.
