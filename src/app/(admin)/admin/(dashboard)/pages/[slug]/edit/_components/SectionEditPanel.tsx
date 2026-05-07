"use client";

/**
 * SectionEditPanel — 選択中セクションを `AutoSectionForm` で編集する右ペイン。
 *
 * page-hero 等の discriminated union schema は AutoSectionForm 内で discriminator
 * field（バリアント select）が自動描画され、variant 切替時は `useWatch` + `form.reset`
 * で新 variant の default 値が流し込まれる。本ファイルは section type に依存しない
 * pure な dispatcher であり、特殊処理は持たない。
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { updatePageSection } from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
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

  const handleSave = (payload: ConfigFormSavePayload) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        config: payload.config,
        ...(payload.contentJson !== undefined
          ? { contentJson: payload.contentJson }
          : {}),
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
          {sectionTypeLabels[section.type] ?? section.type}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AutoSectionForm
          key={`${section.id}-${section.updatedAt.toISOString()}`}
          section={section}
          dynamicOptions={dynamicOptions}
          onSave={handleSave}
          isPending={isPending}
          contentOnly
        />
      </CardContent>
    </Card>
  );
}
