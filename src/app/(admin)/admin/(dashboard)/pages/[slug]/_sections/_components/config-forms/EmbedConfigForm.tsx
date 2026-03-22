"use client";

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
  Textarea,
} from "@/admin/components/ui";
import {
  embedConfigSchema,
  parseEmbedAspectRatio,
  parseMaxWidth,
  parseBorderRadius,
  type EmbedConfig,
  type EmbedConfigInput,
} from "@/shared/lib/validations/section";
import {
  getEmbedConfig,
} from "@/shared/lib/validations/section-defaults";
import {
  borderRadiusLabels,
  embedAspectRatioLabels,
  maxWidthLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function EmbedConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getEmbedConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { isDirty },
  } = useForm<EmbedConfigInput, unknown, EmbedConfig>({
    resolver: standardSchemaResolver(embedConfigSchema),
    defaultValues: config,
  });

  const handleFormSave = handleSubmit((data) => {
    onSave({ config: data });
  });

  return (
    <form onSubmit={handleFormSave} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="embed-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="embed-section-label"
            {...register("sectionLabel")}
            placeholder="例: Media"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-title">タイトル（任意）</Label>
          <Input
            id="embed-title"
            {...register("title")}
            placeholder="埋め込みコンテンツ"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-url">埋め込みURL（任意）</Label>
          <Input
            id="embed-url"
            {...register("embedUrl")}
            placeholder="https://www.youtube.com/embed/..."
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            YouTube、Vimeo等の埋め込みURL
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-code">埋め込みコード（任意）</Label>
          <Textarea
            id="embed-code"
            {...register("embedCode")}
            placeholder="<iframe ...></iframe>"
            rows={4}
            disabled={isPending}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            URLの代わりにHTMLコードを直接指定できます
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="embed-aspect">アスペクト比</Label>
            <Select
              defaultValue={config.aspectRatio}
              onValueChange={(v) =>
                setValue("aspectRatio", parseEmbedAspectRatio(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="embed-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(embedAspectRatioLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {embedAspectRatioLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="embed-max-width">最大幅</Label>
            <Select
              defaultValue={config.maxWidth}
              onValueChange={(v) => setValue("maxWidth", parseMaxWidth(v))}
              disabled={isPending}
            >
              <SelectTrigger id="embed-max-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(maxWidthLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {maxWidthLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-border-radius">角丸</Label>
          <Select
            defaultValue={config.borderRadius}
            onValueChange={(v) =>
              setValue("borderRadius", parseBorderRadius(v))
            }
            disabled={isPending}
          >
            <SelectTrigger id="embed-border-radius">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(borderRadiusLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {borderRadiusLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
