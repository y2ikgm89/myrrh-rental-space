"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import dynamic from "next/dynamic";
import {
  customConfigSchema,
  getCustomConfig,
  parseMaxWidth,
  parsePadding,
  type CustomConfig,
  type CustomConfigInput,
} from "@/shared/lib/validations/section";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { FormActions, type ConfigFormProps } from "./shared";

const LexicalEditor = dynamic(
  () =>
    import("@/admin/components/editor/lexical/LexicalEditor").then((mod) => ({
      default: mod.LexicalEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">
          エディタを読み込み中...
        </div>
      </div>
    ),
  },
);

export default function CustomConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getCustomConfig(section.config);
  const [editorContentJson, setEditorContentJson] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { isDirty },
  } = useForm<CustomConfigInput, unknown, CustomConfig>({
    resolver: standardSchemaResolver(customConfigSchema),
    defaultValues: config,
  });

  const handleFormSubmit = (formData: CustomConfig) => {
    onSave({ config: formData, contentJson: editorContentJson });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="custom-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="custom-section-label"
            {...register("sectionLabel")}
            placeholder="例: Contents"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="custom-max-width">最大幅</Label>
            <Select
              defaultValue={config.maxWidth}
              onValueChange={(v) => setValue("maxWidth", parseMaxWidth(v))}
              disabled={isPending}
            >
              <SelectTrigger id="custom-max-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">小 (640px)</SelectItem>
                <SelectItem value="md">中 (768px)</SelectItem>
                <SelectItem value="lg">大 (1024px)</SelectItem>
                <SelectItem value="xl">特大 (1280px)</SelectItem>
                <SelectItem value="full">全幅</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-padding">パディング</Label>
            <Select
              defaultValue={config.padding}
              onValueChange={(v) => setValue("padding", parsePadding(v))}
              disabled={isPending}
            >
              <SelectTrigger id="custom-padding">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし</SelectItem>
                <SelectItem value="sm">小</SelectItem>
                <SelectItem value="md">中</SelectItem>
                <SelectItem value="lg">大</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom-class">追加CSSクラス（任意）</Label>
          <Input
            id="custom-class"
            {...register("containerClass")}
            placeholder="bg-muted"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label>コンテンツ</Label>
          <LexicalEditor
            contentJson={
              section.contentJson
                ? JSON.stringify(section.contentJson)
                : undefined
            }
            contentHtml={section.contentHtml || ""}
            onChange={setEditorContentJson}
            placeholder="セクションのコンテンツを入力..."
            className={EDITOR_PROSE_CLASSES}
            height="400px"
          />
        </div>
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}
