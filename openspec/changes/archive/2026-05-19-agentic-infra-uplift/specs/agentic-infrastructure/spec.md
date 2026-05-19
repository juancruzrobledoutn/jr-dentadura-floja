## ADDED Requirements

### Requirement: Root CLAUDE.md como hub navegacional

El archivo `CLAUDE.md` raíz del proyecto SHALL actuar como hub navegacional liviano (≤ 12KB) y NO como repositorio monolítico de detalles técnicos. SHALL contener exclusivamente: Quick Reference (prerequisites, comandos de start/test/lint/migraciones/backup, ports, stack), Project Overview con tabla de componentes, RBAC table, Conventions, Governance, una tabla "Necesito X → leer Y" que mapea contexto de trabajo a archivos en `knowledge-base/`, la sección "Delegación a Sub-Agents — Skills Discovery (CRÍTICO)", y la sección "Slash Commands disponibles". Todo detalle de modelo de datos, patterns con código, imports canónicos, decisiones arquitectónicas extensas, common issues, rate limiting, AI/RAG, CI/CD SHALL vivir en `knowledge-base/` y ser referenciado desde la tabla del hub.

#### Scenario: Lectura del CLAUDE.md por el orchestrator

- **WHEN** el orchestrator carga `CLAUDE.md` al inicio de una sesión
- **THEN** encuentra Quick Reference, Project Overview, RBAC, Conventions, Governance, la tabla "Necesito X → leer Y", Skills Discovery Protocol, y Slash Commands
- **AND** NO encuentra el modelo de datos completo, ni patterns extensos con código, ni listas largas de imports canónicos, ni la sección "Key Architectural Decisions" extensa
- **AND** el tamaño total del archivo es ≤ 12KB

#### Scenario: Búsqueda de un detalle técnico específico

- **WHEN** el orchestrator o un sub-agent necesita un detalle técnico (ej. "patrón de WebSocket en frontend", "import canónico de PermissionContext", "rate limit de billing")
- **THEN** consulta la tabla "Necesito X → leer Y" en `CLAUDE.md`
- **AND** la tabla provee el path al archivo correspondiente en `knowledge-base/`
- **AND** el detalle vive en ese archivo, no inline en `CLAUDE.md`

### Requirement: AGENTS.md como mirror model-agnostic

El archivo `AGENTS.md` raíz SHALL existir como mirror 1:1 model-agnostic de `CLAUDE.md`. SHALL contener el mismo contenido normativo (governance, conventions, skills discovery protocol, slash commands, tabla "Necesito X → leer Y") pero usando lenguaje neutral ("the AI assistant", "the orchestrator", "the sub-agent") en lugar de referencias específicas a Claude Code. El header SHALL declarar explícitamente: "Fuente canónica: CLAUDE.md. Si modificás uno, actualizás el otro."

#### Scenario: Lectura por una herramienta no-Claude

- **WHEN** una herramienta como Codex o Cursor abre el proyecto
- **THEN** encuentra `AGENTS.md` en el root con la misma información normativa que `CLAUDE.md`
- **AND** el contenido NO menciona "Claude Code" como única opción
- **AND** el header indica que la fuente canónica es `CLAUDE.md`

#### Scenario: Sincronización al modificar uno

- **WHEN** un agente o dev modifica `CLAUDE.md`
- **THEN** la regla del header de `AGENTS.md` indica que también debe actualizar `AGENTS.md` para mantener paridad
- **AND** el cambio normativo equivalente se refleja en ambos archivos

### Requirement: openspec/CHANGES.md como roadmap maestro

El archivo `openspec/CHANGES.md` raíz SHALL existir como entry point único para responder "qué changes hay en este proyecto". SHALL contener tres secciones: "Activos" (changes en desarrollo), "Próximos" (propuestos pero no iniciados, en orden de prioridad), y "Backlog" (ideas no priorizadas). SHALL incluir una sección "Cómo se actualiza" con las reglas para mantenerlo sincronizado con el ciclo `openspec new change` → `apply` → `archive`.

#### Scenario: Consulta del estado del proyecto

- **WHEN** un dev o agente quiere saber qué changes hay activos
- **THEN** abre `openspec/CHANGES.md` y encuentra la sección "Activos" con los changes en curso
- **AND** cada entry incluye el nombre del change y un link a su directorio en `openspec/changes/`

#### Scenario: Creación de un nuevo change

- **WHEN** se ejecuta `openspec new change "<nombre>"`
- **THEN** la regla documentada en `openspec/CHANGES.md` instruye agregar el change al final de "Activos"

#### Scenario: Archivado de un change

- **WHEN** se ejecuta `openspec archive "<nombre>"`
- **THEN** la regla documentada instruye remover el change de "Activos"
- **AND** el directorio del change queda preservado en `openspec/changes/archive/YYYY-MM-DD-<nombre>/`

### Requirement: Sub-Agent Skills Discovery Protocol normativo

Tanto `CLAUDE.md` como `AGENTS.md` SHALL contener una sección titulada "Delegación a Sub-Agents — Skills Discovery (CRÍTICO)" con reglas no-negociables sobre la inyección obligatoria del protocol de discovery de skills al delegar tasks de apply/implementación. El orchestrator SHALL incluir, al PRINCIPIO del prompt de cada Agent tool call para apply o implementación, la instrucción literal de leer `.agents/SKILLS.md` y cargar las skills aplicables ANTES de escribir código. La sección SHALL explicar el "por qué" (sin enforcement, los sub-agents arrancan con contexto vacío y violan convenciones del proyecto).

#### Scenario: Delegación de una task de implementación

- **WHEN** el orchestrator delega una task de apply o implementación vía la Agent tool
- **THEN** el prompt del sub-agent incluye, al principio, la instrucción de leer `.agents/SKILLS.md` y cargar las skills aplicables antes de tocar código
- **AND** la instrucción aparece como paso obligatorio, no opcional

#### Scenario: Lectura del protocolo por un agente nuevo

- **WHEN** un nuevo agente lee `CLAUDE.md` o `AGENTS.md`
- **THEN** encuentra la sección "Delegación a Sub-Agents — Skills Discovery (CRÍTICO)"
- **AND** la sección explica las reglas y el razonamiento de por qué son críticas

### Requirement: Slash commands documentados

`CLAUDE.md` SHALL contener una sección "Slash Commands disponibles" que liste los comandos disponibles en `.claude/commands/`, agrupados por familia (`/opsx:*`, `/kiro:*`), con propósito de cada uno (una línea) y cuándo usarlos. SHALL cubrir como mínimo: `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore`, `/kiro:spec-init`, `/kiro:spec-requirements`, `/kiro:spec-design`, `/kiro:spec-tasks`, `/kiro:spec-impl`, `/kiro:spec-status`, `/kiro:steering`, `/kiro:steering-custom`, `/kiro:validate-design`, `/kiro:validate-gap`, `/kiro:validate-impl`.

#### Scenario: Búsqueda de un slash command disponible

- **WHEN** un dev pregunta "qué slash commands tengo para proponer un change"
- **THEN** la sección "Slash Commands disponibles" de `CLAUDE.md` lista `/opsx:propose` con su propósito
- **AND** indica cuándo usarlo

#### Scenario: Cobertura de los commands existentes

- **WHEN** se compara la sección "Slash Commands disponibles" con el contenido de `.claude/commands/`
- **THEN** todos los commands del directorio están documentados en la sección
- **AND** ningún command del directorio queda sin descripción

### Requirement: Root del repositorio limpio y catalogado

El root del repositorio SHALL contener únicamente los siguientes archivos Markdown vivos: `README.md`, `CLAUDE.md`, `AGENTS.md`. Cualquier otro `.md` legacy SHALL estar archivado en `archive/legacy-docs/YYYY-MM-DD/` (donde la fecha es la del archivado), acompañado de un `INDEX.md` que cataloga cada archivo movido con su nombre y una descripción breve de su contenido. Archivos basura (lock files temporales tipo `~$*`, paths malformados, binarios huérfanos sin valor) SHALL ser eliminados directamente.

#### Scenario: Listado del root tras el cleanup

- **WHEN** se listan los archivos `.md` en el root del repositorio
- **THEN** solo aparecen `README.md`, `CLAUDE.md`, `AGENTS.md` (y opcionalmente `DEVELOPMENT.md` si existe)
- **AND** los demás docs legacy históricos están en `archive/legacy-docs/<fecha>/`

#### Scenario: Catalogación de archivos archivados

- **WHEN** se abre `archive/legacy-docs/<fecha>/INDEX.md`
- **THEN** cada archivo movido tiene una entry con su nombre y una línea descriptiva de su contenido
- **AND** se identifican los archivos archivados que ya no tienen referencias entrantes desde docs vivos

#### Scenario: Eliminación de basura

- **WHEN** se identifican archivos basura (lock files `~$*.docx`, paths Windows malformados tipo `c:UsersAdmin*`, binarios huérfanos)
- **THEN** son eliminados directamente sin archivar

### Requirement: Skills directory consolidado en .agents/

El proyecto SHALL mantener una única ubicación canónica para skills de agente: `.agents/skills/` (plural). El directorio `.agent/` (singular) NO SHALL existir en el repositorio salvo durante la auditoría transitoria del change que consolida. Cualquier contenido único encontrado en `.agent/` SHALL ser migrado a `.agents/` (si son skills) o a `archive/agent-artifacts/YYYY-MM-DD/` (si son artifacts de runs previos) antes de eliminarse.

#### Scenario: Listado de directorios agentic

- **WHEN** se listan los directorios ocultos del root
- **THEN** existe `.agents/` (plural) y NO existe `.agent/` (singular)
- **AND** todas las skills viven en `.agents/skills/`

#### Scenario: Consolidación de contenido único

- **WHEN** durante la auditoría se encuentra contenido en `.agent/` que no está duplicado en `.agents/`
- **THEN** el contenido se migra a `.agents/` (skills) o `archive/agent-artifacts/<fecha>/` (artifacts)
- **AND** una vez migrado, `.agent/` se elimina

### Requirement: Detalle técnico migrado a knowledge-base/

Todo contenido técnico extenso que actualmente vive inline en `CLAUDE.md` (modelo de datos detallado, Backend Patterns con código, Frontend Patterns con código, Canonical Import Paths, Common Issues, Rate Limiting Details, AI/RAG, CI/CD & Infrastructure, Key Architectural Decisions, WebSocket events / Outbox) SHALL ser extraído a archivos dentro de `knowledge-base/`, respetando la estructura de carpetas existente (`01-negocio/` a `07-anexos/`). No SHALL crearse nuevas carpetas top-level dentro de `knowledge-base/`. Cuando un archivo destino en `knowledge-base/` ya contenga información del mismo tema, las versiones SHALL reconciliarse preservando la más actualizada y dejando un comentario `<!-- merged from CLAUDE.md YYYY-MM-DD -->` para trazabilidad.

#### Scenario: Extracción de una sección de patterns

- **WHEN** se migra la sección "Backend Patterns" de `CLAUDE.md`
- **THEN** el contenido aparece en un archivo dentro de `knowledge-base/` (ej. `knowledge-base/05-dx/04_convenciones_y_estandares.md` u otro archivo apropiado)
- **AND** la sección equivalente en `CLAUDE.md` desaparece o queda reducida a un link al archivo destino

#### Scenario: Reconciliación con contenido preexistente

- **WHEN** el archivo destino en `knowledge-base/` ya contiene información del mismo tema
- **THEN** las dos versiones se reconcilian preservando la más actualizada
- **AND** queda un comentario `<!-- merged from CLAUDE.md YYYY-MM-DD -->` en el destino

#### Scenario: Sin nuevas carpetas top-level

- **WHEN** se realiza la migración de contenido
- **THEN** las carpetas top-level dentro de `knowledge-base/` permanecen iguales (`01-negocio/`, `02-arquitectura/`, `03-seguridad/`, `04-infraestructura/`, `05-dx/`, `06-estado-del-proyecto/`, `07-anexos/`)
- **AND** no se crean nuevas carpetas top-level

### Requirement: Auditoría documentada de sub-project CLAUDE.md

Los sub-project `CLAUDE.md` (`Dashboard/CLAUDE.md`, `pwaMenu/CLAUDE.md`, `pwaWaiter/CLAUDE.md`) SHALL recibir, en este change, una auditoría escrita que identifique contenido duplicado con el root y contenido genuinamente sub-project-specific. La auditoría SHALL vivir en `archive/legacy-docs/<fecha>/sub-project-claude-md-audit.md` y SHALL incluir recomendaciones para futuros changes. Los sub-project `CLAUDE.md` NO SHALL ser editados en este change.

#### Scenario: Generación de la auditoría

- **WHEN** se completa el change
- **THEN** existe `archive/legacy-docs/<fecha>/sub-project-claude-md-audit.md`
- **AND** lista por sub-project qué contenido duplica el root y qué es genuinamente sub-project-specific
- **AND** incluye recomendaciones priorizadas para futuros changes

#### Scenario: Sub-project CLAUDE.md sin editar

- **WHEN** se inspecciona `Dashboard/CLAUDE.md`, `pwaMenu/CLAUDE.md`, `pwaWaiter/CLAUDE.md` tras este change
- **THEN** su contenido es idéntico al estado pre-change
- **AND** ningún commit del change los modifica

### Requirement: Integridad de enlaces internos

Los enlaces internos entre archivos `.md` del repositorio SHALL permanecer funcionales tras el cleanup del root. Cuando se mueva un archivo a `archive/legacy-docs/<fecha>/`, las referencias entrantes desde docs vivos (`README.md`, `CLAUDE.md`, `AGENTS.md`, `knowledge-base/`, sub-project `CLAUDE.md`) SHALL ser reescritas para apuntar al nuevo path, O se SHALL documentar en el `INDEX.md` del archive que el archivo movido no tenía referencias entrantes.

#### Scenario: Scan post-cleanup

- **WHEN** se ejecuta un scan de enlaces tras el cleanup
- **THEN** todo link `.md → .md` resuelve a un archivo existente
- **AND** los links a archivos archivados apuntan a `archive/legacy-docs/<fecha>/<nombre>.md`

#### Scenario: Archivo sin referencias entrantes

- **WHEN** un archivo movido al archive no tenía referencias entrantes desde docs vivos
- **THEN** su entry en `INDEX.md` lo indica explícitamente ("Sin referencias entrantes al momento del archivado")
