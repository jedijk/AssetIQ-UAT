import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Home, MoreHorizontal } from 'lucide-react';
import { useBreadcrumb } from '../contexts/BreadcrumbContext';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

/**
 * NavigationBreadcrumb - Displays a breadcrumb trail of recently visited pages
 * Shows up to 3 pages with the current page as the last item
 * Mobile compatible with responsive design and touch-friendly targets
 */
const NavigationBreadcrumb = ({ className = '' }) => {
  const { history, navigateTo } = useBreadcrumb();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Don't render if no history or only one page (current page)
  if (!history || history.length <= 1) {
    return null;
  }

  const breadcrumbs = history;
  const hasManyItems = breadcrumbs.length > 2;

  // Truncate long labels for mobile
  const truncateLabel = (label, maxLength = 20) => {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 2) + '...';
  };

  // Mobile: Show compact view with back button + current page
  // Desktop: Show full breadcrumb trail
  return (
    <div className={`mb-3 sm:mb-4 ${className}`}>
      {/* Mobile View - Compact back button style */}
      <div className="flex sm:hidden items-center gap-2">
        {breadcrumbs.length > 1 && (
          <button
            onClick={() => navigateTo(breadcrumbs.length - 2)}
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-blue-600 hover:text-blue-700 active:bg-blue-50 rounded-md transition-colors touch-manipulation"
            style={{ minHeight: '36px' }} // Minimum touch target
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="font-medium">
              {truncateLabel(breadcrumbs[breadcrumbs.length - 2].label, 15)}
            </span>
          </button>
        )}
        
        {/* Show dropdown for full history on mobile if more than 2 items */}
        {hasManyItems && (
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button 
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors touch-manipulation"
                style={{ minHeight: '36px', minWidth: '36px' }}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {breadcrumbs.slice(0, -1).map((entry, index) => (
                <DropdownMenuItem
                  key={entry.path + '-' + index}
                  onClick={() => {
                    navigateTo(index);
                    setDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 py-2.5 cursor-pointer"
                >
                  {index === 0 && <Home className="w-4 h-4 text-slate-400" />}
                  <span>{entry.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

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
