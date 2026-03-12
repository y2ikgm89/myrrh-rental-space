"use client";

/**
 * 右パネル — コンテンツ/デザインのタブ切替
 *
 * コンテンツタブ: タイトル入力 + SchemaForm (registry configSchema)
 * デザインタブ: 汎化版 DesignPanel
 */

import "@/admin/lib/sections/register-admin-sections";
import { useEffect, useState, useTransition } from "react";
import { z } from "zod";
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
import { getAdminSectionMeta } from "@/shared/lib/sections/admin-registry";
import { SchemaForm } from "@/admin/components/schema-form";
import { SectionDetailHeader } from "./SectionDetailHeader";
import { SectionEmptyState } from "./SectionEmptyState";
import { DesignPanel } from "../../../../settings/_components/homepage/DesignPanel";
import { EffectSelector } from "@/admin/components/effect-editor";

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
  const [designDirty, setDesignDirty] = useState(false);

  // dirty集約: designのdirtyを通知
  useEffect(() => {
    onDirtyChange?.(designDirty);
  }, [designDirty, onDirtyChange]);

  // セクション変更時にdirtyリセット
  useEffect(() => {
    return () => {
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

  const definition = getAdminSectionMeta(section.componentId);

  const handleConfigSave = (config: Record<string, unknown>) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, { config });
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
      // SectionDesign → Record<string, unknown>: Zodバリデーション済みデザイン設定をJSON入力形式に変換
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
    <div className="space-y-6">
      <SectionDetailHeader section={section} />

      <Tabs defaultValue="content" className="w-full">
        <TabsList>
          <TabsTrigger value="content">コンテンツ</TabsTrigger>
          <TabsTrigger value="design">デザイン</TabsTrigger>
          <TabsTrigger value="effects">エフェクト</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-4 space-y-6">
          {/* セクションタイトル */}
          <SectionTitleField
            title={section.title ?? ""}
            onSave={handleTitleSave}
            isPending={isPending}
          />

          {/* Config Form */}
          {definition ? (
            <SchemaForm
              schema={definition.configSchema}
              defaultValues={z
                .record(z.string(), z.unknown())
                .catch({})
                .parse(section.config ?? definition.defaultConfig ?? {})}
              onSubmit={handleConfigSave}
              isPending={isPending}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              このセクションタイプにはコンテンツ設定がありません
            </p>
          )}
        </TabsContent>

        <TabsContent value="design" className="mt-4">
          <DesignPanel
            section={{
              id: section.id,
              componentId: section.componentId,
              design: section.design,
            }}
            onDesignSave={handleDesignSave}
            onDirtyChange={setDesignDirty}
          />
        </TabsContent>

        <TabsContent value="effects" className="mt-4">
          <EffectSelector />
        </TabsContent>
      </Tabs>
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
    <div className="space-y-2">
      <Label htmlFor="section-title">セクションタイトル（管理用）</Label>
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
      <p className="text-xs text-muted-foreground">
        管理画面でのセクション識別用。空欄時はタイプ名が表示されます
      </p>
    </div>
  );
}
