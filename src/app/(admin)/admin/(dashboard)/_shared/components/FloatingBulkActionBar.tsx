"use client";

import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "./ui/button";

type FloatingBulkActionBarProps = {
  selectedCount: number;
  onClear: () => void;
  isPending?: boolean;
  children: ReactNode;
};

/**
 * 全 admin テーブルで共通利用するフローティング一括操作バー。
 *
 * Round-4 audit Cluster J / Finding #12 (mobile): 旧実装は各 BulkActions
 * ファイルが `fixed bottom-6 left-1/2 -translate-x-1/2` + 単列 flex を
 * 直書きしていたため、375px viewport (iPhone SE) では 5 ボタン程度で
 * 左端の「一括有効化」と右端の「X」が画面外に飛び出していた。
 *
 * SSoT 化のポイント:
 * - outer は `fixed inset-x-0 bottom-0 px-4` + `flex justify-center` で
 *   viewport 幅制限を作り、内部の bar は `max-w-full flex-wrap` で複数行
 *   ラップする。translate ベースの centering をやめて overflow を根絶。
 * - iOS gesture bar 分の safe-area を `env(safe-area-inset-bottom)` で確保。
 * - outer は `pointer-events-none`、bar 本体のみ `pointer-events-auto` に
 *   することで、周囲の table 行が bar 帯域に隠れて操作不能になるのを防ぐ。
 */
export function FloatingBulkActionBar({
  selectedCount,
  onClear,
  isPending = false,
  children,
}: FloatingBulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
    >
      <div
        role="toolbar"
        aria-label="一括操作"
        className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg"
      >
        <span
          className="text-sm font-medium"
          aria-live="polite"
          aria-atomic="true"
        >
          {selectedCount}件選択中
        </span>

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        {children}

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isPending}
          aria-label="選択を解除"
        >
          <IconX className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
