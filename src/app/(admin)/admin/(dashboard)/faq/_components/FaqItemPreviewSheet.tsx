"use client";

/**
 * FaqItemPreviewSheet
 *
 * テーブル行クリックで右側からスライドインするプレビューパネル。
 * Radix Dialog primitive を直接使い、Sheet 風の side-drawer スタイルを適用する。
 * 既存の中央 Dialog (@/admin/components/ui Dialog) とは別パターン。
 *
 * 参考:
 * - https://www.radix-ui.com/primitives/docs/components/dialog
 * - Zendesk / Sanity Studio の preview side panel
 */

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { IconEdit, IconX } from "@tabler/icons-react";
import { Badge, Button } from "@/admin/components/ui";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { cn } from "@/shared/lib/cn";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";

type FaqItemPreviewSheetProps = {
  readonly item: FaqItemWithCategory | null;
  readonly onClose: () => void;
};

export function FaqItemPreviewSheet({
  item,
  onClose,
}: FaqItemPreviewSheetProps) {
  const open = item !== null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-overlay",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l bg-background p-6 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
          )}
          aria-describedby={undefined}
        >
          {item && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.category.name}</Badge>
                    <Badge variant={item.isPublished ? "default" : "secondary"}>
                      {item.isPublished ? "公開中" : "下書き"}
                    </Badge>
                  </div>
                  <Dialog.Title className="text-lg font-semibold leading-snug">
                    {item.question}
                  </Dialog.Title>
                </div>
                <Dialog.Close
                  className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="プレビューを閉じる"
                >
                  <IconX className="h-4 w-4" aria-hidden="true" />
                </Dialog.Close>
              </div>

              <div className="prose prose-sm max-w-none border-y py-4">
                <SanitizedHtml html={item.answerHtml} />
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <dt>閲覧数</dt>
                <dd className="tabular-nums">
                  {item.viewCount.toLocaleString("ja-JP")}
                  {item.lastViewedAt && (
                    <span className="ml-2 text-muted-foreground/70">
                      （直近:{" "}
                      {new Date(item.lastViewedAt).toLocaleDateString("ja-JP")}
                      ）
                    </span>
                  )}
                </dd>
                <dt>役立った</dt>
                <dd className="tabular-nums">
                  {item.helpfulCount.toLocaleString("ja-JP")}
                  <span className="ml-2 text-muted-foreground/70">
                    （役立たず: {item.notHelpfulCount.toLocaleString("ja-JP")}）
                  </span>
                </dd>
                <dt>更新</dt>
                <dd>{new Date(item.updatedAt).toLocaleString("ja-JP")}</dd>
                <dt>作成</dt>
                <dd>{new Date(item.createdAt).toLocaleString("ja-JP")}</dd>
                {item.publishedAt && (
                  <>
                    <dt>公開日時</dt>
                    <dd>
                      {new Date(item.publishedAt).toLocaleString("ja-JP")}
                    </dd>
                  </>
                )}
              </dl>

              <div className="mt-auto flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={onClose}>
                  閉じる
                </Button>
                <Button asChild>
                  <Link href={`/admin/faq/items/${item.id}/edit`}>
                    <IconEdit className="mr-1 h-4 w-4" aria-hidden="true" />
                    編集
                  </Link>
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
