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
  Switch,
} from "@/admin/components/ui";
import {
  mapConfigSchema,
  parseMapHeight,
  parseBorderRadius,
  type MapConfig,
  type MapConfigInput,
} from "@/shared/lib/validations/section";
import { getMapConfig } from "@/shared/lib/validations/section-defaults";
import {
  borderRadiusLabels,
  mapHeightLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function MapConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getMapConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { isDirty },
  } = useForm<MapConfigInput, unknown, MapConfig>({
    resolver: standardSchemaResolver(mapConfigSchema),
    defaultValues: config,
  });

  const handleFormSave = handleSubmit((data) => {
    onSave({ config: data });
  });

  return (
    <form onSubmit={handleFormSave} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="map-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="map-section-label"
            {...register("sectionLabel")}
            placeholder="例: Location"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-title">タイトル（任意）</Label>
          <Input
            id="map-title"
            {...register("title")}
            placeholder="アクセス"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-address">住所（任意）</Label>
          <Input
            id="map-address"
            {...register("address")}
            placeholder="東京都渋谷区..."
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="map-lat">緯度</Label>
            <Input
              id="map-lat"
              type="number"
              step="any"
              {...register("latitude", { valueAsNumber: true })}
              placeholder="35.6762"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="map-lng">経度</Label>
            <Input
              id="map-lng"
              type="number"
              step="any"
              {...register("longitude", { valueAsNumber: true })}
              placeholder="139.6503"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="map-zoom">ズームレベル（1-20）</Label>
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

        <div className="flex items-center gap-2">
          <Switch
            id="map-show-address"
            checked={config.showAddressBelow}
            onCheckedChange={(checked) => setValue("showAddressBelow", checked)}
            disabled={isPending}
          />
          <Label htmlFor="map-show-address">地図下に住所を表示</Label>
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
