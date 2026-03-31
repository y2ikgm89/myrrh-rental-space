"use client";

/**
 * サイドパネルシェルコンポーネント
 *
 * ブログ・ニュース等の編集パネルで共通するシェル部分（オーバーレイ、アニメーション、ヘッダー）
 *
 * レスポンシブ対応:
 * - モバイル（< lg）: オーバーレイ + ドロワー形式
 * - デスクトップ（>= lg）: fixed配置、InlineEditorShellで幅調整
 */

import { IconX } from "@tabler/icons-react";
import { tv } from "tailwind-variants";
import { Button } from "@/admin/components/ui";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";
import { Z_INDEX } from "@/admin/lib/styles/z-index";
import type { ReactNode } from "react";

const styles = tv({
  slots: {
    overlay: [
      `fixed inset-0 z-[${Z_INDEX.overlay}] bg-overlay-light transition-opacity duration-300`,
      "lg:hidden", // デスクトップではオーバーレイなし
    ],
    panel: [
      `fixed right-0 z-[${Z_INDEX.editorSidePanel}] bg-background border-l`,
      "transform transition-transform duration-300 ease-in-out",
      "flex flex-col",
    ],
    header: "flex items-center justify-between p-4 border-b flex-shrink-0",
    title: "text-lg font-semibold",
    content: "flex-1 overflow-y-auto p-4",
  },
  variants: {
    isOpen: {
      true: {
        overlay: "opacity-100",
        panel: "translate-x-0",
      },
      false: {
        overlay: "opacity-0 pointer-events-none",
        panel: "translate-x-full",
      },
    },
    width: {
      default: { panel: "w-full sm:w-[420px]" },
      narrow: { panel: "w-full sm:w-96" },
    },
    isFullscreen: {
      true: { panel: "top-14 h-[calc(100vh-3.5rem)]" }, // EditorHeader(h-14=56px)の下
      false: { panel: "top-16 h-[calc(100vh-4rem)]" }, // TopBar(h-16=64px)の下
    },
  },
  defaultVariants: {
    width: "default",
    isFullscreen: false,
  },
});

type SidePanelShellProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** タイトル直下の説明文（任意） */
  description?: string;
  children: ReactNode;
  width?: "default" | "narrow";
};

export function SidePanelShell({
  isOpen,
  onClose,
  title,
  description,
  children,
  width = "default",
}: SidePanelShellProps) {
  const { isFullscreen } = useAdminLayout();
  const classes = styles({ isOpen, width, isFullscreen });

  return (
    <>
      <div className={classes.overlay()} onClick={onClose} aria-hidden="true" />

      <aside className={classes.panel()} aria-label="設定パネル">
        <div className={classes.header()}>
          <div className="min-w-0 flex-1 pr-2">
            <h2 className={classes.title()}>{title}</h2>
            {description ? (
              <p className="text-sm text-muted-foreground mt-1 leading-snug">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <IconX className="h-4 w-4" />
            <span className="sr-only">閉じる</span>
          </Button>
        </div>

        <div className={classes.content()}>{children}</div>
      </aside>
    </>
  );
}

/** サイドパネルの幅定数（コンテンツ側のマージン調整用） */
export const SIDE_PANEL_WIDTH = {
  default: 420,
  narrow: 384, // 96 * 4 = 384px (w-96)
} as const;
