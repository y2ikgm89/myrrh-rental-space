"use client";

/**
 * SectionEditor — セクション編集パネル（右パネル）
 *
 * 固定デザインのセクションに対して、編集可能なコンテンツだけを保存する。
 */

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { updatePageSection } from "@/admin/actions/page-section";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import type { ConfigFormSavePayload } from "../../_sections/_components/config-forms";
import { AutoSectionForm } from "../../_sections/_components/auto-section-form";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";

interface SectionEditorProps {
  section: PageSectionData;
  onSectionUpdated?: () => void;
}

export function SectionEditor({
  section,
  onSectionUpdated,
}: SectionEditorProps) {
  const [isPending, startTransition] = useTransition();

  const handleConfigSave = (payload: ConfigFormSavePayload) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        config: payload.config,
        ...(payload.contentJson !== undefined
          ? { contentJson: payload.contentJson }
          : {}),
      });
      if (!isMutationError(result)) {
        toast.success("保存しました");
        onSectionUpdated?.();
      } else {
        toast.error(result.error);
      }
    });
  };

  const typeLabel = sectionTypeLabels[section.type];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <SectionTypeIcon
            type={section.type}
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          {typeLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AutoSectionForm
          key={`${section.id}-${String(section.updatedAt)}`}
          section={section}
          onSave={handleConfigSave}
          isPending={isPending}
          contentOnly
        />
      </CardContent>
    </Card>
  );
}
