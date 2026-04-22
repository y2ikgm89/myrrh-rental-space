"use client";

/**
 * エディターヘッダー
 *
 * インラインエディターの上部ナビゲーション
 * 保存、プレビュー、設定パネル切り替えなどのアクションを提供
 */

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
import { Button } from "@/admin/components/ui";
import { Z_INDEX } from "@/admin/lib/styles/z-index";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { EditorHeaderProps } from "./types";

const styles = tv({
  slots: {
    // z-index は inline style で適用（Tailwind JIT は `z-[${VAR}]` を scan しないため CSS 未生成）
    header:
      "fixed top-0 left-0 right-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
    container: "flex h-14 items-center justify-between px-4",
    left: "flex items-center gap-3",
    center: "flex-1 flex items-center justify-center",
    right: "flex items-center gap-2",
    titleSection: "flex items-center gap-2",
    title: "text-base font-medium truncate max-w-[300px]",
    slug: "text-sm text-muted-foreground",
    dirtyIndicator: "ml-2 text-xs text-warning",
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

  return (
    <header
      className={styles.header()}
      style={{ zIndex: Z_INDEX.editorToolbar }}
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
