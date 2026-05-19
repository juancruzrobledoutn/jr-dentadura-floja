## Why

El proyecto Jrmuela y el proyecto hermano BaseJR comparten la misma infraestructura agentica (35 skills en `.agents/skills/`, 30 skills en `.claude/skills/`, mismo `openspec/config.yaml`, misma estructura `knowledge-base/`, 5 playbooks idénticos), pero Jrmuela perdió en la mudanza componentes clave de orquestación que en BaseJR ya están maduros: un `CLAUDE.md` actúa como monolito de 34KB en lugar de hub navegacional, falta el mirror `AGENTS.md`, falta el roadmap `openspec/CHANGES.md`, falta el enforcement del Sub-Agent Skills Discovery Protocol, el root está saturado con ~30 docs legacy mezclados con artefactos vivos, hay un directorio duplicado `.agent/` vs `.agents/`, y los slash commands existentes (`/opsx:*`, `/kiro:*`) no están documentados. El resultado es que los sub-agents trabajan a ciegas, no cargan skills consistentemente, y los devs/agents nuevos tardan más en orientarse. Ahora es el momento porque el resto del andamiaje agentico ya está en su lugar — solo falta el "pegamento" de orquestación.

## What Changes

- **Refactor `CLAUDE.md`** raíz: monolito 34KB → hub navegacional ~10KB con tabla "Necesito X → leer Y". Mantener stack table, RBAC, governance, conventions, rules. Extraer detalles del modelo de datos, todos los Backend/Frontend Patterns con código, Canonical Import Paths, Common Issues, Rate Limiting Details, AI/RAG, CI/CD, Key Architectural Decisions hacia `knowledge-base/`.
- **Crear `AGENTS.md`** raíz: mirror model-agnostic de `CLAUDE.md` con regla de sync documentada en el header ("Fuente canónica: CLAUDE.md. Si modificás uno, actualizás el otro").
- **Crear `openspec/CHANGES.md`** raíz: roadmap maestro con secciones para changes activos, próximos y backlog, y guía de cómo actualizarlo.
- **Agregar sección "Delegación a Sub-Agents — Skills Discovery (CRÍTICO)"** en `CLAUDE.md` y `AGENTS.md`: enforcement explícito de que el orchestrator DEBE incluir, al principio del prompt de cada Agent tool call para apply/implementación, la instrucción de leer `.agents/SKILLS.md` y cargar skills aplicables ANTES de escribir código.
- **Root cleanup**: mover ~30 archivos legacy a `archive/legacy-docs/2026-05-19/` con `INDEX.md` que catalogue cada archivo. Borrar archivos basura (`~$todo.docx`, paths Windows inválidos como `c:UsersAdminDesktop*`).
- **Resolver duplicado `.agent/` vs `.agents/`**: auditar `.agent/artifacts/` y `.agent/skills/`; consolidar todo en `.agents/` y eliminar `.agent/` si es duplicado puro (caso contrario, documentar y migrar).
- **Documentar slash commands** en `CLAUDE.md`: sección con `/opsx:{propose,apply,archive,explore}` y `/kiro:{spec-*,steering*,validate-*}`, propósito de cada uno y cuándo usarlos.
- **Auditar sub-project CLAUDE.md** (`Dashboard/CLAUDE.md` 846 líneas, `pwaMenu/CLAUDE.md`, `pwaWaiter/CLAUDE.md`): identificar duplicación con el root y proponer extracción (NO reescribir agresivamente en este change — solo audit + recomendaciones).
- **No-goals explícitos**: NO se tocan las 53 specs en `openspec/specs/`, NO se tocan las 35 skills en `.agents/skills/`, NO se tocan las 30 skills en `.claude/skills/`, NO se reorganiza la estructura de `knowledge-base/` (solo se migra contenido faltante), NO se trae el banner FASE 5 ni el directorio `reporte/` de BaseJR (son project-specific de BaseJR).

## Capabilities

### New Capabilities

- `agentic-infrastructure`: orquestación agentica del proyecto — convenciones de docs raíz (`CLAUDE.md`, `AGENTS.md`), roadmap maestro (`openspec/CHANGES.md`), enforcement del Sub-Agent Skills Discovery Protocol, documentación de slash commands, política de root cleanup y de skills directory layout (`.agents/` única ubicación).

### Modified Capabilities

<!-- No existing capability requirements change. The only existing capability is `help-system` which is unrelated to docs/orchestration. -->

## Impact

- **Archivos raíz afectados**: `CLAUDE.md` (refactor masivo, de monolito a hub), `AGENTS.md` (nuevo), `openspec/CHANGES.md` (nuevo), ~30 docs legacy del root (movidos a `archive/legacy-docs/2026-05-19/`).
- **Directorios**: `.agent/` (posible eliminación si es duplicado), `.agents/` (canónico, sin cambios), `archive/legacy-docs/2026-05-19/` (nuevo).
- **knowledge-base/**: se agrega contenido extraído de `CLAUDE.md` en las carpetas existentes (`02-arquitectura/`, `05-dx/`, etc). No se renombran ni reorganizan carpetas.
- **Sub-project docs**: `Dashboard/CLAUDE.md`, `pwaMenu/CLAUDE.md`, `pwaWaiter/CLAUDE.md` reciben auditoría (no edición masiva en este change).
- **APIs / código de aplicación**: cero impacto. No se tocan rutas, modelos, ni código de los 5 sub-proyectos (backend, ws_gateway, Dashboard, pwaMenu, pwaWaiter).
- **Dependencias / build**: cero impacto. No cambian `package.json`, `requirements.txt`, ni Dockerfiles.
- **Governance**: trabajo nivel BAJO/MEDIO según `CLAUDE.md` (developer experience, NO toca dominios CRÍTICO/ALTO). Requiere checkpoints en (a) root cleanup masivo y (b) resolución de `.agent/` vs `.agents/`.
- **Riesgos**: drift entre `CLAUDE.md` extraído y `knowledge-base/` preexistente (mitigación: reconciliar al migrar), enlaces internos rotos en docs que apunten a MDs movidos al archive (mitigación: scan + fix), posible contenido único en `.agent/` no obvio (mitigación: audit antes de borrar).
