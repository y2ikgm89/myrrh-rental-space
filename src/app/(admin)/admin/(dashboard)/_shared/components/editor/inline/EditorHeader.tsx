"use client";

/**
 * エディターヘッダー
 *
 * インラインエディターの上部ナビゲーション
 * 保存、プレビュー、設定パネル切り替えなどのアクションを提供
 */

import { useRef } from "react";
import {
  IconArrowLeft,
  IconSettings,
  IconEye,
  IconDeviceFloppy,
  IconLoader2,
  IconWorld,
  IconLock,
  IconMessage,
} from "@tabler/icons-react";
import { tv } from "tailwind-variants";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/admin/components/ui";
import { Z_INDEX, adminZIndexClassName } from "@/admin/lib/styles/z-index";
import { useAdminZIndexImperative } from "@/admin/lib/styles/use-admin-z-index-layer";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { EditorHeaderProps } from "./types";

const styles = tv({
  slots: {
    // z-index は inline style で適用（Tailwind JIT は `z-[${VAR}]` を scan しないため CSS 未生成）
    // **不透明にする**。半透明のままだと背後の色と合成され、text-muted-foreground の
    // 実効コントラストが背後次第で変わる。エディタは `useFullscreenMode` の
    // `useLayoutEffect` で `enterFullscreen()` を呼ぶが、それが走る前
    // （SSR HTML〜hydration の窓）は `ResponsiveSidebar` がまだ描画されており、
    // viewport 固定の本ヘッダーが暗色サイドバー (`bg-sidebar-bg`) に重なる。
    // その合成結果が #989da4 になり、slug の `text-muted-foreground` (#5b646f) が
    // 2.2:1 まで落ちていた（実測: run 30677872134 の axe-admin-pages、
    // run 30678172597 の lexical-toolbar-roving-tabindex）。
    // axe がこの窓を踏むかは実行タイミング次第なので flaky に見える。
    //
    // サイドバー幅のオフセット (`lg:left-64`) で重なりを避ける手は使えない。
    // fullscreen 中はサイドバーが unmount され `DashboardShell` の `lg:pl-64` も
    // 外れるため、定常状態で 256px の空白が残る（PR #1773 の退行）。
    // 背後に依存しない不透明化が唯一レイアウトから独立した解。
    //
    // 併せて外した `backdrop-blur` は元々**視覚効果として機能していない**。
    // `InlineEditorShell` は `h-dvh` + 内側 `overflow-hidden` で本文用のスクロール
    // コンテナをヘッダー下端より下に置くため、ヘッダーの下を通過するコンテンツが
    // 存在しないため。
    // gate: `__tests__/unit/architecture/admin-editor-header-contrast.test.ts`
    header: "fixed top-0 left-0 right-0 border-b bg-background",
    container: "flex h-14 items-center justify-between px-4",
    left: "flex items-center gap-3",
    center: "flex-1 flex items-center justify-center",
    right: "flex items-center gap-2",
    titleSection: "flex items-center gap-2",
    title: "text-base font-medium truncate max-w-[300px]",
    slug: "text-sm text-muted-foreground",
    dirtyIndicator: "ml-2 text-xs text-warning-strong",
  },
})();

/**
 * 公開状態を判定するヘルパー関数
 * PostStatus ('PUBLISHED') または boolean (true) の両方に対応
 */
function checkIsPublished(
  status: EditorHeaderProps["publishActions"],
): boolean {
  if (!status) return false;
  return status.status === PostStatus.PUBLISHED || status.status === true;
}

export function EditorHeader({
  title,
  slug,
  isDirty,
  isPending,
  onOpenSettings,
  onSave,
  onPreview,
  onBack,
  extraActions,
  publishActions,
  showCommentButton,
  isCommentPanelOpen,
  onToggleCommentPanel,
  commentCount,
  metadataPanelLabel,
}: EditorHeaderProps) {
  const isPublished = checkIsPublished(publishActions);

  const headerRef = useRef<HTMLElement>(null);
  useAdminZIndexImperative(headerRef, Z_INDEX.editorToolbar);

  return (
    <header
      ref={headerRef}
      className={cn(styles.header(), adminZIndexClassName())}
    >
      <div className={styles.container()}>
        {/* 左側: 戻るボタン + タイトル */}
        <div className={styles.left()}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1"
          >
            <IconArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">戻る</span>
          </Button>

          <div className={styles.titleSection()}>
            <span className={styles.title()}>{title || "無題"}</span>
            <span className={styles.slug()}>/{slug}</span>
            {isDirty && <span className={styles.dirtyIndicator()}>未保存</span>}
          </div>
        </div>

        {/* 右側: アクションボタン */}
        <div className={styles.right()}>
          {onPreview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPreview}
              className="gap-1"
            >
              <IconEye className="h-4 w-4" />
              <span className="hidden sm:inline">プレビュー</span>
            </Button>
          )}

          {onOpenSettings && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="gap-1.5"
              title={
                metadataPanelLabel
                  ? `${metadataPanelLabel}を開く（タイトル・SEO・公開など）`
                  : "設定ダイアログを開く（タイトル・SEO・公開など）"
              }
              aria-label={
                metadataPanelLabel
                  ? `${metadataPanelLabel}を開く`
                  : "設定ダイアログを開く"
              }
            >
              <IconSettings className="h-4 w-4 shrink-0" aria-hidden />
              {metadataPanelLabel ? (
                <span
                  className="hidden xl:inline max-w-[7rem] truncate"
                  aria-hidden
                >
                  {metadataPanelLabel}
                </span>
              ) : (
                <span className="sr-only">設定</span>
              )}
            </Button>
          )}

          {showCommentButton && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleCommentPanel}
              className={isCommentPanelOpen ? "bg-accent" : ""}
            >
              <IconMessage className="h-4 w-4" />
              {commentCount !== undefined && commentCount > 0 && (
                <span className="ml-1 text-xs">{commentCount}</span>
              )}
              <span className="sr-only">コメント</span>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={isPending || !isDirty}
            className="gap-1"
          >
            {isPending ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : (
              <IconDeviceFloppy className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isPending ? "保存中..." : "保存"}
            </span>
          </Button>

          {/* 公開/非公開ボタン */}
          {publishActions &&
            (isPublished ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={publishActions.onUnpublish}
                disabled={isPending}
                className="gap-1 text-warning hover:text-warning/80"
              >
                <IconLock className="h-4 w-4" />
                <span className="hidden sm:inline">非公開にする</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={publishActions.onPublish}
                disabled={isPending || isDirty}
                className="gap-1 bg-success hover:bg-success/90"
              >
                <IconWorld className="h-4 w-4" />
                <span className="hidden sm:inline">公開する</span>
              </Button>
            ))}

          {extraActions}
        </div>
      </div>
    </header>
  );
}
