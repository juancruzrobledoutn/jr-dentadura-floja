# Shared UI Components

Shared React components used across Dashboard, pwaMenu, and pwaWaiter.

## Status: Scaffold

This directory contains the interface definitions for shared components.
Currently, each frontend has its own implementation. This package is the
target for future unification.

## Components to unify

| Component | Dashboard | pwaMenu | pwaWaiter |
|-----------|-----------|---------|-----------|
| Button | src/components/ui/Button.tsx | inline | src/components/Button.tsx |
| Input | src/components/ui/Input.tsx | inline | src/components/Input.tsx |
| Modal | src/components/ui/Modal.tsx | src/components/ui/Modal.tsx | inline |
| LoadingSpinner | inline | src/components/ui/LoadingSpinner.tsx | inline |
| Toast | src/components/ui/Toast.tsx | inline | N/A |

## Setup (future)

When ready to unify, use npm workspaces or Turborepo:
1. Move this to packages/ui/
2. Add to root package.json workspaces
3. Import from '@integrador/ui' in each frontend
