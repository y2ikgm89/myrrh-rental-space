"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  TabsContent,
  Textarea,
} from "@/admin/components/ui";
import type { SpaceEditFormData } from "../schema";

type SpaceEditBasicTabPanelProps = {
  register: UseFormRegister<SpaceEditFormData>;
  errors: FieldErrors<SpaceEditFormData>;
  isPending: boolean;
};

export function SpaceEditBasicTabPanel({
  register,
  errors,
  isPending,
}: SpaceEditBasicTabPanelProps) {
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
            <Label htmlFor="description">説明 *</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="スペースの説明を入力..."
              rows={6}
              disabled={isPending}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address">住所 *</Label>
              <Input
                id="address"
                {...register("address")}
                placeholder="例: 東京都渋谷区..."
                disabled={isPending}
              />
              {errors.address && (
                <p className="text-sm text-destructive">
                  {errors.address.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="access">アクセス</Label>
              <Input
                id="access"
                {...register("access")}
                placeholder="例: 渋谷駅から徒歩5分"
                disabled={isPending}
              />
            </div>
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
