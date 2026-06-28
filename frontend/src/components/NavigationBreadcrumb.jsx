import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
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
 * NavigationBreadcrumb - Left-aligned breadcrumb trail for page navigation.
 */
const NavigationBreadcrumb = ({ className = '' }) => {
  const {
    history,
    navigateTo,
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

  if (!showTrail && !currentLabel) {
    return null;
  }

  return (
    <div
      className={`sticky top-[var(--app-header-offset)] z-[35] bg-slate-50 hidden sm:flex justify-start items-center gap-2 min-w-0 w-full mb-0 pointer-events-none border-b border-slate-200/80 sm:border-b-0 pb-2 sm:pb-0 ${className}`}
    >
      {showTrail ? (
        <Breadcrumb className="min-w-0 flex-1 pointer-events-auto">
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
      ) : currentLabel && !hideMobileTitle ? (
        <div className="flex items-center gap-2 min-w-0 flex-1 pointer-events-auto">
          <h1 className="text-base font-semibold text-slate-900 truncate min-w-0 leading-tight">
            {currentLabel}
          </h1>
          {mobileBadge ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">{mobileBadge}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default NavigationBreadcrumb;
