"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, Label, SubmitButton } from "@/admin/components/ui";

import {
  customConfigSchema,
  type CustomConfig,
  type CustomConfigInput,
} from "@/admin/lib/validations/homepage-section";
import type { HomepageSectionData } from "@/admin/actions/homepage-settings";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";

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

export function CustomConfigForm({
  config,
  section,
  onSave,
  isPending,
}: {
  config: CustomConfig;
  section: HomepageSectionData;
  onSave: (config: CustomConfig, contentJson: string) => void;
  isPending: boolean;
}) {
  const [editorContentJson, setEditorContentJson] = useState("");

  const { register, handleSubmit } = useForm<
    CustomConfigInput,
    unknown,
    CustomConfig
  >({
    resolver: zodResolver(customConfigSchema),
    defaultValues: config,
  });

  const handleFormSubmit = (formData: CustomConfig) => {
    onSave(formData, editorContentJson);
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

        <div className="space-y-2">
          <Label htmlFor="custom-class">追加CSSクラス（任意）</Label>
          <Input
            id="custom-class"
            {...register("containerClass")}
            placeholder="bg-muted py-12"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            セクションコンテナに追加するTailwindクラス
          </p>
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
            height="300px"
          />
        </div>
      </div>

      <SubmitButton isPending={isPending} label="保存" />
    </form>
  );
}
