"use client";

/**
 * SectionEditor — セクション編集パネル（右パネル）
 *
 * タブなし、単一スクロール。AutoSectionForm（コンテンツ）と Style カード
 * （styleId + styleOverride）はそれぞれ独立した保存フロー。
 */

import { useEffect, useState, useTransition } from "react";
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
import { updatePageSection } from "@/admin/actions/page-section";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import type { SectionStyleOverride } from "@/shared/lib/validations/section-style";
import { SectionEmptyState } from "./SectionEmptyState";
import type { ConfigFormSavePayload } from "../../_sections/_components/config-forms";
import { AutoSectionForm } from "../../_sections/_components/auto-section-form";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";
import { StyleSelector } from "./StyleSelector";
import { StyleOverridePanel } from "./StyleOverridePanel";
import { ResolvedStylePreview } from "./ResolvedStylePreview";

interface SectionEditorProps {
  section: PageSectionData | null;
  hasSections: boolean;
  onAddSection: () => void;
  onSectionUpdated: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function parseInitialOverride(value: unknown): SectionStyleOverride | null {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }
  // 安全な JSON 形で保持。Server Action 側で sectionStyleOverrideSchema が再検証する。
  return value as SectionStyleOverride;
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
  const [styleDirty, setStyleDirty] = useState(false);

  // Style Card local state（保存前の draft）— 親が key={section.id} で remount するため、
  // 各 useState 初期値は props から安全に派生できる（React 公式 "Resetting state with key"）
  const [styleIdDraft, setStyleIdDraft] = useState<string | null>(
    section?.styleId ?? null,
  );
  const [overrideDraft, setOverrideDraft] =
    useState<SectionStyleOverride | null>(() =>
      parseInitialOverride(section?.styleOverride),
    );

  // Dirty 通知は useEffect で（parent setState を render 中に発火しないため）
  useEffect(() => {
    onDirtyChange?.(configDirty || styleDirty);
  }, [configDirty, styleDirty, onDirtyChange]);

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

  const handleStyleIdChange = (next: string | null) => {
    setStyleIdDraft(next);
    setStyleDirty(true);
  };

  const handleOverrideChange = (next: SectionStyleOverride | null) => {
    setOverrideDraft(next);
    setStyleDirty(true);
  };

  const handleStyleSave = () => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        styleId: styleIdDraft,
        styleOverride: overrideDraft,
      });
      if (!isMutationError(result)) {
        toast.success("スタイルを更新しました");
        setStyleDirty(false);
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

      {/* スタイル Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">スタイル設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Style preset
            </Label>
            <StyleSelector
              sectionType={section.type}
              value={styleIdDraft}
              onChange={handleStyleIdChange}
              disabled={isPending}
            />
          </div>

          <StyleOverridePanel
            value={overrideDraft}
            onChange={handleOverrideChange}
            disabled={isPending}
          />

          <ResolvedStylePreview section={section} />
        </CardContent>
        <CardFooter className="flex justify-end pt-0">
          <Button
            onClick={handleStyleSave}
            disabled={isPending || !styleDirty}
            size="sm"
          >
            {isPending ? "保存中..." : "スタイルを保存"}
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
