import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "../../lib/utils"

const SCROLL_STORAGE_PREFIX = "assetiq.scroll."

function restoreScrollTop(viewport, top) {
  viewport.scrollTop = top
  requestAnimationFrame(() => {
    viewport.scrollTop = top
    requestAnimationFrame(() => {
      viewport.scrollTop = top
    })
  })
}

const ScrollArea = React.forwardRef(({ className, children, persistKey, ...props }, ref) => {
  const viewportRef = React.useRef(null)
  const storageKey = persistKey ? `${SCROLL_STORAGE_PREFIX}${persistKey}` : null

  React.useLayoutEffect(() => {
    if (!storageKey) return undefined

    const viewport = viewportRef.current
    if (!viewport) return undefined

    const saved = sessionStorage.getItem(storageKey)
    if (saved !== null) {
      const top = Number(saved)
      if (!Number.isNaN(top)) {
        restoreScrollTop(viewport, top)
      }
    }

    const onScroll = () => {
      sessionStorage.setItem(storageKey, String(viewport.scrollTop))
    }

    viewport.addEventListener("scroll", onScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", onScroll)
  }, [storageKey])

  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      {...props}>
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
})
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}>
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
