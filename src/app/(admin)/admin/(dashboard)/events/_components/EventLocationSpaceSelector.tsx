"use client";

import type { ReactElement } from "react";
import type {
  FieldErrors,
  UseFormGetValues,
  UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { eventFormSchema } from "@/shared/lib/validations/event";
import type {
  getLocationsForEvent,
  getSpacesForEvent,
} from "@/shared/domain/events/admin-queries";
import type { z } from "zod";

// =============================================================================
// Types
// =============================================================================

type FormValues = z.infer<typeof eventFormSchema>;
type SpaceOption = Awaited<ReturnType<typeof getSpacesForEvent>>[number];
type LocationOption = Awaited<ReturnType<typeof getLocationsForEvent>>[number];

type EventLocationSpaceSelectorProps = {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
  errors: FieldErrors<FormValues>;
  register: (name: "addressDetail") => object;
  isPending: boolean;
  locations: LocationOption[];
  spaces: SpaceOption[];
};

// =============================================================================
// Helpers
// =============================================================================

const LOCATION_NONE_VALUE = "__none__";
const SPACE_NONE_VALUE = "__none__";

// =============================================================================
// Component
// =============================================================================

export function EventLocationSpaceSelector({
  control,
  setValue,
  getValues,
  errors,
  register,
  isPending,
  locations,
  spaces,
}: EventLocationSpaceSelectorProps): ReactElement {
  const watchedLocationId = useWatch({ control, name: "locationId" });
  const watchedSpaceId = useWatch({ control, name: "spaceId" });

  const hasLocationSelected = Boolean(watchedLocationId);
  const hasSpaceSelected = Boolean(watchedSpaceId);
  const spacesInLocation = watchedLocationId
    ? spaces.filter((s) => s.locationId === watchedLocationId)
    : [];

  const addressDetailFieldMeta = hasSpaceSelected
    ? {
        label: "補足情報（任意）",
        placeholder: "例: 2Fホール / 駐車場入口は北側",
        description:
          "フロア・入口案内・駐車場情報など。住所はスペース所属会場から自動適用されます。",
      }
    : hasLocationSelected
      ? {
          label: "補足情報（任意）",
          placeholder: "例: 2Fホール全体を貸し切り",
          description:
            "会場全体を使う場合はそのまま、特定エリアを使う場合はその情報を入力します。",
        }
      : {
          label: "外部会場名 / 住所",
          placeholder: "例: 渋谷区文化総合センター大和田 地下2F レクホール",
          description: "外部会場で開催する場合の会場名または住所を入力します。",
        };

  const handleLocationChange = (value: string) => {
    const nextLocationId = value === LOCATION_NONE_VALUE ? null : value;
    setValue("locationId", nextLocationId, { shouldDirty: true });
    const currentSpaceId = getValues("spaceId");
    if (currentSpaceId) {
      const currentSpace = spaces.find((s) => s.id === currentSpaceId);
      if (!currentSpace || currentSpace.locationId !== nextLocationId) {
        setValue("spaceId", null, { shouldDirty: true });
      }
    }
  };

  const handleSpaceChange = (value: string) => {
    const nextSpaceId = value === SPACE_NONE_VALUE ? null : value;
    setValue("spaceId", nextSpaceId, { shouldDirty: true });
    if (nextSpaceId) {
      const selected = spaces.find((s) => s.id === nextSpaceId);
      if (selected && getValues("locationId") !== selected.locationId) {
        setValue("locationId", selected.locationId, { shouldDirty: true });
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>会場</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          登録済み会場（本館・支店等）を選択し、その中の特定スペースで開催する場合はスペースも選択します。外部会場の場合は「外部会場」を選んで会場名・住所を入力します。
        </p>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div>
            <Label htmlFor="locationId">会場</Label>
            <Select
              value={watchedLocationId ?? LOCATION_NONE_VALUE}
              onValueChange={handleLocationChange}
              disabled={isPending}
            >
              <SelectTrigger id="locationId">
                <SelectValue placeholder="会場を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LOCATION_NONE_VALUE}>外部会場</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.locationId && (
              <p className="text-sm text-destructive mt-1">
                {errors.locationId.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="spaceId">スペース（任意）</Label>
            <Select
              value={watchedSpaceId ?? SPACE_NONE_VALUE}
              onValueChange={handleSpaceChange}
              disabled={
                isPending ||
                !hasLocationSelected ||
                spacesInLocation.length === 0
              }
            >
              <SelectTrigger id="spaceId">
                <SelectValue
                  placeholder={
                    !hasLocationSelected
                      ? "先に会場を選択してください"
                      : spacesInLocation.length === 0
                        ? "この会場に登録スペースがありません"
                        : "スペースを選択"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SPACE_NONE_VALUE}>会場全体で開催</SelectItem>
                {spacesInLocation.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              特定スペースで開催する場合のみ選択。ロビーやホール全体を使う場合は「会場全体で開催」のままにします。
            </p>
            {errors.spaceId && (
              <p className="text-sm text-destructive mt-1">
                {errors.spaceId.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="addressDetail">{addressDetailFieldMeta.label}</Label>
          <Input
            id="addressDetail"
            {...register("addressDetail")}
            disabled={isPending}
            placeholder={addressDetailFieldMeta.placeholder}
            aria-describedby="addressDetail-description"
          />
          <p
            id="addressDetail-description"
            className="mt-1 text-xs text-muted-foreground"
          >
            {addressDetailFieldMeta.description}
          </p>
          {errors.addressDetail && (
            <p className="text-sm text-destructive mt-1">
              {errors.addressDetail.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
