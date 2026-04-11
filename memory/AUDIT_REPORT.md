# Structural Code Audit Report — AssetIQ / ThreatBase
**Date:** February 2026
**Scope:** Frontend (React) + Backend (FastAPI) architectural issues from iterative AI-driven development

---

## 🚨 Critical Issues

### 1. Race Condition: CausalEnginePage Notes Auto-Save
- **File:** `CausalEnginePage.js` (Lines 337-343)
- **Problem:** `updateInvMutation` in useEffect dependency array. useMutation returns new reference each render, causing timer to reset on every render cycle.
- **Impact:** Notes may never auto-save or save at unpredictable times.
- **Fix:** Remove `updateInvMutation` from dependency array or use useRef for the mutate function.

### 2. Split-Brain API Architecture — 6+ Pages Bypass Centralized Auth/Env Interceptors
- **Affected:** TaskSchedulerPage, MyTasksPage, SettingsUserManagementPage, DefinitionsPage, UserStatisticsPage, SettingsPreferencesPage, FormSubmissionsPage, DashboardPage, ActionDetailPage
- **Problem:** These pages use raw `fetch()` with manual token injection instead of the centralized `api.js` axios instance.
- **Impact:**
  - `X-Database-Environment` header missing → UAT/Prod switching broken for these pages
  - 401 redirect missing → expired sessions show cryptic errors
  - Timeout handling inconsistent
- **Fix:** Move all 6 inline API objects into `api.js`.

### 3. SettingsUserManagementPage Fetches ALL Threats for Location Fallback
- **File:** `SettingsUserManagementPage.js` (Line 392)
- **Problem:** Queries entire `threats` collection just to extract location strings for installation dropdown.
- **Impact:** Unnecessary database load; installations endpoint already provides this data.
- **Fix:** Remove `threats-for-locations` query entirely.

---

## ⚠️ Medium Issues

### 4. Mobile Detection Copy-Pasted Across 15+ Files
- **Problem:** Identical `useEffect + window.innerWidth < 768` in 15 pages.
- **Note:** `useIsMobile` hook already exists at `/app/frontend/src/hooks/useIsMobile.js`.
- **Additional Issue:** Layout.js uses `< 1024` breakpoint while pages use `< 768`.
- **Fix:** Use existing hook everywhere; decide on single breakpoint.

### 5. FormsPage Template Sync — Expensive Deep Comparison
- **File:** `FormsPage.js` (Lines 351-365)
- **Problem:** `JSON.stringify` on documents and fields arrays on every render.
- **Fix:** Use version number comparison only, or useMemo with stable references.

### 6. Duplicate rbacAPI in SettingsUserManagementPage vs usersAPI in api.js
- **Problem:** ~160 lines of duplicate user API wrappers with different error handling.
- **Fix:** Consolidate into `api.js`.

### 7. actionsAPI Duplicate Methods: get() and getById()
- **File:** `api.js` (Lines 654-661)
- **Problem:** Identical functions with different names.
- **Fix:** Remove one, alias the other.

---

## 🧹 Cleanup Opportunities

### 8. Console.log in Production API Client
- **File:** `api.js` (Lines 8-10, 21)
- **Problem:** Every API request logged to browser console.
- **Fix:** Remove or gate behind `process.env.NODE_ENV === 'development'`.

### 9. Duplicate Swagger Routes in server.py
- **File:** `server.py` (Lines 101-121)
- **Problem:** Manual `/docs`, `/redoc`, `/openapi.json` routes point to wrong OpenAPI URL.
- **Fix:** Remove manual routes; FastAPI already serves at `/api/docs`.

### 10. God Object Pages Need Component Extraction
- CausalEnginePage: 2,322 lines, 25 state vars, 18 mutations, 5 tabs, 6+ dialogs
- SettingsUserManagementPage: 2,168 lines, 20+ state vars, 10 mutations, 6 dialogs
- FormsPage: 1,998 lines
- DashboardPage: 1,807 lines

---

## 🧠 Architecture Recommendations (Priority Order)

1. **Unify API Layer** — Move all inline API objects into `api.js` (fixes UAT switching, auth, timeouts)
2. **Fix Notes Race Condition** — Remove mutation from useEffect deps (1-line fix)
3. **Use Existing useIsMobile Hook** — Replace 15 copies with shared hook
4. **Remove Unnecessary Threats Fetch** — Delete from UserManagement page
5. **Extract Components from God Objects** — Break 2000+ line files into focused components
