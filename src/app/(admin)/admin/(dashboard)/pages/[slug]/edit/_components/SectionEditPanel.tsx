"use client";

/**
 * SectionEditPanel — 選択中セクションを `AutoSectionForm` で編集する右ペイン。
 *
 * page-hero 等の discriminated union schema は AutoSectionForm 内で discriminator
 * field（バリアント select）が自動描画され、variant 切替時は `useWatch` + `form.reset`
 * で新 variant の default 値が流し込まれる。本ファイルは section type に依存しない
 * pure な dispatcher であり、特殊処理は持たない。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconAlertTriangle } from "@tabler/icons-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { updatePageSection } from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import { getSectionDefinition } from "@/shared/lib/sections/registry";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import type { DynamicSectionOptions } from "@/shared/domain/sections/dynamic-options";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";
import { AutoSectionForm } from "../../_sections/_components/auto-section-form";
import type { ConfigFormSavePayload } from "../../_sections/_components/config-forms/shared";

interface SectionEditPanelProps {
  readonly section: PageSectionData;
  readonly dynamicOptions: DynamicSectionOptions;
  readonly onUpdated?: () => void;
}

export function SectionEditPanel({
  section,
  dynamicOptions,
  onUpdated,
}: SectionEditPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const label =
    getSectionDefinition(section.type)?.metadata.label ?? section.type;

  // 保存されている設定が読めなかったとき、フォームには**既定値**が入っている。
  // そのまま編集させると、無関係な 1 項目を直して保存した時点で本物の設定が
  // 既定値で上書きされて復旧不能になる（顧客からは「昨日まであった案内文が消えた」
  // 「トップの画像が変わった」に見える）。了承するまでフォーム自体を出さない —
  // ボタンを無効化するだけだと、Ctrl+S や別経路の submit をすり抜ける余地が残る。
  // mount 時に凍結して、保存後の router.refresh() で警告がぶれないようにする。
  const [storedConfigInvalid] = useState(section.configUnreadable);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const showResetGate = storedConfigInvalid && !resetConfirmed;

  const handleSave = (payload: ConfigFormSavePayload) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        config: payload.config,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("保存しました");
      onUpdated?.();
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SectionTypeIcon
            type={section.type}
            className="h-5 w-5 text-muted-foreground"
          />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showResetGate ? (
          <Alert variant="destructive">
            <IconAlertTriangle aria-hidden="true" />
            <AlertTitle>保存されている設定が読み込めません</AlertTitle>
            <AlertDescription>
              <p>
                このセクションの設定をデータベースから読み込めませんでした。編集フォームには初期値が入っているため、誤って上書きしないよう編集を止めています。
              </p>
              <p>
                初期値から作り直すと編集できるようになります（保存すると、読み込めなかった設定は失われます）。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setResetConfirmed(true);
                }}
                disabled={isPending}
              >
                初期値から作り直す
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <AutoSectionForm
            key={`${section.id}-${section.updatedAt.toISOString()}`}
            section={section}
            dynamicOptions={dynamicOptions}
            onSave={handleSave}
            isPending={isPending}
          />
        )}
      </CardContent>
    </Card>
  );
}
