"use client";

import { createContext, use, useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { searchAdminResources } from "@/admin/actions/command-palette/search";
import type {
  NavItem,
  QuickAction,
  RecentItem,
  SearchResultGroup,
} from "./types";

type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  navItems: NavItem[];
  quickActions: QuickAction[];
  recents: RecentItem[];
  query: string;
  setQuery: (q: string) => void;
  results: SearchResultGroup[];
  isSearching: boolean;
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
  const [openState, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultGroup[]>([]);
  const [isSearching, startTransition] = useTransition();

  // Cmd+K / Ctrl+K でトグル
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpenState((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // 検索クエリが 2 文字以上のとき debounce して検索
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timeoutId = setTimeout(() => {
      startTransition(async () => {
        const result = await searchAdminResources(query);
        if (!("error" in result)) {
          setSearchResults(result.groups);
        }
      });
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // setOpen wrapper: ダイアログを閉じるときに query / results をクリア
  const setOpen = (nextOpen: boolean) => {
    setOpenState(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setSearchResults([]);
    }
  };

  // render 中 derive: クエリが短い場合は結果を空として扱う
  const results = query.trim().length >= 2 ? searchResults : [];

  return (
    <CommandPaletteContext
      value={{
        open: openState,
        setOpen,
        navItems,
        quickActions,
        recents,
        query,
        setQuery,
        results,
        isSearching,
      }}
    >
      {children}
    </CommandPaletteContext>
  );
}
