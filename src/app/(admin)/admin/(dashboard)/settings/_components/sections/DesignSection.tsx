"use client";

/**
 * DesignSection — グローバル Section Style（4-tier cascade の global layer）を編集する。
 *
 * `Settings.globalSectionStyleId` を設定する Server Action を wrap し、
 * サイト設定の「レイアウト」タブに追加する。applicableTypes は考慮せず全 style を選択可能
 * にする（sectionType="" で StyleSelector にフィルタ無効化を伝える）。
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SubmitButton,
} from "@/admin/components/ui";
import { updateGlobalSectionStyle } from "@/admin/actions/settings";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { StyleSelector } from "../../../pages/[slug]/edit/_components/StyleSelector";

interface DesignSectionProps {
  settings: Serialized<SettingsData>;
}

export function DesignSection({ settings }: DesignSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [styleId, setStyleId] = useState<string | null>(
    settings.globalSectionStyleId,
  );
  const isDirty = styleId !== settings.globalSectionStyleId;

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateGlobalSectionStyle(styleId);
      if (!isMutationError(result)) {
        toast.success("グローバル Section Style を保存しました");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>グローバル Section Style</CardTitle>
        <CardDescription>
          全ページ・全セクションに既定で適用される SectionStyle。 ページ個別 /
          セクション個別の設定が優先されます。
          未選択の場合はハードコードされたデフォルト値が使われます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StyleSelector
          sectionType=""
          value={styleId}
          onChange={setStyleId}
          disabled={isPending}
        />
        <div className="flex justify-end pt-2">
          <SubmitButton
            isPending={isPending}
            label="グローバルスタイルを保存"
            disabled={!isDirty}
            onClick={handleSave}
          />
        </div>
      </CardContent>
    </Card>
  );
}
