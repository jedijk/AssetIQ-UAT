import React from 'react';
import { ArrowLeft, ChevronRight, Home } from 'lucide-react';
import { useBreadcrumb } from '../contexts/BreadcrumbContext';
import { isActionDetailPath, isObservationWorkspacePath } from '../lib/routeLabels';
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
 * Mobile: back button only; desktop: full text trail
 */
const NavigationBreadcrumb = ({ className = '' }) => {
  const {
    history,
    navigateTo,
    goBack,
    canGoBack,
    getDisplayLabel,
    isHomeBreadcrumbPath,
    currentPath,
    mobileBadge,
  } = useBreadcrumb();
  const breadcrumbs = history || [];
  const showTrail = breadcrumbs.length > 1;
  const currentEntry = breadcrumbs[breadcrumbs.length - 1];
  const currentLabel = currentEntry ? getDisplayLabel(currentEntry) : null;
  const hideMobileTitle =
    isObservationWorkspacePath(currentPath) || isActionDetailPath(currentPath);
  const useMobileDetailHeader = hideMobileTitle;

  if (!canGoBack && !showTrail) {
    return null;
  }

  return (
    <div
      className={`sticky top-[var(--app-header-offset)] z-[35] bg-slate-50 items-center gap-2 min-w-0 mb-0 pointer-events-auto border-b border-slate-200/80 sm:border-b-0 pb-2 sm:pb-0 ${
        useMobileDetailHeader
          ? 'hidden sm:flex'
          : canGoBack || showTrail
            ? 'flex'
            : 'hidden sm:flex'
      } ${className}`}
    >
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

      {canGoBack && currentLabel && !hideMobileTitle ? (
        <div className="sm:hidden flex items-center gap-2 min-w-0 flex-1">
          <h1 className="text-base font-semibold text-slate-900 truncate min-w-0 leading-tight">
            {currentLabel}
          </h1>
          {mobileBadge ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">{mobileBadge}</div>
          ) : null}
        </div>
      ) : null}

      {showTrail && (
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
      )}
    </div>
  );
};

export default NavigationBreadcrumb;
