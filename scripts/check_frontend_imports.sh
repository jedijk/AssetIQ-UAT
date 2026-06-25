#!/usr/bin/env bash
# Phase 0 — banned frontend imports (CI gate)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/frontend/src"

fail=0

if rg -q "from ['\"]react-i18next['\"]|require\\(['\"]react-i18next['\"]\\)" "$SRC"; then
  echo "FAIL: react-i18next is banned — use contexts/LanguageContext (useLanguage)"
  rg "react-i18next" "$SRC" || true
  fail=1
fi

if rg -q "equipmentAPI" "$SRC"; then
  echo "FAIL: equipmentAPI is not exported — use equipmentHierarchyAPI from lib/apis/equipment"
  rg "equipmentAPI" "$SRC" || true
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

# Resolve lib/apis/* import targets (catches missing modules like equipmentAPI).
while IFS= read -r mod; do
  mod="${mod#lib/apis/}"
  if [[ ! -f "$SRC/lib/apis/${mod}.js" && ! -f "$SRC/lib/apis/${mod}.ts" ]]; then
    echo "FAIL: lib/apis/${mod} is imported but no .js/.ts file exists"
    fail=1
  fi
done < <(rg --no-filename -o "lib/apis/[A-Za-z0-9_]+" "$SRC" 2>/dev/null | sort -u || true)

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "Frontend import checks passed."
