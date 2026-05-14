#!/usr/bin/env bash
set -euo pipefail

echo "Generating TypeScript types from OpenAPI spec..."

# Fetch OpenAPI spec from running backend
OPENAPI_URL="${1:-http://localhost:8000/openapi.json}"

# Generate types for each frontend
for app in Dashboard pwaMenu pwaWaiter; do
  echo "Generating types for $app..."
  npx openapi-typescript "$OPENAPI_URL" -o "$app/src/types/api-generated.ts"
  echo "Done: $app/src/types/api-generated.ts"
done

echo "All types generated."
