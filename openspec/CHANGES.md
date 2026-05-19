# OPSX Changes — Roadmap

> Entry point único para "qué changes hay en este proyecto".
> Mantener actualizado al proponer, aplicar y archivar changes.
> Fuente de verdad: `openspec/changes/` (manejado por el CLI `openspec`).

---

## Activos

Changes en desarrollo activo.

_(vacío — agregar al proponer el próximo change)_

---

## Próximos

Changes propuestos pero no iniciados, en orden de prioridad.

<!-- Agregar entries cuando se propongan nuevos changes con /opsx:propose -->

_(vacío — agregar al proponer el próximo change)_

---

## Backlog

Ideas y changes no priorizados.

<!-- Ideas no comprometidas. Formato libre. -->

- Reescritura de sub-project CLAUDE.md (Dashboard, pwaMenu, pwaWaiter) — follow-up de `agentic-infra-uplift`
- Hook automático para Skills Discovery Protocol en `.claude/settings.json` — follow-up de `agentic-infra-uplift`
- Evaluar creación de `DEVELOPMENT.md` raíz (existe en BaseJR, Jrmuela no lo tiene)

---

## Archivados

Changes completados. Directorios preservados en `openspec/changes/archive/`.

| Change | Archivado | Descripción |
|--------|-----------|-------------|
| `agentic-infra-uplift` | 2026-05-19 | Infraestructura agentic: hub navegacional CLAUDE.md, mirror AGENTS.md, roadmap CHANGES.md, skills discovery, root cleanup |
| `helpsystem-final-coverage-and-lock` | 2026-05-19 | Cobertura final del help system y lock |
| `helpsystem-refactor-staff-and-roles` | 2026-05-19 | Refactor de páginas Staff y Roles del help system |
| `helpsystem-reports-and-fiscal-pages` | 2026-05-15 | Páginas de reportes y fiscal del help system |
| `helpsystem-finish-modals-with-pending-entries` | 2026-05-15 | Completar modals con entries pendientes |
| `helpsystem-read-only-operations-pages` | 2026-05-15 | Páginas de operaciones read-only del help system |
| `helpsystem-customer-and-layout-pages` | 2026-05-15 | Páginas de cliente y layout del help system |
| `helpsystem-baseline-and-tooling` | 2026-05-14 | Baseline e infraestructura del help system |

---

## Cómo se actualiza

| Momento | Acción |
|---------|--------|
| `openspec new change "<nombre>"` | Agregar al final de **Activos** con fase "propose" |
| Artifacts completados (proposal + design + tasks ready) | Actualizar fase a "apply ready" en Activos |
| `/opsx:apply` en curso | Actualizar fase a "apply (en curso)" |
| `/opsx:archive "<nombre>"` | Remover de Activos — el directorio queda en `changes/archive/YYYY-MM-DD-<nombre>/` |
| Nueva idea no comprometida | Agregar a **Backlog** |
| Change propuesto y priorizado | Mover de Backlog a **Próximos** |
