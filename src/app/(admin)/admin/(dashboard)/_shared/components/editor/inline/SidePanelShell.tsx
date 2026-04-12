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
    // モバイルのみオーバーレイ（デスクトップでは lg:hidden）
    overlay: [
      `fixed inset-0 z-[${Z_INDEX.overlay}] bg-overlay-light transition-opacity duration-300`,
      "lg:hidden",
    ],
    // パネル本体
    // モバイル: fixed オーバーレイ + translate-x アニメーション
    // デスクトップ: lg:static で flex 子要素、幅 0 ↔ 420px のアニメーション
    panel: [
      "bg-background border-l flex flex-col",
      // モバイル用
      `fixed right-0 z-[${Z_INDEX.editorSidePanel}]`,
      "transform transition-transform duration-300 ease-in-out",
      "w-full sm:w-[420px]",
      // デスクトップ用オーバーライド
      "lg:static lg:z-auto lg:shrink-0 lg:transform-none",
      "lg:transition-[width] lg:duration-200 lg:ease-out",
    ],
    header: "flex items-center justify-between p-4 border-b flex-shrink-0",
    title: "text-lg font-semibold",
    // 閉じるときのコンテンツ溢れ防止: overflow-hidden でクリップ
    content: "flex-1 overflow-y-auto p-4 overflow-x-hidden",
  },
  variants: {
    // width を isOpen より先に定義し、isOpen: false の lg:w-0 が
    // tailwind-merge の「後勝ち」ルールで確実に優先されるようにする
    width: {
      default: { panel: "lg:w-[420px]" },
      narrow: { panel: "lg:w-96" },
    },
    isFullscreen: {
      // モバイルのみ top/height 制御、デスクトップは flex 親から高さ取得
      true: { panel: "top-14 h-[calc(100vh-3.5rem)] lg:top-auto lg:h-auto" },
      false: { panel: "top-16 h-[calc(100vh-4rem)] lg:top-auto lg:h-auto" },
    },
    isOpen: {
      true: {
        overlay: "opacity-100",
        panel: "translate-x-0",
      },
      false: {
        overlay: "opacity-0 pointer-events-none",
        // モバイル: スライドアウト
        // デスクトップ: 幅 0 + border 非表示 + overflow-hidden（内部コンテンツをクリップ）
        panel: "translate-x-full lg:w-0 lg:border-l-0 lg:overflow-hidden",
      },
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
