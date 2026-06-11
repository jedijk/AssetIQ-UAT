import React from 'react';
import { ArrowLeft, ChevronRight, Home } from 'lucide-react';
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
 * NavigationBreadcrumb - Back button plus breadcrumb trail of recently visited pages
 * Mobile: icon-only trail; desktop: text labels
 */
const NavigationBreadcrumb = ({ className = '' }) => {
  const {
    history,
    navigateTo,
    goBack,
    canGoBack,
    getDisplayLabel,
    isHomeBreadcrumbPath,
  } = useBreadcrumb();
  const breadcrumbs = history || [];
  const showTrail = breadcrumbs.length > 1;

  if (!canGoBack && !showTrail) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 mb-0.5 sm:mb-4 ${className}`}>
      {canGoBack && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors touch-manipulation flex-shrink-0"
          style={{ minHeight: '36px' }}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline text-sm font-medium">Back</span>
        </button>
      )}

      {showTrail && (
        <>
          {/* Mobile View - icon-only breadcrumb trail */}
          <nav
            className="flex sm:hidden items-center gap-0.5 min-w-0"
            aria-label="breadcrumb"
          >
            {breadcrumbs.map((entry, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const isHome = isHomeBreadcrumbPath(entry.path);
              const label = getDisplayLabel(entry);
              const Icon = isHome ? Home : getRouteIcon(entry.path);
              const iconClass = 'w-4 h-4 flex-shrink-0';

              return (
                <React.Fragment key={entry.path + '-' + index}>
                  {index > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" aria-hidden="true" />
                  )}
                  {isLast ? (
                    <span
                      aria-current="page"
                      aria-label={label}
                      title={label}
                      className="inline-flex items-center justify-center p-2 rounded-md bg-slate-100 text-slate-900"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      <Icon className={iconClass} aria-hidden="true" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateTo(index)}
                      aria-label={label}
                      title={label}
                      className="inline-flex items-center justify-center p-2 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors touch-manipulation"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      <Icon className={iconClass} aria-hidden="true" />
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Desktop View - Full breadcrumb trail */}
          <Breadcrumb className="hidden sm:block min-w-0">
            <BreadcrumbList>
              {breadcrumbs.map((entry, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const isHome = isHomeBreadcrumbPath(entry.path);
                const label = getDisplayLabel(entry);

                return (
                  <React.Fragment key={entry.path + '-' + index}>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage className="text-slate-900 font-medium max-w-[200px] truncate">
                          {label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <button
                            type="button"
                            onClick={() => navigateTo(index)}
                            className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer bg-transparent border-none p-0 max-w-[180px]"
                          >
                            {isHome && (
                              <Home className="w-3.5 h-3.5 flex-shrink-0" />
                            )}
                            <span className="truncate">{label}</span>
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
        </>
      )}
    </div>
  );
};

export default NavigationBreadcrumb;
