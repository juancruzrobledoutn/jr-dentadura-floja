## Context

Jrmuela y BaseJR son dos proyectos hermanos que comparten la misma plantilla agentica: 35 skills en `.agents/skills/` (idénticas), 30 skills en `.claude/skills/` (idénticas), mismo `openspec/config.yaml`, misma estructura `knowledge-base/` (carpetas `01-negocio/` a `07-anexos/`), y los mismos 5 playbooks. Sin embargo, en la mudanza de BaseJR → Jrmuela el "pegamento" de orquestación quedó incompleto:

- `CLAUDE.md` raíz creció a 34KB / ~600 líneas, con todo el contenido inline (modelo de datos, todos los patterns con código, todos los imports canónicos, todas las decisiones arquitectónicas). BaseJR mantiene 9KB / 170 líneas y delega los detalles a `knowledge-base/`.
- No existe `AGENTS.md` raíz (mirror model-agnostic que BaseJR sí mantiene).
- No existe `openspec/CHANGES.md` raíz (roadmap maestro que BaseJR usa como entry point).
- No existe sección explícita de Sub-Agent Skills Discovery Protocol — los sub-agents de Jrmuela trabajan sin enforcement de carga de skills.
- El root tiene ~30 docs legacy (`audita14.md`, `auditamayo12.md`, `doc.Das.md`, `mozo.md`, `tablero.md`, `prompt00.md`, `proyehisto*.md`, `UsadoPatrones.md`, etc) mezclados con artefactos vivos.
- Coexisten `.agent/` (singular, con `artifacts/` y `skills/`) y `.agents/` (plural, con `SKILLS.md` y `skills/`). Solo `.agents/` está en BaseJR.
- Los slash commands `/opsx:*` y `/kiro:*` están presentes en `.claude/commands/` pero `CLAUDE.md` no los documenta.

El código de aplicación (backend, ws_gateway, Dashboard, pwaMenu, pwaWaiter) NO se toca. Este change es 100% developer experience / orquestación agentica.

**Stakeholders**: el dev humano del proyecto, futuros sub-agents de implementación (Claude Code, Codex, Cursor), futuros devs que se incorporen.

**Constraints**:
- No romper enlaces internos en docs preservados.
- Cualquier movimiento de archivos debe ser reversible (archivar, no borrar — excepto basura obvia).
- No tocar `openspec/specs/` (53 specs ya idénticas a BaseJR).
- Compatible con la convención emergente AGENTS.md (model-agnostic).

## Goals / Non-Goals

**Goals:**

- Convertir `CLAUDE.md` raíz en hub navegacional ~10KB con tabla "Necesito X → leer Y", al estilo BaseJR.
- Establecer `AGENTS.md` como mirror canónico model-agnostic, con regla de sync explícita.
- Establecer `openspec/CHANGES.md` como roadmap maestro y entry point único para "qué construyo ahora".
- Forzar (vía documentación normativa) que el orchestrator inyecte el Skills Discovery Protocol en cada delegación de apply/implementación.
- Dejar el root con ≤ 5 MDs vivos (CLAUDE.md, AGENTS.md, README.md, CHANGES.md raíz si aplica, DEVELOPMENT.md si aplica) — el resto archivado.
- Resolver el duplicado `.agent/` vs `.agents/` consolidando en `.agents/`.
- Documentar formalmente los slash commands disponibles.
- Auditar (no reescribir) los sub-project CLAUDE.md para identificar duplicación.

**Non-Goals:**

- NO reorganizar la estructura de `knowledge-base/` (solo migrar contenido faltante a las carpetas existentes).
- NO tocar las 53 specs en `openspec/specs/`.
- NO tocar las 35 skills en `.agents/skills/` ni las 30 skills en `.claude/skills/`.
- NO traer el banner FASE 5 de BaseJR (project-specific de BaseJR).
- NO traer el directorio `reporte/` de BaseJR (project-specific).
- NO adoptar el framing "Starter Kit sin código" (Jrmuela tiene código de aplicación maduro).
- NO reescribir agresivamente los sub-project CLAUDE.md (solo auditoría con recomendaciones para futuros changes).
- NO tocar código de aplicación, dependencias, ni Dockerfiles.

## Decisions

### Decisión 1: Adoptar el modelo "hub navegacional" para CLAUDE.md

`CLAUDE.md` raíz queda como **hub navegacional ~10KB** que mantiene únicamente:

- Quick Reference (prerequisites, comandos de start, test, lint, migraciones, backup, ports, stack).
- Project Overview (tabla de componentes con puertos).
- RBAC table.
- Conventions (UI lang, theme, IDs, prices, naming, etc).
- Governance (autonomy levels).
- **Tabla "Necesito X → leer Y"** que mapea contexto de trabajo → archivo en `knowledge-base/`.
- **Sección "Delegación a Sub-Agents — Skills Discovery (CRÍTICO)"** (decisión 3).
- **Sección "Slash Commands disponibles"** (decisión 4).
- Rules del usuario (de `CLAUDE.md` global) si aplican.

Todo lo demás se extrae a `knowledge-base/`:

- Data Model detallado → `knowledge-base/02-arquitectura/02_modelo_de_datos.md` (crear o actualizar).
- Clean Architecture / Domain Services / Backend Patterns → `knowledge-base/02-arquitectura/03_clean_architecture.md` o `05-dx/04_convenciones_y_estandares.md` (según lo que ya exista).
- Frontend Patterns (Zustand, React 19, WebSocket, async guards) → `knowledge-base/05-dx/` (archivo apropiado).
- Canonical Import Paths → `knowledge-base/05-dx/05_canonical_imports.md`.
- Common Issues → `knowledge-base/07-anexos/01_common_issues.md`.
- Rate Limiting Details → `knowledge-base/03-seguridad/02_rate_limiting.md`.
- AI/RAG Integration → `knowledge-base/02-arquitectura/05_ai_rag.md`.
- CI/CD & Infrastructure → `knowledge-base/04-infraestructura/`.
- Key Architectural Decisions → `knowledge-base/02-arquitectura/06_decisiones_clave.md`.
- WebSocket Gateway / Events / Outbox → `knowledge-base/02-arquitectura/07_websocket_y_eventos.md`.

**Alternativas consideradas:**

- *Mantener CLAUDE.md monolítico, solo agregar tabla de índice* — descartado: no reduce el ruido en contexto del agente cuando solo necesita un patrón específico.
- *Mover todo a `knowledge-base/` y dejar CLAUDE.md con un párrafo de "leé knowledge-base/"* — descartado: el hub debe contener lo que TODOS los agents necesitan en TODA sesión (stack, ports, governance).

**Rationale**: alinear con BaseJR (convención validada en producción) y reducir el "context bloat" del orchestrator. El orchestrator carga CLAUDE.md en cada sesión; los sub-agents cargan solo los archivos de `knowledge-base/` que necesitan para su task.

### Decisión 2: AGENTS.md como mirror model-agnostic

`AGENTS.md` raíz es mirror 1:1 de `CLAUDE.md` pero con:

- Header explícito: `> Fuente canónica: CLAUDE.md. Si modificás uno, actualizás el otro.`
- Sin referencias específicas a "Claude Code" (usar "AI assistant" / "the orchestrator" / "the sub-agent").
- Mismo contenido normativo (governance, conventions, skills discovery protocol, slash commands).

**Alternativas consideradas:**

- *Solo CLAUDE.md, sin AGENTS.md* — descartado: BaseJR ya estableció el patrón y herramientas como Codex/Cursor lo esperan.
- *Symlink o include* — descartado: no portable entre OS, los agents no resuelven symlinks consistentemente; mantener dos copias con regla de sync es más simple.

**Rationale**: convención emergente del ecosistema agentic; bajo costo de mantenimiento (un solo lugar para reflejar cambios, regla escrita en el header).

### Decisión 3: Sub-Agent Skills Discovery Protocol como sección normativa

Agregar en `CLAUDE.md` y `AGENTS.md` una sección titulada **"Delegación a Sub-Agents — Skills Discovery (CRÍTICO)"** con reglas no-negociables:

> Al delegar cualquier task de apply/implementación vía la Agent tool, el orchestrator DEBE incluir, AL PRINCIPIO del prompt del sub-agent, la siguiente instrucción:
>
> "PASO OBLIGATORIO ANTES DE ESCRIBIR CÓDIGO: Leé `.agents/SKILLS.md`, identificá todas las skills aplicables a esta task, y cargá cada `.agents/skills/<skill>/SKILL.md` antes de tocar una sola línea. Aplicá los patterns durante TODA la implementación."
>
> Razón: sin enforcement, los sub-agents arrancan con contexto vacío y se saltan las skills, generando código que viola convenciones del proyecto (Zustand selectores, Clean Architecture, useActionState, etc).

**Alternativas consideradas:**

- *Hook automático* — descartado en este change (fuera de scope; requeriría modificar `.claude/settings.json` con hooks que el harness ejecuta — propuesta para change futuro).
- *Solo en CLAUDE.md sin AGENTS.md* — descartado: AGENTS.md debe reflejar la misma regla normativa.
- *Confiar en que el orchestrator lo recuerde* — descartado: la práctica muestra que sin el texto literal en CLAUDE.md, se omite.

**Rationale**: bajo costo (~30 líneas de doc), alto impacto (consistencia de patterns en todo código generado).

### Decisión 4: Slash commands documentados en CLAUDE.md

Agregar sección "Slash Commands disponibles" listando:

- `/opsx:propose` — crear un change OPSX nuevo (delega a `openspec-propose`).
- `/opsx:apply` — implementar tasks de un change (delega a `openspec-apply-change`).
- `/opsx:archive` — archivar un change completado (delega a `openspec-archive-change`).
- `/opsx:explore` — modo exploración / thinking partner (delega a `openspec-explore`).
- `/kiro:spec-init`, `/kiro:spec-requirements`, `/kiro:spec-design`, `/kiro:spec-tasks`, `/kiro:spec-impl`, `/kiro:spec-status` — workflow Kiro paralelo (alternativa a OPSX para specs estilo Amazon).
- `/kiro:steering`, `/kiro:steering-custom` — gestión de `.kiro/steering/`.
- `/kiro:validate-design`, `/kiro:validate-gap`, `/kiro:validate-impl` — validaciones Kiro.

Para cada uno: propósito en una línea + cuándo usarlo.

**Rationale**: estos commands ya existen en `.claude/commands/` (ventaja de Jrmuela sobre BaseJR); documentarlos los hace descubribles.

### Decisión 5: Root cleanup — archivar, no borrar

Mover los ~30 docs legacy del root a `archive/legacy-docs/2026-05-19/`:

- Lista exacta: `audita14.md`, `auditamayo12.md`, `auditamayopla1.md`, `doc.Das.md`, `docBack.md`, `docGateway.md`, `docMenu.md`, `docMozo.md`, `mozo.md`, `mozo - copia.md`, `tablero.md`, `socketGat.md`, `socketGat - copia.md`, `stockIm.md`, `trabajoRedis.md`, `compartidoSha.md`, `menu.md`, `api.md`, `api-ms.md`, `arquitectura.md`, `faltaPatrones.md`, `patronesAusar.md`, `misReglas.md`, `prom3.md`, `promIniciarBase.md`, `prompt00.md`, `prompt_knowledge_base_v2.md`, `proyehisto0.md`, `proyehisto1.md`, `UsadoPatrones.md`, `Usepatrones.md`, `ARQUITECTURA_PWAMENU.md`, `todo.docx`, `todo.pdf`.
- Generar `archive/legacy-docs/2026-05-19/INDEX.md` catalogando cada archivo: nombre, una línea de qué contiene, fecha si es deducible.
- **Borrar** (no archivar) basura obvia: `~$todo.docx` (lock file de Word), `c:UsersAdminDesktopintegradorbackendrest_api__init__.py` y `c:UsersAdminDesktopintegradorpwaMenu.env` (paths Windows malformados, no son archivos válidos).
- Conservar en root: `README.md`, `CLAUDE.md` (refactorizado), `AGENTS.md` (nuevo). Evaluar si `DEVELOPMENT.md` debe existir.

**Alternativas consideradas:**

- *Borrar directamente* — descartado: pérdida de historia, no reversible.
- *Mover todo a `knowledge-base/07-anexos/`* — descartado: contamina knowledge-base/ con contenido obsoleto; archive/ es el lugar correcto.

**Rationale**: principio de "archivar es reversible, borrar es definitivo"; preserva contexto histórico para auditoría futura sin saturar el root.

### Decisión 6: Resolver `.agent/` vs `.agents/` consolidando en `.agents/`

Auditar contenido de `.agent/artifacts/` y `.agent/skills/`. Política:

- Si `.agent/skills/` es duplicado puro de `.agents/skills/` → eliminar `.agent/`.
- Si `.agent/artifacts/` tiene contenido único (logs de runs previos, output de agents) → mover a `archive/agent-artifacts/2026-05-19/` y eliminar `.agent/`.
- Si hay algo no obvio en uso → documentar en `INDEX.md` del archive y consultar antes de borrar (checkpoint con el usuario).

**Rationale**: `.agents/` (plural) es el estándar establecido por SKILLS.md y por la convención de BaseJR; tener ambos confunde al orchestrator sobre dónde buscar.

### Decisión 7: openspec/CHANGES.md como roadmap maestro

Crear `openspec/CHANGES.md` con estructura inicial:

```markdown
# OPSX Changes — Roadmap

> Entry point único para "qué construyo ahora". Mantener actualizado al proponer, aplicar y archivar.

## Activos

<!-- Changes en desarrollo. Formato: `name` — fase actual — link al directorio -->

## Próximos

<!-- Changes propuestos pero no iniciados, en orden de prioridad -->

## Backlog

<!-- Ideas / changes no priorizados -->

## Cómo se actualiza

- Al `openspec new change`: agregar al final de "Activos".
- Al completar artifacts (propose → apply ready): mover a "Activos" si no estaba.
- Al `openspec archive`: remover de "Activos" (el directorio queda en `changes/archive/`).
```

Inicialmente "Activos" contendrá `agentic-infra-uplift` (este change).

**Rationale**: equivalente al `CHANGES.md` de BaseJR; entry point único en lugar de obligar al humano/agent a hacer `openspec list --json` cada vez para saber qué hay.

### Decisión 8: Sub-project CLAUDE.md — solo auditoría en este change

`Dashboard/CLAUDE.md` (846 líneas), `pwaMenu/CLAUDE.md`, `pwaWaiter/CLAUDE.md` reciben:

- Auditoría escrita en `archive/legacy-docs/2026-05-19/sub-project-claude-md-audit.md` listando qué contenido duplica el root y qué es sub-project-specific.
- Recomendaciones para futuros changes (NO se ejecutan acá).
- Cero ediciones en este change.

**Rationale**: scope creep — reescribir 3 sub-project CLAUDE.md triplica el trabajo y los riesgos. Se hace propuesta separada cuando este change esté archivado.

## Risks / Trade-offs

- **[Drift entre CLAUDE.md extraído y knowledge-base/ preexistente]** → Mitigación: antes de extraer cada sección, leer el archivo destino en `knowledge-base/`; reconciliar diferencias preservando la versión más actualizada y dejando un comentario `<!-- merged from CLAUDE.md 2026-05-19 -->` en el destino. Si hay conflicto sustancial, escalar al usuario.
- **[Enlaces internos rotos en docs preservados que apunten a los ~30 MDs movidos al archive]** → Mitigación: scan con `rg "\.md\b"` sobre `knowledge-base/`, `README.md`, y los sub-project `CLAUDE.md`; reescribir paths a `archive/legacy-docs/2026-05-19/<nombre>.md` donde aplique. Riesgo bajo: la mayoría de docs legacy son monólogos sin links entrantes.
- **[Sub-agents acostumbrados al CLAUDE.md monolítico]** → Mitigación: el cambio es transparente para el orchestrator porque CLAUDE.md sigue siendo el primer archivo cargado; los sub-agents que necesiten detalle ahora encuentran la tabla "Necesito X → leer Y" en su primera línea de búsqueda.
- **[`.agent/` puede tener algo en uso por integración no obvia]** → Mitigación: NO eliminar sin checkpoint con el usuario; auditar primero, listar contenido, esperar aprobación, mover a archive antes de borrar. Reversible.
- **[Romper la convención de "código no se toca"]** → Mitigación: este change es 100% docs/infra agentic. Si alguna task requiere tocar código fuera de `archive/`, `knowledge-base/`, root MDs, o `openspec/`, se rechaza y se propone change separado.
- **[Sub-project CLAUDE.md siguen pesados]** → Trade-off aceptado: scope creep > deuda. Se documenta como follow-up.
- **[Banner FASE 5 y reporte/ no se traen]** → Trade-off aceptado: son project-specific de BaseJR, no aportan a Jrmuela.

## Migration Plan

1. **Pre-flight** (no destructivo): leer `knowledge-base/` completo para mapear qué archivos existen y qué falta. Generar lista de targets para extracción.
2. **Crear `archive/legacy-docs/2026-05-19/`** con `INDEX.md` vacío.
3. **Crear `openspec/CHANGES.md`** con este change como primer "Activo".
4. **Extraer contenido inline de `CLAUDE.md` a `knowledge-base/`** (sección por sección, reconciliando con lo existente).
5. **Reescribir `CLAUDE.md` raíz** como hub navegacional + Skills Discovery Protocol + Slash Commands.
6. **Crear `AGENTS.md` raíz** como mirror.
7. **Mover docs legacy** del root a `archive/legacy-docs/2026-05-19/` y poblar `INDEX.md`.
8. **Borrar archivos basura** (`~$todo.docx`, paths Windows malformados).
9. **Scan de enlaces rotos** y fix.
10. **Auditar `.agent/`** — checkpoint con usuario antes de consolidar.
11. **Auditar sub-project CLAUDE.md** — escribir audit doc, NO editar archivos.
12. **Verificación final**: `openspec list --json` muestra `agentic-infra-uplift` en CHANGES.md; root tiene ≤ 5 MDs; tabla "Necesito X → leer Y" cubre todos los temas extraídos.

**Rollback**: cada paso es reversible porque archivamos (no borramos). Rollback total = `git restore .` antes del commit final.

## Open Questions

- ¿`DEVELOPMENT.md` raíz debe existir? BaseJR lo tiene; Jrmuela actualmente no. Decisión por defecto: no crearlo en este change (out of scope); evaluarlo en follow-up.
- ¿Qué hacer con `proyehisto0.md` y `proyehisto1.md`? Son el backlog de user stories del proyecto. Decisión por defecto: archivar (la fuente viva debería ser `openspec/CHANGES.md` + el backlog en algún tracker). Confirmar con el usuario en el apply.
- ¿Algún integración externa lee `.agent/` (no `.agents/`)? Validar en el apply leyendo `.gitignore`, `.claude/settings.json`, y otros configs.
- ¿`prompt00.md`, `promIniciarBase.md`, `prompt_knowledge_base_v2.md` se conservan como referencia o se borran? Decisión por defecto: archivar.
