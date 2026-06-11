import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { useBreadcrumb } from '../contexts/BreadcrumbContext';
import { getRouteIcon } from '../lib/routeLabels';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';

/**
 * NavigationBreadcrumb - Displays a breadcrumb trail of recently visited pages
 * Shows up to 3 pages with the current page as the last item
 * Mobile: icon-only trail; desktop: text labels
 */
const NavigationBreadcrumb = ({ className = '' }) => {
  const { history, navigateTo } = useBreadcrumb();

  // Don't render if no history or only one page (current page)
  if (!history || history.length <= 1) {
    return null;
  }

  const breadcrumbs = history;

  return (
    <div className={`mb-3 sm:mb-4 ${className}`}>
      {/* Mobile View - icon-only breadcrumb trail */}
      <nav
        className="flex sm:hidden items-center gap-0.5"
        aria-label="breadcrumb"
      >
        {breadcrumbs.map((entry, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const isFirst = index === 0;
          const Icon = getRouteIcon(entry.path);
          const iconClass = 'w-4 h-4 flex-shrink-0';

          return (
            <React.Fragment key={entry.path + '-' + index}>
              {index > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" aria-hidden="true" />
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  aria-label={entry.label}
                  title={entry.label}
                  className="inline-flex items-center justify-center p-2 rounded-md bg-slate-100 text-slate-900"
                  style={{ minHeight: '36px', minWidth: '36px' }}
                >
                  <Icon className={iconClass} aria-hidden="true" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigateTo(index)}
                  aria-label={entry.label}
                  title={entry.label}
                  className="inline-flex items-center justify-center p-2 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors touch-manipulation"
                  style={{ minHeight: '36px', minWidth: '36px' }}
                >
                  {isFirst ? (
                    <Home className={iconClass} aria-hidden="true" />
                  ) : (
                    <Icon className={iconClass} aria-hidden="true" />
                  )}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Desktop View - Full breadcrumb trail */}
      <Breadcrumb className="hidden sm:block">
        <BreadcrumbList>
          {breadcrumbs.map((entry, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const isFirst = index === 0;

            return (
              <React.Fragment key={entry.path + '-' + index}>
                <BreadcrumbItem>
                  {isLast ? (
                    // Current page - not clickable
                    <BreadcrumbPage className="text-slate-900 font-medium max-w-[200px] truncate">
                      {entry.label}
                    </BreadcrumbPage>
                  ) : (
                    // Previous pages - clickable
                    <BreadcrumbLink asChild>
                      <button
                        type="button"
                        onClick={() => navigateTo(index)}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer bg-transparent border-none p-0 max-w-[180px]"
                      >
                        {isFirst && (
                          <Home className="w-3.5 h-3.5 flex-shrink-0" />
                        )}
                        <span className="truncate">{entry.label}</span>
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && (
                  <BreadcrumbSeparator>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </BreadcrumbSeparator>
                )}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};

export default NavigationBreadcrumb;
