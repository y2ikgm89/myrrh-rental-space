"use client";

/**
 * 右パネル — コンテンツ/デザインのタブ切替
 *
 * コンテンツタブ: タイトル入力 + AutoSectionForm（スキーマ駆動）
 * デザインタブ: DesignPanel（ToggleGroup + Accordion）
 */

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui";
import {
  updatePageSection,
  type PageSectionData,
} from "@/admin/actions/page-section";
import type { SectionDesign } from "@/shared/lib/validations/section";
import { isMutationError } from "@/shared/lib/mutation-result";
import { SectionDetailHeader } from "./SectionDetailHeader";
import { SectionEmptyState } from "./SectionEmptyState";
import type { ConfigFormSavePayload } from "../../_sections/_components/config-forms";
import { AutoSectionForm } from "../../_sections/_components/auto-section-form";
import { DesignPanel } from "./DesignPanel";

interface SectionDetailPanelProps {
  section: PageSectionData | null;
  hasSections: boolean;
  onAddSection: () => void;
  onSectionUpdated: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function SectionDetailPanel({
  section,
  hasSections,
  onAddSection,
  onSectionUpdated,
  onDirtyChange,
}: SectionDetailPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [configDirty, setConfigDirty] = useState(false);
  const [designDirty, setDesignDirty] = useState(false);

  useEffect(() => {
    onDirtyChange?.(configDirty || designDirty);
  }, [configDirty, designDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      setConfigDirty(false);
      setDesignDirty(false);
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

  const handleDesignSave = (design: SectionDesign) => {
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

  return (
    <>
      <SectionDetailHeader section={section} />

      <Tabs defaultValue="content" className="w-full">
        <TabsList className="mt-3">
          <TabsTrigger value="content">コンテンツ</TabsTrigger>
          <TabsTrigger value="design">デザイン</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-4 space-y-6">
          <SectionTitleField
            title={section.title ?? ""}
            onSave={handleTitleSave}
            isPending={isPending}
          />
          <AutoSectionForm
            section={section}
            onSave={handleConfigSave}
            isPending={isPending}
            onDirtyChange={setConfigDirty}
          />
        </TabsContent>

        <TabsContent value="design" className="mt-4">
          <DesignPanel
            section={{
              id: section.id,
              type: section.type,
              design: section.design,
            }}
            onDesignSave={handleDesignSave}
            onDirtyChange={setDesignDirty}
          />
        </TabsContent>
      </Tabs>
    </>
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
