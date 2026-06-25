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

echo "Frontend import checks passed."
