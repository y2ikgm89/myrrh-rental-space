"use client";

import { createContext, use, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { NavItem, QuickAction, RecentItem } from "./types";

type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  navItems: NavItem[];
  quickActions: QuickAction[];
  recents: RecentItem[];
};

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined);

export function useCommandPalette() {
  const ctx = use(CommandPaletteContext);
  if (ctx === undefined) {
    throw new Error("useCommandPalette must be used within Provider");
  }
  return ctx;
}

type ProviderProps = {
  navItems: NavItem[];
  quickActions: QuickAction[];
  recents: RecentItem[];
  children: ReactNode;
};

export function CommandPaletteProvider({
  navItems,
  quickActions,
  recents,
  children,
}: ProviderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <CommandPaletteContext
      value={{ open, setOpen, navItems, quickActions, recents }}
    >
      {children}
    </CommandPaletteContext>
  );
}
