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
  instagramConfigSchema,
  parseGapSize,
  type InstagramConfig,
  type InstagramConfigInput,
} from "@/admin/lib/validations/homepage-section";
import { gapSizeLabels } from "@/shared/lib/validations/section-options";

export function InstagramConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: InstagramConfig;
  onSave: (config: InstagramConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<InstagramConfigInput, unknown, InstagramConfig>({
    resolver: standardSchemaResolver(instagramConfigSchema),
    defaultValues: config,
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="instagram-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="instagram-section-label"
            {...register("sectionLabel")}
            placeholder="例: Follow Us"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="instagram-title">セクションタイトル</Label>
          <Input
            id="instagram-title"
            {...register("title")}
            placeholder="Instagram"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="instagram-columns">カラム数</Label>
            <Input
              id="instagram-columns"
              type="number"
              min={3}
              max={6}
              {...register("columns", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instagram-count">表示件数</Label>
            <Input
              id="instagram-count"
              type="number"
              min={6}
              max={12}
              {...register("count", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instagram-gap">ギャップ</Label>
            <Select
              defaultValue={config.gap}
              onValueChange={(v) => setValue("gap", parseGapSize(v))}
              disabled={isPending}
            >
              <SelectTrigger id="instagram-gap">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(gapSizeLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {gapSizeLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <SubmitButton isPending={isPending} label="保存" />
    </form>
  );
}
