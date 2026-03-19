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
  SubmitButton,
} from "@/admin/components/ui";

import { keysOf } from "@/shared/lib/serialize";
import {
  embedConfigSchema,
  parseEmbedAspectRatio,
  parseMaxWidth,
  parseBorderRadius,
  type EmbedConfig,
  type EmbedConfigInput,
} from "@/admin/lib/validations/homepage-section";
import {
  embedAspectRatioLabels,
  maxWidthLabels,
  borderRadiusLabels,
} from "@/shared/lib/validations/section-options";

export function EmbedConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: EmbedConfig;
  onSave: (config: EmbedConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EmbedConfigInput, unknown, EmbedConfig>({
    resolver: standardSchemaResolver(embedConfigSchema),
    defaultValues: config,
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="embed-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="embed-section-label"
            {...register("sectionLabel")}
            placeholder="Media"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-title">タイトル</Label>
          <Input
            id="embed-title"
            {...register("title")}
            placeholder="動画"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="embed-url">埋め込みURL</Label>
          <Input
            id="embed-url"
            type="url"
            {...register("embedUrl")}
            placeholder="https://www.youtube.com/embed/..."
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="embed-aspect-ratio">アスペクト比</Label>
            <Select
              defaultValue={config.aspectRatio}
              onValueChange={(v) =>
                setValue("aspectRatio", parseEmbedAspectRatio(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="embed-aspect-ratio">
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
      </div>

      <div className="flex justify-end pt-2">
        <SubmitButton isPending={isPending} label="保存" />
      </div>
    </form>
  );
}
