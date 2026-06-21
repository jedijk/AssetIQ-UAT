import React, { useEffect, useRef } from "react";
import { Eye, GitBranch, Search } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";

export function ScheduleTaskContextMenu({
  menu,
  onClose,
  onViewTask,
  onParentStrategy,
  onFindEquipment,
}) {
  const { t } = useLanguage();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu?.open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menu?.open, onClose]);

  useEffect(() => {
    if (!menu?.open) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      onClose?.();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menu?.open, onClose]);

  if (!menu?.open || !menu.row) return null;

  const itemClass =
    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground";

  return (
    <div
      ref={menuRef}
      className="fixed z-[1200] min-w-[11rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ top: menu.y, left: menu.x }}
      role="menu"
      data-testid="schedule-task-context-menu"
    >
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        data-testid="schedule-context-view-task"
        onClick={() => {
          onViewTask?.(menu.row);
          onClose?.();
        }}
      >
        <Eye className="h-4 w-4 shrink-0 opacity-70" />
        {t("maintenance.contextViewTask")}
      </button>
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        data-testid="schedule-context-parent-strategy"
        onClick={() => {
          onParentStrategy?.(menu.row);
          onClose?.();
        }}
      >
        <GitBranch className="h-4 w-4 shrink-0 opacity-70" />
        {t("maintenance.contextParentStrategy")}
      </button>
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        data-testid="schedule-context-find-equipment"
        onClick={() => {
          onFindEquipment?.(menu.row);
          onClose?.();
        }}
      >
        <Search className="h-4 w-4 shrink-0 opacity-70" />
        {t("maintenance.contextFindEquipment")}
      </button>
    </div>
  );
}

export function openScheduleContextMenu(event, row, setMenu) {
  event.preventDefault();
  event.stopPropagation();
  setMenu({
    open: true,
    x: event.clientX,
    y: event.clientY,
    row,
  });
}
