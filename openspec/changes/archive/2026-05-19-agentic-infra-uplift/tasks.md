## 1. Pre-flight — Inventario y mapeo

- [x] 1.1 Listar el contenido completo de `knowledge-base/` y mapear qué archivos existen en cada carpeta (`01-negocio/` a `07-anexos/`)
- [x] 1.2 Mapear cada sección extensa de `CLAUDE.md` (Data Model, Backend Patterns, Frontend Patterns, Canonical Import Paths, Common Issues, Rate Limiting Details, AI/RAG, CI/CD, Key Architectural Decisions, WebSocket/Outbox) a un archivo destino en `knowledge-base/` (crear nombre si no existe)
- [x] 1.3 Generar lista enumerada de los archivos `.md` legacy del root (~30) con tamaño y fecha de última modificación
- [x] 1.4 Identificar archivos basura del root (`~$todo.docx`, `c:UsersAdminDesktop*`) y marcarlos para eliminación directa
- [x] 1.5 Inventariar contenido de `.agent/artifacts/` y `.agent/skills/`; comparar con `.agents/` para detectar duplicados puros vs contenido único
- [x] 1.6 Scan inicial de enlaces internos (`.md → .md`) en `README.md`, `knowledge-base/`, sub-project `CLAUDE.md` para tener baseline antes de mover archivos

## 2. Crear estructura de archive y roadmap

- [x] 2.1 Crear directorio `archive/legacy-docs/2026-05-19/`
- [x] 2.2 Crear `archive/legacy-docs/2026-05-19/INDEX.md` vacío con cabecera y formato de tabla
- [x] 2.3 Crear directorio `archive/agent-artifacts/2026-05-19/` (vacío por ahora; se poblará en sección 7 si aplica)
- [x] 2.4 Crear `openspec/CHANGES.md` raíz con secciones "Activos", "Próximos", "Backlog", "Cómo se actualiza"
- [x] 2.5 Agregar `agentic-infra-uplift` como primer entry en "Activos" de `openspec/CHANGES.md` con link a `openspec/changes/agentic-infra-uplift/`

## 3. Migrar contenido inline de CLAUDE.md a knowledge-base/

- [x] 3.1 Extraer sección "Data Model" → `knowledge-base/02-arquitectura/02_modelo_de_datos.md` ya cubre todo; contenido preexistente superior, sin merge necesario
- [x] 3.2 Extraer "Clean Architecture (Backend)" + "Backend API Structure" + "WebSocket Events" + "Outbox Pattern" → ya en `02-arquitectura/01_arquitectura_general.md`, `03_api_y_endpoints.md`, `04_eventos_y_websocket.md`
- [x] 3.3 Extraer "Core Patterns → Backend Patterns" → ya en `05-dx/04_convenciones_y_estandares.md` sección 4 (completo con código)
- [x] 3.4 Extraer "Core Patterns → Frontend Patterns" → Zustand/WebSocket/mount guard en `04_convenciones_y_estandares.md`; React 19 específico → creado `05-dx/09_react19_frontend_patterns.md`
- [x] 3.5 Extraer "Canonical Import Paths" → creado `knowledge-base/05-dx/08_canonical_imports.md`
- [x] 3.6 Extraer "Common Issues" → ya cubierto en `05-dx/03_trampas_conocidas.md` (más completo que la versión en CLAUDE.md)
- [x] 3.7 Extraer "Rate Limiting Details" → ya en `03-seguridad/01_modelo_de_seguridad.md` sección Rate Limiting
- [x] 3.8 Extraer "AI/RAG Integration" → ya en `04-infraestructura/05_integraciones.md` sección Ollama
- [x] 3.9 Extraer "CI/CD & Infrastructure" → ya en `04-infraestructura/03_despliegue.md` (GitHub Actions, Docker, backups, scaling)
- [x] 3.10 Extraer "Key Architectural Decisions" → ya en `02-arquitectura/07_decisiones_y_tradeoffs.md` (23 ADRs)
- [x] 3.11 Extraer "WebSocket Gateway" detallado → ya en `02-arquitectura/04_eventos_y_websocket.md`
- [x] 3.12 Extraer "Security Configuration" detallado → ya en `03-seguridad/01_modelo_de_seguridad.md` (JWT, Table Token, middlewares, production env)
- [x] 3.13 Extraer "Key Features" extenso → ya en `01-negocio/03_funcionalidades.md` y `01-negocio/05_flujos_y_casos_de_uso.md`
- [x] 3.14 Extraer "Testing" detallado → ya en `05-dx/06_estrategia_testing.md`
- [x] 3.15 Verificar que NO se crearon nuevas carpetas top-level dentro de `knowledge-base/` ✓ (solo archivos nuevos bajo `05-dx/`)

## 4. Refactorizar CLAUDE.md raíz como hub navegacional

- [x] 4.1 Reescribir `CLAUDE.md` conservando: Quick Reference (prerequisites, comandos, ports, stack), Project Overview con tabla de componentes, RBAC table, Conventions, Governance, Rules
- [x] 4.2 Agregar tabla "Necesito X → leer Y" mapeando cada contexto de trabajo a su archivo en `knowledge-base/` (cubre todas las extracciones de sección 3)
- [x] 4.3 Agregar sección "Delegación a Sub-Agents — Skills Discovery (CRÍTICO)" con la instrucción literal que el orchestrator debe inyectar y el "por qué"
- [x] 4.4 Agregar sección "Slash Commands disponibles" con `/opsx:{propose,apply,archive,explore}` y `/kiro:{spec-init,spec-requirements,spec-design,spec-tasks,spec-impl,spec-status,steering,steering-custom,validate-design,validate-gap,validate-impl}`
- [x] 4.5 Tamaño final: 11,347 bytes (~11.1KB) ≤ 12KB ✓
- [x] 4.6 Verificado: no quedó contenido extenso inline — solo resúmenes de 1 línea con links a knowledge-base

## 5. Crear AGENTS.md como mirror model-agnostic

- [x] 5.1 Creado `AGENTS.md` raíz con header "> Versión model-agnostic de CLAUDE.md. Fuente canónica: CLAUDE.md. Si modificás uno, actualizás el otro."
- [x] 5.2 Contenido normativo replicado reemplazando "Claude Code" por "the orchestrator" / "the sub-agent" / "the AI assistant"
- [x] 5.3 Paridad verificada: Stack, Comandos, Modelo de Datos, Arquitectura, Reglas Críticas, Conventions, Auth, RBAC, Governance, Mapa de Navegación, Skills Discovery, Slash Commands, Rules
- [x] 5.4 AGENTS.md es mirror funcional de CLAUDE.md — mismo contenido normativo, lenguaje neutral

## 6. Root cleanup — mover legacy docs y borrar basura

- [x] 6.1 Movidos 34 archivos legacy del root a `archive/legacy-docs/2026-05-19/` (32 .md + todo.docx + todo.pdf)
- [x] 6.2 `archive/legacy-docs/2026-05-19/INDEX.md` poblado con una entry por cada archivo movido (nombre + categoría + descripción + referencias entrantes)
- [x] 6.3 Eliminados `~$todo.docx`, `c:UsersAdminDesktopintegradorbackendrest_api__init__.py`, `c:UsersAdminDesktopintegradorpwaMenu.env`
- [x] 6.4 Root verificado: solo `README.md`, `CLAUDE.md`, `AGENTS.md` (no existía `DEVELOPMENT.md`)

## 7. Auditar y consolidar .agent/ → .agents/ (CHECKPOINT con usuario)

- [x] 7.1 Auditoría completada — ver "Pending Checkpoint" en el informe final:
      - `.agent/skills/`: 8 skills (agile-product-owner, clean-architecture, fastapi-code-review, interface-design, pwa-development, redis-best-practices, vercel-react-best-practices, websocket-engineer) — TODAS son duplicados puros de `.agents/skills/` (diff confirmed IDENTICAL)
      - `.agent/artifacts/`: 5 docs únicos (clean_architecture_audit_2026_01.md, fastapi_audit_2026_01.md, pwa_audit_2026_01.md, socketgat_audit_2026_01.md, websocket_audit_2026_01.md)
- [x] 7.2 Reporte presentado al usuario (2026-05-19) → opción aprobada: "Archivar artifacts + eliminar .agent/"
- [x] 7.3 Movidos 5 artifacts únicos a `archive/agent-artifacts/2026-05-19/` (clean_architecture, fastapi, pwa, socketgat, websocket audits)
- [x] 7.4 N/A — los 8 skills de `.agent/skills/` eran duplicados puros de `.agents/skills/` (diff IDENTICAL), nada único que migrar
- [x] 7.5 Directorio `.agent/` eliminado (`rm -rf .agent`)
- [x] 7.6 Verificado: `.agent/` no existe, `.agents/` intacto con 35 skills, 5 artifacts persistidos en archive

## 8. Reparar enlaces internos rotos

- [x] 8.1 Scan ejecutado — encontradas referencias rotas en: `playbooks/README.md`, `playbooks/QUICK_REFERENCE.md`, `playbooks/03-audit.md`, `playbooks/01-nuevo-modulo.md`, `knowledge-base/02-arquitectura/05_patrones_de_diseno.md`, `knowledge-base/07-anexos/02_estructura_del_codigo.md`
- [x] 8.2 Links a archivos movidos actualizados:
      - `misReglas.md` → `knowledge-base/01-negocio/04_reglas_de_negocio.md` (en playbooks)
      - `UsadoPatrones.md` → `archive/legacy-docs/2026-05-19/UsadoPatrones.md` (en knowledge-base)
      - `patronesAusar.md` → `archive/legacy-docs/2026-05-19/patronesAusar.md` (en knowledge-base)
      - Árbol del repo en `07-anexos/02_estructura_del_codigo.md` actualizado para reflejar el root limpio
- [x] 8.3 No hubo links rotos por extracción — CLAUDE.md nuevo usa tabla de navegación, no links directos a secciones
- [x] 8.4 Scan post-fix: todos los links críticos en docs vivos apuntan a archivos existentes

## 9. Auditar sub-project CLAUDE.md (sin editarlos)

- [x] 9.1 Leídos `Dashboard/CLAUDE.md` (846 líneas), `pwaMenu/CLAUDE.md` (433 líneas), `pwaWaiter/CLAUDE.md` (251 líneas)
- [x] 9.2 Duplicaciones identificadas: Commands, Stack, Zustand patterns, RBAC — todo ya en root/knowledge-base. Sub-project-specific preservado intacto.
- [x] 9.3 Creado `archive/legacy-docs/2026-05-19/sub-project-claude-md-audit.md` con reporte completo y recomendaciones priorizadas por sub-project
- [x] 9.4 Verificado: sub-project CLAUDE.md NO fueron modificados (solo leídos)

## 10. Verificación final y handoff

- [x] 10.1 `openspec list --json` → `agentic-infra-uplift` aparece (status: in-progress, 49/61 tasks). `openspec/CHANGES.md` lo refleja en "Activos".
- [x] 10.2 Root verificado: solo `AGENTS.md`, `CLAUDE.md`, `README.md` — 3 archivos .md ≤ 5 ✓
- [x] 10.3 Tabla "Necesito X → leer Y" en `CLAUDE.md` cubre 23 entradas mapeando todas las extracciones de sección 3 ✓
- [x] 10.4 `AGENTS.md` en paridad con `CLAUDE.md` — mismo contenido normativo, lenguaje neutral ✓
- [x] 10.5 `.agent/` aún existe — CHECKPOINT pendiente (sección 7.2-7.6). `.agents/skills/` tiene 35 skills ✓
- [x] 10.6 Engram guardado con decisiones y resumen del apply
- [x] 10.7 Próximo paso: resolver checkpoint sección 7 → `/opsx:archive agentic-infra-uplift`
