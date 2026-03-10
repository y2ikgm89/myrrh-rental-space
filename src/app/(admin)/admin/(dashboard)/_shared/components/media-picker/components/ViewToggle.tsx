"use client";

/**
 * ViewToggle
 *
 * グリッド/リスト表示切り替え
 */

import { Grid, List } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface ViewToggleProps {
  mode: "grid" | "list";
  onChange: (mode: "grid" | "list") => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex overflow-hidden rounded border">
      <button
        type="button"
        onClick={() => onChange("grid")}
        className={cn(
          "p-2 transition-colors",
          mode === "grid" && "bg-primary text-primary-foreground",
        )}
        aria-label="グリッド表示"
      >
        <Grid className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={cn(
          "p-2 transition-colors",
          mode === "list" && "bg-primary text-primary-foreground",
        )}
        aria-label="リスト表示"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
