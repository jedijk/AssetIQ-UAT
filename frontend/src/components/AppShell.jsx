import React from "react";
import { Skeleton } from "./ui/skeleton";

function Line({ w = "w-full" }) {
  return <Skeleton className={`h-3 ${w} rounded-full`} />;
}

export function AppShell({ title = true, subtitle = true, children }) {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-5 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {title ? <Skeleton className="h-7 w-56 rounded-lg" /> : null}
            {subtitle ? <div className="mt-2"><Line w="w-80" /></div> : null}
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>

        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </div>
  );
}

