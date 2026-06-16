"use client";

import { useTransition, type ReactElement } from "react";
import { useQueryStates, debounce } from "nuqs";
import { IconSearch } from "@tabler/icons-react";
import { searchFilterParsers } from "@/public/lib/search-params";
import { cn } from "@/shared/lib/cn";

interface SearchBarProps {
  readonly placeholder?: string;
}

export function SearchBar({
  placeholder = "検索...",
}: SearchBarProps): ReactElement {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(searchFilterParsers, {
    // 検索フィルタは中間入力を履歴に積まない（戻る操作の破綻を防ぐ）。
    history: "replace",
    shallow: false,
    // 非 shallow な RSC 再フェッチの pending 状態を観測してフィードバック表示する。
    startTransition,
  });

  function handleChange(value: string) {
    const next = { q: value || null, page: 1 };
    // クリア時は即時反映、入力中は 300ms デバウンス
    // （1 打鍵ごとのサーバー往復を抑止する公式推奨パターン）。
    if (value === "") {
      void setParams(next);
    } else {
      void setParams(next, { limitUrlUpdates: debounce(300) });
    }
  }

  return (
    <div className="relative" aria-busy={isPending}>
      <IconSearch
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={params.q}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          // text-base(16px) でモバイルの iOS Safari フォーカス時オートズームを防止、
          // md 以上は従来の text-sm(14px) を維持。
          "h-11 w-full border border-border bg-background pl-10 pr-4 text-base text-foreground transition-opacity placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm",
          isPending && "opacity-60",
        )}
        aria-label={placeholder}
      />
    </div>
  );
}
