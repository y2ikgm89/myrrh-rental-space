"use client";

/**
 * SectionEditor -- セクション編集パネル（右パネル）
 *
 * タブなし、単一スクロール。コンテンツ + デザインを分離保存。
 * AutoSectionForm（コンテンツ）と DesignFields（デザイン）はそれぞれ独立した保存フロー。
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/admin/components/ui";
import {
  updatePageSection,
  type PageSectionData,
} from "@/admin/actions/page-section";
import type { SectionDesign } from "@/shared/lib/validations/section";
import { isMutationError } from "@/shared/lib/mutation-result";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import { SectionEmptyState } from "./SectionEmptyState";
import type { ConfigFormSavePayload } from "../../_sections/_components/config-forms";
import { AutoSectionForm } from "../../_sections/_components/auto-section-form";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";
import { DesignFields } from "./DesignFields";

interface SectionEditorProps {
  section: PageSectionData | null;
  hasSections: boolean;
  onAddSection: () => void;
  onSectionUpdated: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function SectionEditor({
  section,
  hasSections,
  onAddSection,
  onSectionUpdated,
  onDirtyChange,
}: SectionEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [configDirty, setConfigDirty] = useState(false);
  const [designDirty, setDesignDirty] = useState(false);
  const latestDesignRef = useRef<SectionDesign | null>(null);

  useEffect(() => {
    onDirtyChange?.(configDirty || designDirty);
  }, [configDirty, designDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      setConfigDirty(false);
      setDesignDirty(false);
      latestDesignRef.current = null;
    };
  }, [section?.id]);

  if (!section) {
    return (
      <SectionEmptyState
        hasSections={hasSections}
        onAddSection={onAddSection}
      />
    );
  }

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
        onSectionUpdated();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleTitleSave = (title: string) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, { title });
      if (!isMutationError(result)) {
        toast.success("タイトルを更新しました");
        onSectionUpdated();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDesignSave = () => {
    const design = latestDesignRef.current;
    if (!design) return;
    startTransition(async () => {
      const designRecord: Record<string, unknown> = Object.fromEntries(
        Object.entries(design),
      );
      const result = await updatePageSection(section.id, {
        design: designRecord,
      });
      if (!isMutationError(result)) {
        toast.success("デザインを更新しました");
        onSectionUpdated();
      } else {
        toast.error(result.error);
      }
    });
  };

  const typeLabel = sectionTypeLabels[section.type];

  return (
    <div className="space-y-4">
      {/* コンテンツ Card */}
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
        <CardContent className="space-y-4">
          <AutoSectionForm
            section={section}
            onSave={handleConfigSave}
            isPending={isPending}
            onDirtyChange={setConfigDirty}
          />
          {/* 管理用タイトル（メタデータ — コンテンツの後に配置） */}
          <SectionTitleField
            title={section.title ?? ""}
            onSave={handleTitleSave}
            isPending={isPending}
          />
        </CardContent>
      </Card>

      {/* デザイン Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">デザイン設定</CardTitle>
        </CardHeader>
        <CardContent>
          <DesignFields
            design={section.design}
            onDesignChange={(d) => {
              latestDesignRef.current = d;
            }}
            onDirtyChange={setDesignDirty}
          />
        </CardContent>
        <CardFooter className="flex justify-end pt-0">
          <Button
            onClick={handleDesignSave}
            disabled={isPending || !designDirty}
            size="sm"
          >
            {isPending ? "保存中..." : "デザインを保存"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// =============================================================================
// Section Title Field (inline)
// =============================================================================

function SectionTitleField({
  title,
  onSave,
  isPending,
}: {
  title: string;
  onSave: (title: string) => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="section-title" className="text-xs text-muted-foreground">
        管理用タイトル
      </Label>
      <Input
        id="section-title"
        defaultValue={title}
        placeholder="セクション名..."
        disabled={isPending}
        onBlur={(e) => {
          const newTitle = e.target.value.trim();
          if (newTitle !== title) {
            onSave(newTitle);
          }
        }}
      />
    </div>
  );
}
