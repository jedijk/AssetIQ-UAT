# STRUCTURAL CODE AUDIT REPORT
**Date:** April 10, 2026
**Codebase:** AssetIQ / ThreatBase Platform
**Auditor:** AI Code Architect

---

## 🚨 CRITICAL ISSUES

### Issue 1: Duplicate API Axios Instances with Separate Interceptors
- **Location:** `/app/frontend/src/lib/api.js` (lines 1-20, 712-740)
- **Why it happens:** Two axios instances (`api` and `aiApi`) were created separately with duplicate interceptor logic, likely added in separate iterations.
- **Impact:** 
  - Doubled token injection code
  - Doubled 401 handling logic
  - If one is updated, the other may be forgotten
  - Inconsistent error handling between regular and AI API calls
- **Fix (structural):** Consolidate into a single axios instance factory function that creates configured instances with shared interceptor logic.

---

### Issue 2: Mixed Fetch/Axios Patterns in Same Components
- **Location:** 
  - `/app/frontend/src/pages/SettingsUserManagementPage.js` (15 raw fetch calls)
  - `/app/frontend/src/pages/TaskSchedulerPage.js` (17 raw fetch calls)
  - `/app/frontend/src/pages/MyTasksPage.js` (9 raw fetch calls)
- **Why it happens:** Different developers/iterations used different patterns. Some used the `api` instance, others used raw `fetch()`.
- **Impact:**
  - Raw `fetch()` calls don't get the `X-Database-Environment` header from the axios interceptor
  - Database switching feature is broken for these pages
  - Inconsistent error handling
  - Inconsistent auth token handling
- **Fix (structural):** Create a unified `apiRequest()` wrapper function and migrate all raw `fetch()` calls to use it, or convert to use the existing `api` axios instance.

---

### Issue 3: God Objects - Pages Over 2000 Lines
- **Location:**
  - `/app/frontend/src/contexts/LanguageContext.js` (2486 lines) - Translation strings
  - `/app/frontend/src/pages/CausalEnginePage.js` (2318 lines) 
  - `/app/frontend/src/pages/SettingsUserManagementPage.js` (2188 lines)
  - `/app/frontend/src/pages/FormsPage.js` (1997 lines)
  - `/app/frontend/src/pages/DashboardPage.js` (1809 lines)
- **Why it happens:** Iterative AI development tends to add features to existing files rather than extracting components.
- **Impact:**
  - 45+ useState hooks in single components
  - Multiple useEffects with overlapping concerns
  - Difficult to test individual behaviors
  - High cognitive load for maintenance
- **Fix (structural):** Extract logical units into separate components:
  - CausalEnginePage → InvestigationList, InvestigationDetail, TimelineView, ActionEditor
  - SettingsUserManagementPage → UserTable, UserDialog, PendingUsers, InstallationSelector
  - DashboardPage → StatsCards, ObservationsList, QuickFormView, FilterBar

---

### Issue 4: Duplicate Query Keys with Different Data Sources
- **Location:** Multiple pages use same query keys with different queryFn implementations
- **Evidence:**
  ```
  16 occurrences: ["investigation", selectedInvId]
  14 occurrences: ["threats"]
  12 occurrences: ["actions"]
  ```
- **Why it happens:** React Query keys were reused across pages without centralized query definition.
- **Impact:**
  - Cache collisions between different data shapes
  - Unexpected stale data
  - Difficult to invalidate correctly
- **Fix (structural):** Create a centralized `queryKeys.js` file with factory functions:
  ```javascript
  export const queryKeys = {
    threats: {
      all: ['threats'],
      detail: (id) => ['threats', id],
      timeline: (id) => ['threats', id, 'timeline'],
    }
  }
  ```

---

## ⚠️ MEDIUM ISSUES

### Issue 5: Multiple Loading State Patterns
- **Location:** 245 instances of loading flags across `/app/frontend/src/pages`
- **Why it happens:** Each component manages its own loading state without a unified pattern.
- **Evidence patterns found:**
  - `isLoading` from useQuery
  - `loading` from useState
  - `isGenerating` for AI operations
  - `isFetching`, `isSubmitting`, `pending`
  - `loadingQuickView`, `templatesLoading`, `plansLoading`
- **Impact:**
  - Inconsistent UI feedback
  - Potential race conditions between parallel loads
  - Difficult to show unified loading states
- **Fix (structural):** Standardize on React Query's built-in loading states. Remove manual `useState` loading flags where useQuery/useMutation already provides them.

---

### Issue 6: 6 useEffects in EquipmentManagerPage with Overlapping Concerns
- **Location:** `/app/frontend/src/pages/EquipmentManagerPage.js` (lines 505-658)
- **Breakdown:**
  1. Line 505: Mobile detection (resize listener)
  2. Line 523: Persist expanded IDs to localStorage
  3. Line 545: Keyboard shortcuts
  4. Line 577: Handle `?edit=` query param
  5. Line 641: Auto-expand parents during search
  6. (Additional implicit effects from useQuery)
- **Why it happens:** Each feature was added independently without consolidation.
- **Impact:**
  - Multiple event listeners on window
  - Race condition between expandedIds save and search expand
  - Hard to trace which effect causes which state change
- **Fix (structural):** 
  - Extract mobile detection to a `useMobile()` hook (used elsewhere)
  - Extract localStorage persistence to a `usePersistedState()` hook
  - Consolidate search-related effects into a single `useTreeSearch()` hook

---

### Issue 7: Actions Endpoint Fragmentation
- **Location:** Backend routes for "actions"
  - `/app/backend/routes/actions.py` - Main CRUD
  - `/app/backend/routes/investigations.py` - Investigation-scoped actions
  - `/app/backend/routes/ai_routes.py` - AI optimize actions
  - `/app/backend/routes/insights.py` - Execution actions
  - `/app/backend/routes/user_stats.py` - User action stats
- **Why it happens:** Feature sprawl without domain consolidation.
- **Impact:**
  - `/api/actions` vs `/api/investigations/{id}/actions` vs `/api/execution/actions`
  - Different response shapes for similar data
  - Confusion about which endpoint to use
  - Potential for duplicate action records
- **Fix (structural):** Consolidate action-related endpoints:
  - All action CRUD → `/api/actions`
  - Use query params for filtering: `/api/actions?source=investigation&source_id=xxx`

---

### Issue 8: AuthContext with Legacy Registration Flow
- **Location:** `/app/frontend/src/contexts/AuthContext.js` (line 144-148)
- **Code:**
  ```javascript
  // Legacy behavior: auto-login after registration (for backwards compatibility)
  const { token: newToken, user: userData } = response.data;
  ```
- **Why it happens:** Registration flow was modified but old code kept for compatibility.
- **Impact:**
  - Dead code path if new registration always requires approval
  - Confusing branching logic
  - Security risk if legacy path bypasses approval
- **Fix (structural):** Remove legacy auto-login code. Make registration flow consistently require approval.

---

### Issue 9: Service Worker Cache Without Status Check
- **Location:** `/app/frontend/public/service-worker.js` 
- **Status:** PARTIALLY FIXED (updated to check status === 200)
- **Remaining issue:** Cache invalidation strategy is time-based (staleTime) without version-aware invalidation.
- **Impact:** Users may see stale data after deployments.
- **Fix (structural):** Implement version-aware cache busting using build hash in cache key.

---

## 🧹 CLEANUP OPPORTUNITIES

### Cleanup 1: Unused API Functions in api.js
- **Location:** `/app/frontend/src/lib/api.js`
- **Evidence:** 1214 lines, many functions never called from components.
- **Action:** Audit each export against actual usage with grep. Remove unused functions.

### Cleanup 2: Multiple Avatar Fallback Implementations
- **Location:**
  - `DashboardPage.js` - ImageWithFallback component
  - `FormSubmissionsPage.js` - ImageWithFallback component  
  - `SettingsUserManagementPage.js` - UserAvatar component
  - `components/AuthenticatedMedia.js` - AuthenticatedImage
- **Action:** Consolidate into a single `Avatar` component with authenticated loading.

### Cleanup 3: Dead State Variables
- **Location:** CausalEnginePage.js
- **Evidence:**
  - `deleteInvOptions` - delete options rarely used
  - `preSearchExpandedIds` - complex search state tracking
- **Action:** Review each useState for actual usage and remove dead code.

### Cleanup 4: Backend Route Handlers with Business Logic
- **Evidence:** Routes files are larger than service files:
  - `routes/threats.py` (1371 lines) vs typical service (600-800 lines)
- **Action:** Extract business logic from route handlers to service layer.

---

## 🧠 ARCHITECTURE RECOMMENDATIONS

### 1. Single Source of Truth for API Calls

**Current State:** Mixed patterns (fetch, axios api, axios aiApi)

**Target State:**
```
/frontend/src/lib/
├── apiClient.js          # Single axios instance factory
├── api/
│   ├── threats.js        # Domain-specific API functions
│   ├── actions.js
│   ├── equipment.js
│   └── index.js          # Re-exports all APIs
└── queryKeys.js          # Centralized React Query keys
```

### 2. Clear Request Lifecycle

**Implement Request States:**
```javascript
const RequestState = {
  IDLE: 'idle',
  LOADING: 'loading', 
  SUCCESS: 'success',
  ERROR: 'error'
};
```

Remove manual `isLoading` useState where useQuery provides it.

### 3. Component Decomposition Strategy

**Max Component Size:** 300 lines

**Extraction Pattern:**
1. Identify logical sections (often separated by comments)
2. Extract to sub-component in same file first
3. If stable, move to separate file
4. If reused, move to shared components

### 4. Backend Service Layer

**Current:** Routes contain business logic
**Target:** Routes are thin controllers, services handle logic

```
routes/actions.py
├── @router.post("/actions")
│   └── calls action_service.create(data)
└── @router.get("/actions")
    └── calls action_service.list(filters)
```

### 5. Database Context Pattern

**Current:** CollectionProxy with context vars (correct)
**Recommendation:** Ensure all services use `db["collection"]` pattern, not cached collection references.

---

## 📊 RISK ASSESSMENT SUMMARY

| Risk Level | Count | Primary Concern |
|------------|-------|-----------------|
| 🚨 Critical | 4 | Data inconsistency, broken features |
| ⚠️ Medium | 5 | Maintenance burden, tech debt |
| 🧹 Cleanup | 4 | Code quality, performance |

---

## 🎯 PRIORITIZED ACTION PLAN

### Phase 1: Critical Fixes (Immediate)
1. [ ] Migrate raw `fetch()` calls to use `api` axios instance (database switching broken)
2. [ ] Consolidate axios instances and interceptors

### Phase 2: Structural Improvements (Sprint 1-2)
3. [ ] Create centralized query keys
4. [ ] Extract CausalEnginePage into sub-components
5. [ ] Consolidate Avatar/Image components

### Phase 3: Architecture Cleanup (Ongoing)
6. [ ] Move business logic from routes to services
7. [ ] Remove dead code and unused exports
8. [ ] Implement consistent loading state pattern

---

*End of Structural Audit Report*
