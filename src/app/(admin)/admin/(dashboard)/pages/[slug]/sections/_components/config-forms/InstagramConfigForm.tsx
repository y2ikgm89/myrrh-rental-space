"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import {
  instagramConfigSchema,
  getInstagramConfig,
  parseGapSize,
  type InstagramConfig,
  type InstagramConfigInput,
} from "@/shared/lib/validations/section";
import { gapSizeLabels } from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function InstagramConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getInstagramConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { isDirty },
  } = useForm<InstagramConfigInput, unknown, InstagramConfig>({
    resolver: zodResolver(instagramConfigSchema),
    defaultValues: config,
  });

  return (
    <form
      onSubmit={handleSubmit((data) => onSave({ config: data }))}
      className="space-y-6"
    >
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
          <Label htmlFor="instagram-title">タイトル</Label>
          <Input
            id="instagram-title"
            {...register("title")}
            placeholder="Instagram"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="instagram-columns">カラム数（3〜6）</Label>
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
            <Label htmlFor="instagram-count">表示件数（6〜12）</Label>
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
            <Label htmlFor="instagram-gap">間隔</Label>
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

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}
