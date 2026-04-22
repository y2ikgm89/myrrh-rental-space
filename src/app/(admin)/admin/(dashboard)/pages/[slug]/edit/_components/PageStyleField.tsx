"use client";

/**
 * PageStyleField — ページ既定スタイル（4-tier cascade の page layer）を編集する。
 *
 * `Page.pageStyleId` を設定する Server Action を wrap し、
 * 「ページ設定」タブから利用する。sectionType はページレベルのため空文字列
 * （applicableTypes フィルタを無効化）で StyleSelector に渡し、全 style を
 * 選択可能にする。
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Label } from "@/admin/components/ui";
import { updatePageStyle } from "@/admin/actions/page";
import { isMutationError } from "@/shared/lib/mutation-result";
import { StyleSelector } from "./StyleSelector";

interface PageStyleFieldProps {
  readonly pageSlug: string;
  readonly initialPageStyleId: string | null;
}

export function PageStyleField({
  pageSlug,
  initialPageStyleId,
}: PageStyleFieldProps) {
  const [isPending, startTransition] = useTransition();
  const [styleId, setStyleId] = useState<string | null>(initialPageStyleId);
  const isDirty = styleId !== initialPageStyleId;

  const handleSave = () => {
    startTransition(async () => {
      const result = await updatePageStyle(pageSlug, styleId);
      if (!isMutationError(result)) {
        toast.success("ページ既定スタイルを更新しました");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <Label className="text-sm font-medium text-foreground">
          ページ既定スタイル
        </Label>
        <p className="text-xs text-muted-foreground">
          このページのセクションに既定で適用される SectionStyle。
          個別セクションで style を選択するとセクション側が優先されます。
        </p>
      </div>
      <StyleSelector
        sectionType=""
        value={styleId}
        onChange={setStyleId}
        disabled={isPending}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isPending || !isDirty}
          size="sm"
        >
          {isPending ? "保存中..." : "ページ既定スタイルを保存"}
        </Button>
      </div>
    </div>
  );
}
