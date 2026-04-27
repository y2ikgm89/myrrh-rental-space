"use client";

import { IconSearch } from "@tabler/icons-react";
import { useRef, useSyncExternalStore } from "react";
import { Button } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import { useCommandPalette } from "./CommandPaletteProvider";

const SERVER_SNAPSHOT_MAC = false;
const noop = () => () => {};

export function SearchTriggerButton() {
  const { setOpen } = useCommandPalette();
  const snapshotRef = useRef<boolean | null>(null);
  const isMac = useSyncExternalStore(
    noop,
    () => {
      snapshotRef.current ??= /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      return snapshotRef.current;
    },
    () => SERVER_SNAPSHOT_MAC,
  );

  const shortcutLabel = isMac ? "⌘K" : "Ctrl K";

  return (
    <>
      {/* Mobile: icon-only 44px */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="検索を開く"
        className="h-11 w-11 sm:hidden"
      >
        <IconSearch className="h-5 w-5" />
      </Button>

      {/* Desktop: full search bar */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="検索を開く"
        className={cn(
          "hidden sm:inline-flex h-11 w-64 items-center justify-between gap-2",
          "px-3 text-sm text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <IconSearch className="h-4 w-4" aria-hidden="true" />
          検索...
        </span>
        <kbd className="pointer-events-none inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
          {shortcutLabel}
        </kbd>
      </Button>
    </>
  );
}
