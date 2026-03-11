"use client";

import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";

import { keysOf } from "@/shared/lib/serialize";
import {
  mapConfigSchema,
  parseMapHeight,
  parseBorderRadius,
  type MapConfig,
  type MapConfigInput,
} from "@/admin/lib/validations/homepage-section";
import {
  mapHeightLabels,
  borderRadiusLabels,
} from "@/shared/lib/validations/section-options";

export function MapConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: MapConfig;
  onSave: (config: MapConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<MapConfigInput, unknown, MapConfig>({
    resolver: standardSchemaResolver(mapConfigSchema),
    defaultValues: config,
  });

  const showAddressBelow = useWatch({ control, name: "showAddressBelow" });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="map-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="map-section-label"
            {...register("sectionLabel")}
            placeholder="Location"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-title">タイトル</Label>
          <Input
            id="map-title"
            {...register("title")}
            placeholder="アクセス"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-address">住所</Label>
          <Input
            id="map-address"
            {...register("address")}
            placeholder="東京都渋谷区..."
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="map-latitude">緯度</Label>
            <Input
              id="map-latitude"
              type="number"
              step={0.000001}
              {...register("latitude", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-longitude">経度</Label>
            <Input
              id="map-longitude"
              type="number"
              step={0.000001}
              {...register("longitude", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="map-zoom">ズームレベル</Label>
            <Input
              id="map-zoom"
              type="number"
              min={1}
              max={20}
              {...register("zoom", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-height">高さ</Label>
            <Select
              defaultValue={config.height}
              onValueChange={(v) => setValue("height", parseMapHeight(v))}
              disabled={isPending}
            >
              <SelectTrigger id="map-height">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(mapHeightLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {mapHeightLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-border-radius">角丸</Label>
            <Select
              defaultValue={config.borderRadius}
              onValueChange={(v) =>
                setValue("borderRadius", parseBorderRadius(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="map-border-radius">
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

        <div className="flex items-center gap-2">
          <Switch
            id="map-show-address"
            checked={showAddressBelow ?? false}
            onCheckedChange={(checked) => setValue("showAddressBelow", checked)}
            disabled={isPending}
          />
          <Label htmlFor="map-show-address">住所を地図の下に表示</Label>
        </div>
      </div>

      <SubmitButton isPending={isPending} label="保存" />
    </form>
  );
}
