"use client";

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ReactNode } from "react";
import { searchAdminResources } from "@/admin/actions/command-palette/search";
import type {
  NavItem,
  QuickAction,
  RecentItem,
  SearchResultGroup,
} from "@/shared/lib/command-palette-types";
import type { FeatureModule } from "@/shared/lib/features/registry";

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
  enabledFeatures: ReadonlySet<FeatureModule>;
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
  enabledFeatures: readonly FeatureModule[];
  children: ReactNode;
};

export function CommandPaletteProvider({
  navItems,
  quickActions,
  recents,
  enabledFeatures: enabledFeatureList,
  children,
}: ProviderProps) {
  const [openState, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultGroup[]>([]);
  const [isSearching, startTransition] = useTransition();
  // Round-5 audit Finding #24: debounce だけでは同時に飛んだ 2 リクエストの
  // ネットワーク応答が到着順を保証しないため、後発 (新しい query) のリクエストが
  // 先に応答し、その後に先発 (古い query) の応答が遅れて届くと古い結果で
  // 上書きしてしまう。発行するたびに増分する連番で「最新リクエストの応答か」を
  // 判定し、古い応答は破棄する。
  const latestRequestIdRef = useRef(0);

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
      const requestId = ++latestRequestIdRef.current;
      startTransition(async () => {
        const result = await searchAdminResources(query);
        // 応答が届いた時点で自分より新しいリクエストが発行済みなら stale
        // 応答なので結果を破棄する (setSearchResults しない)。
        if (requestId !== latestRequestIdRef.current) return;
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
  const enabledFeatures = new Set<FeatureModule>(enabledFeatureList);

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
        enabledFeatures,
      }}
    >
      {children}
    </CommandPaletteContext>
  );
}
