# Archive — Legacy Docs — 2026-05-19

Archivado durante el change `agentic-infra-uplift` (root cleanup, sección 6).
Todos los archivos fueron movidos desde el root del repositorio.
Nada fue borrado sin auditoría previa — archivado es reversible.

---

## Archivos archivados

| Archivo | Categoría | Descripción | Referencias entrantes |
|---------|-----------|-------------|----------------------|
| `audita14.md` | Auditoría | Auditoría técnica del sistema, versión 14 | Sin referencias entrantes al momento del archivado |
| `auditamayo12.md` | Auditoría | Auditoría técnica de mayo, iteración 12 | Sin referencias entrantes al momento del archivado |
| `auditamayopla1.md` | Auditoría | Auditoría de mayo — planilla 1 | Sin referencias entrantes al momento del archivado |
| `doc.Das.md` | Documentación técnica | Documentación del sub-proyecto Dashboard | Sin referencias entrantes al momento del archivado |
| `docBack.md` | Documentación técnica | Documentación del backend (REST API, FastAPI) | Sin referencias entrantes al momento del archivado |
| `docGateway.md` | Documentación técnica | Documentación del WebSocket Gateway | Sin referencias entrantes al momento del archivado |
| `docMenu.md` | Documentación técnica | Documentación del sub-proyecto pwaMenu | Sin referencias entrantes al momento del archivado |
| `docMozo.md` | Documentación técnica | Documentación del sub-proyecto pwaWaiter | Sin referencias entrantes al momento del archivado |
| `mozo.md` | Documentación técnica | Notas de desarrollo del módulo mozo/waiter | Sin referencias entrantes al momento del archivado |
| `mozo - copia.md` | Documentación técnica | Copia de mozo.md (duplicado) | Sin referencias entrantes al momento del archivado |
| `socketGat.md` | Documentación técnica | Notas de arquitectura del WebSocket Gateway | Sin referencias entrantes al momento del archivado |
| `socketGat - copia.md` | Documentación técnica | Copia de socketGat.md (duplicado) | Sin referencias entrantes al momento del archivado |
| `tablero.md` | Documentación técnica | Notas del tablero/Dashboard admin | Sin referencias entrantes al momento del archivado |
| `stockIm.md` | Documentación técnica | Notas sobre implementación de stock/inventario | Sin referencias entrantes al momento del archivado |
| `trabajoRedis.md` | Documentación técnica | Notas de trabajo con Redis (cache, Pub/Sub) | Sin referencias entrantes al momento del archivado |
| `compartidoSha.md` | Documentación técnica | Notas del módulo shared (shared/) | Sin referencias entrantes al momento del archivado |
| `menu.md` | Documentación técnica | Notas del menú público (pwaMenu) | Sin referencias entrantes al momento del archivado |
| `api.md` | Documentación técnica | Documentación de la API REST (draft) | Sin referencias entrantes al momento del archivado |
| `api-ms.md` | Documentación técnica | Documentación de microservicios API | Sin referencias entrantes al momento del archivado |
| `arquitectura.md` | Documentación técnica | Notas de arquitectura general del sistema | Sin referencias entrantes al momento del archivado |
| `faltaPatrones.md` | Patrones / TODOs | Lista de patrones de diseño pendientes de implementar | Sin referencias entrantes al momento del archivado |
| `patronesAusar.md` | Patrones / TODOs | Patrones de diseño a usar en el proyecto | Sin referencias entrantes al momento del archivado |
| `misReglas.md` | Reglas / Convenciones | Reglas personales/de equipo para el desarrollo | Sin referencias entrantes al momento del archivado |
| `prom3.md` | Prompts | Prompt de IA versión 3 para el proyecto | Sin referencias entrantes al momento del archivado |
| `promIniciarBase.md` | Prompts | Prompt para iniciar la base del proyecto desde cero | Sin referencias entrantes al momento del archivado |
| `prompt00.md` | Prompts | Prompt de implementación principal (referenced in root CLAUDE.md pre-refactor) | Referenciado en CLAUDE.md pre-refactor — link obsoleto tras refactor |
| `prompt_knowledge_base_v2.md` | Prompts | Prompt para construir la knowledge-base v2 | Sin referencias entrantes al momento del archivado |
| `proyehisto0.md` | Backlog | Backlog completo de user stories del proyecto | Referenciado en CLAUDE.md pre-refactor — link obsoleto tras refactor |
| `proyehisto1.md` | Backlog | Backlog gap-focused del proyecto | Referenciado en CLAUDE.md pre-refactor — link obsoleto tras refactor |
| `UsadoPatrones.md` | Patrones | Catálogo de los 57 patrones de diseño usados en el proyecto | Referenciado en CLAUDE.md pre-refactor — link obsoleto tras refactor |
| `Usepatrones.md` | Patrones | Variante/copia de UsadoPatrones.md | Sin referencias entrantes al momento del archivado |
| `ARQUITECTURA_PWAMENU.md` | Documentación técnica | Arquitectura específica del sub-proyecto pwaMenu | Sin referencias entrantes al momento del archivado |
| `todo.docx` | TODOs | Lista de TODOs en formato Word | Sin referencias entrantes al momento del archivado |
| `todo.pdf` | TODOs | Lista de TODOs en formato PDF | Sin referencias entrantes al momento del archivado |

---

## Archivos eliminados (basura obvia — no archivados)

| Archivo | Razón |
|---------|-------|
| `~$todo.docx` | Lock file temporal de Microsoft Word — sin contenido real |
| `c:UsersAdminDesktopintegradorbackendrest_api__init__.py` | Path Windows malformado como nombre de archivo — no es un archivo válido |
| `c:UsersAdminDesktopintegradorpwaMenu.env` | Path Windows malformado como nombre de archivo — no es un archivo válido |

---

## Subdirectorios archivados

Ninguno en esta iteración. Los subdirectorios del root (backend/, Dashboard/, pwaMenu/, etc.) se conservan tal cual.

---

## Notas de auditoría

- Archivado realizado: 2026-05-19
- Change: `agentic-infra-uplift`
- Ejecutado por: Claude Code (sub-agent apply)
- Reversible: sí — `git restore .` antes del commit
