# Breadcrumb Navigation - Functional Specification

## Overview
Implement a breadcrumb navigation system that tracks the user's navigation path and allows them to go back to previous pages. Limited to a maximum of 3 steps/crumbs.

## Requirements

### Core Functionality
1. **Track Navigation History**: Keep track of the last 3 pages the user visited
2. **Display Breadcrumbs**: Show a clickable breadcrumb trail in the page header
3. **Navigate Back**: Allow users to click any breadcrumb to return to that page
4. **Smart Truncation**: If path exceeds 3 items, show ellipsis for older items
5. **Current Page**: Always show the current page as the last (non-clickable) item

### Breadcrumb Structure
```
[Home] > [Previous Page] > [Current Page]
```

With more than 3 steps:
```
[Home] > [...] > [Previous Page] > [Current Page]
```

### Navigation Rules
1. **Session-based**: History persists during the browser session only
2. **Duplicate Prevention**: Consecutive visits to the same page don't add duplicates
3. **Max 3 Steps**: Only keep the last 3 pages (including current)
4. **Dashboard as Home**: Dashboard ("/dashboard") is always available as home
5. **Exclude Auth Pages**: Don't track login, register, forgot-password pages

### Data Structure
Each breadcrumb entry contains:
```typescript
interface BreadcrumbEntry {
  path: string;      // Route path (e.g., "/threats")
  label: string;     // Display name (e.g., "Observations")
  timestamp: number; // When the page was visited
}
```

### Route-to-Label Mapping
| Route | Label |
|-------|-------|
| /dashboard | Dashboard |
| /threats | Observations |
| /threats/:id | Observation Detail |
| /threats/:id/workspace | Observation Workspace |
| /actions | Actions |
| /actions/:id | Action Detail |
| /library | Library |
| /equipment-manager | Equipment Manager |
| /causal-engine | Causal Engine |
| /tasks | Task Scheduler |
| /my-tasks | My Tasks |
| /reliability | Reliability Intelligence |
| /reliability/cases | Reliability Cases |
| /reliability/cases/:id | Case Detail |
| /settings/* | Settings > [SubPage] |

### UI Components

#### 1. BreadcrumbContext (Navigation Context)
- Provides navigation history state
- Methods: `addBreadcrumb`, `navigateTo`, `clearHistory`
- Hooks: `useBreadcrumb()`

#### 2. NavigationBreadcrumb Component
- Renders the breadcrumb trail
- Uses existing `Breadcrumb` UI components
- Positioned below page header / above page content
- Shows max 3 items with ellipsis for truncation

### Integration Points
1. **Layout.js**: Wrap with BreadcrumbContext, add NavigationBreadcrumb component
2. **Page Navigation**: Track page changes via useLocation hook
3. **Existing BackButton**: Can optionally use breadcrumb history

### Example Flow
1. User starts at Dashboard
   - Breadcrumbs: `Dashboard`
2. User navigates to Observations
   - Breadcrumbs: `Dashboard > Observations`
3. User clicks on an observation
   - Breadcrumbs: `Dashboard > Observations > Observation Detail`
4. User navigates to Actions
   - Breadcrumbs: `... > Observations > Observation Detail > Actions`
5. User clicks "Observations" breadcrumb
   - Returns to Observations page
   - Breadcrumbs: `Dashboard > Observations`

### Accessibility
- Use semantic `<nav>` element with `aria-label="breadcrumb"`
- Current page has `aria-current="page"`
- Links are keyboard navigable

### Performance
- Use sessionStorage for persistence (survives page refresh)
- Debounce history updates to prevent rapid additions
- Lazy evaluate route labels

## Implementation Files
1. `/app/frontend/src/contexts/BreadcrumbContext.js` - State management
2. `/app/frontend/src/components/NavigationBreadcrumb.jsx` - UI component
3. `/app/frontend/src/lib/routeLabels.js` - Route-to-label mapping
4. Update `/app/frontend/src/components/Layout.js` - Integration

## Testing Scenarios
1. Navigate through 4+ pages, verify only 3 breadcrumbs shown
2. Click intermediate breadcrumb, verify navigation and history update
3. Refresh page, verify breadcrumbs persist
4. New browser tab, verify breadcrumbs start fresh
5. Navigate to same page twice, verify no duplicate entries
