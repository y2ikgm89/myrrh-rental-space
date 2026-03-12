"use client";

/**
 * セクションエディタ
 *
 * 各セクションタイプに応じた設定フォームを表示
 */

import "@/admin/lib/sections/register-admin-sections";
import { useTransition } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { DesignPanel } from "./DesignPanel";
import { ArrowLeft, Save } from "lucide-react";
import {
  updateHomepageSection,
  type HomepageSectionData,
} from "@/admin/actions/homepage-settings";
import type { Serialized } from "@/shared/lib/serialize";
import { isMutationError } from "@/shared/lib/mutation-result";
import { getAdminSectionMeta } from "@/shared/lib/sections/admin-registry";
import { SchemaForm } from "@/admin/components/schema-form";

// =============================================================================
// Props
// =============================================================================

interface SectionEditorProps {
  section: Serialized<HomepageSectionData>;
  onBack: () => void;
  onSave: () => void;
  /** false にするとエディタ内蔵ヘッダーを非表示（専用ページで使用） */
  showHeader?: boolean;
}

// =============================================================================
// SectionEditor
// =============================================================================

export function SectionEditor({
  section,
  onBack,
  onSave,
  showHeader = true,
}: SectionEditorProps) {
  const [isPending, startTransition] = useTransition();
  const definition = getAdminSectionMeta(section.componentId);
  const label = definition?.meta.label ?? section.componentId;

  const handleConfigSave = (config: Record<string, unknown>) => {
    startTransition(async () => {
      const result = await updateHomepageSection(section.id, { config });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("セクションを更新しました");
      onSave();
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <div>
            <h3 className="text-lg font-medium">
              {section.title || label}の設定
            </h3>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      )}

      {/* Title Edit */}
      <Card>
        <CardHeader>
          <CardTitle>セクション情報</CardTitle>
          <CardDescription>セクションの基本情報</CardDescription>
        </CardHeader>
        <CardContent>
          <TitleForm section={section} isPending={isPending} onSave={onSave} />
        </CardContent>
      </Card>

      {/* Content & Design Tabs */}
      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">コンテンツ</TabsTrigger>
          <TabsTrigger value="design">デザイン</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle>セクション設定</CardTitle>
              <CardDescription>{label}固有の設定</CardDescription>
            </CardHeader>
            <CardContent>
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
                <p className="text-muted-foreground">
                  このセクションタイプは編集できません
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="design">
          <Card>
            <CardHeader>
              <CardTitle>デザイン設定</CardTitle>
              <CardDescription>
                余白・背景・テキストスタイリング・レイアウト
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DesignPanel section={section} onSave={onSave} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Title Form
// =============================================================================

const titleSchema = z.object({
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
});

type TitleFormData = z.infer<typeof titleSchema>;

function TitleForm({
  section,
  isPending,
  onSave,
}: {
  section: Serialized<HomepageSectionData>;
  isPending: boolean;
  onSave: () => void;
}) {
  const [isUpdating, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TitleFormData>({
    resolver: standardSchemaResolver(titleSchema),
    defaultValues: { title: section.title || "" },
  });

  const handleTitleSave = (data: TitleFormData) => {
    startTransition(async () => {
      const result = await updateHomepageSection(section.id, {
        title: data.title || undefined,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("タイトルを更新しました");
      onSave();
    });
  };

  const definition = getAdminSectionMeta(section.componentId);
  const label = definition?.meta.label ?? section.componentId;

  return (
    <form onSubmit={handleSubmit(handleTitleSave)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="section-title">カスタムタイトル（任意）</Label>
        <Input
          id="section-title"
          {...register("title")}
          placeholder={label}
          disabled={isPending || isUpdating}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          空欄の場合はデフォルトのタイトルが使用されます
        </p>
      </div>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={isPending || isUpdating}
      >
        <Save className="h-4 w-4 mr-2" />
        タイトルを保存
      </Button>
    </form>
  );
}
