"use client";

import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useController, useWatch } from "react-hook-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsContent,
} from "@/admin/components/ui";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import type { SpaceEditFormData } from "../schema";
import type { SpaceEditLocationOption } from "../types";

type SpaceEditBasicTabPanelProps = {
  control: Control<SpaceEditFormData>;
  register: UseFormRegister<SpaceEditFormData>;
  setValue: UseFormSetValue<SpaceEditFormData>;
  errors: FieldErrors<SpaceEditFormData>;
  isPending: boolean;
  availableLocations: SpaceEditLocationOption[];
};

export function SpaceEditBasicTabPanel({
  control,
  register,
  setValue,
  errors,
  isPending,
  availableLocations,
}: SpaceEditBasicTabPanelProps) {
  const locationId = useWatch({ control, name: "locationId" });
  const { field: descriptionField, fieldState: descriptionFieldState } =
    useController({ control, name: "descriptionJson" });

  return (
    <TabsContent
      value="basic"
      forceMount
      className="data-[state=inactive]:hidden"
    >
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">スペース名 *</Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="例: 会議室A"
              disabled={isPending}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">スラッグ *</Label>
            <Input
              id="slug"
              {...register("slug")}
              placeholder="例: meeting-room-a"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              URLに使用されます（小文字英数字とハイフンのみ）
            </p>
            {errors.slug && (
              <p className="text-sm text-destructive">{errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="descriptionJson">説明 *</Label>
            <div className="overflow-hidden rounded-lg border border-border">
              <LazyLexicalEditor
                contentJson={descriptionField.value}
                onChange={(json) => descriptionField.onChange(json)}
                height="420px"
                placeholder="スペースの説明を入力..."
                showInspector={false}
              />
            </div>
            {descriptionFieldState.error && (
              <p className="text-sm text-destructive">
                {descriptionFieldState.error.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="locationId">拠点（建物）*</Label>
            {availableLocations.length === 0 ? (
              <p className="text-sm text-destructive">
                拠点が登録されていません。スペース管理の「場所」タブから先に拠点を作成してください。
              </p>
            ) : (
              <Select
                {...(locationId !== "" ? { value: locationId } : {})}
                onValueChange={(value) =>
                  setValue("locationId", value, { shouldDirty: true })
                }
                disabled={isPending}
              >
                <SelectTrigger id="locationId">
                  <SelectValue placeholder="拠点を選択" />
                </SelectTrigger>
                <SelectContent>
                  {availableLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}（{loc.address}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.locationId && (
              <p className="text-sm text-destructive">
                {errors.locationId.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              建物の住所は拠点マスタが正本です。号室やフロアは下の「所在地補足」に入力します。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="addressDetail">所在地補足（号室・フロア等）</Label>
            <Input
              id="addressDetail"
              {...register("addressDetail")}
              placeholder="例: 3F 会議室A（任意）"
              disabled={isPending}
            />
            {errors.addressDetail && (
              <p className="text-sm text-destructive">
                {errors.addressDetail.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="capacity">定員（人数）*</Label>
              <Input
                id="capacity"
                type="number"
                {...register("capacity", { valueAsNumber: true })}
                placeholder="10"
                disabled={isPending}
              />
              {errors.capacity && (
                <p className="text-sm text-destructive">
                  {errors.capacity.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">面積（m²）</Label>
              <Input
                id="area"
                type="number"
                step="0.01"
                {...register("area", {
                  setValueAs: (v: string) => (v === "" ? null : Number(v)),
                })}
                placeholder="50"
                disabled={isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
