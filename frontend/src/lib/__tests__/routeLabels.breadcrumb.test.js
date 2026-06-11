import {
  readBreadcrumbOrigin,
  trimBreadcrumbHistory,
} from '../routeLabels';

describe('breadcrumb route helpers', () => {
  test('readBreadcrumbOrigin normalizes observation paths', () => {
    expect(readBreadcrumbOrigin({ breadcrumbOrigin: '/threats/abc' })).toBe(
      '/threats/abc/workspace',
    );
  });

  test('trimBreadcrumbHistory keeps immediate predecessor before action detail', () => {
    const entries = [
      { path: '/dashboard', label: 'Home', timestamp: 1 },
      { path: '/my-tasks', label: 'My Tasks', timestamp: 2 },
      { path: '/actions', label: 'Actions', timestamp: 3 },
      { path: '/actions/123', label: 'Action Detail', timestamp: 4 },
    ];

    const trimmed = trimBreadcrumbHistory(entries, 'Home', 3);
    expect(trimmed.map((entry) => entry.path)).toEqual([
      '/dashboard',
      '/actions',
      '/actions/123',
    ]);
  });

  test('trimBreadcrumbHistory does not trim three-item trails', () => {
    const entries = [
      { path: '/dashboard', label: 'Home', timestamp: 1 },
      { path: '/my-tasks', label: 'My Tasks', timestamp: 2 },
      { path: '/actions/123', label: 'Action Detail', timestamp: 3 },
    ];

    const trimmed = trimBreadcrumbHistory(entries, 'Home', 3);
    expect(trimmed.map((entry) => entry.path)).toEqual([
      '/dashboard',
      '/my-tasks',
      '/actions/123',
    ]);
  });
});
