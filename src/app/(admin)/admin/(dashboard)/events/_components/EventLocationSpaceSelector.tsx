"use client";

import type { ReactElement } from "react";
import { getInputProps } from "@conform-to/react";
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
import type {
  getLocationsForEvent,
  getSpacesForEvent,
} from "@/shared/domain/events/admin-queries";
import type { EventFormFields } from "./event-form-fields-types";
import { EVENT_FORM_NONE_VALUE } from "./event-form-schema";

type SpaceOption = Awaited<ReturnType<typeof getSpacesForEvent>>[number];
type LocationOption = Awaited<ReturnType<typeof getLocationsForEvent>>[number];

type EventLocationSpaceSelectorProps = {
  fields: EventFormFields;
  isPending: boolean;
  locations: LocationOption[];
  spaces: SpaceOption[];
  locationId: string | null;
  spaceId: string | null;
  onLocationChange: (locationId: string | null) => void;
  onSpaceChange: (spaceId: string | null) => void;
};

export function EventLocationSpaceSelector({
  fields,
  isPending,
  locations,
  spaces,
  locationId,
  spaceId,
  onLocationChange,
  onSpaceChange,
}: EventLocationSpaceSelectorProps): ReactElement {
  const hasLocationSelected = Boolean(locationId);
  const hasSpaceSelected = Boolean(spaceId);
  const spacesInLocation = locationId
    ? spaces.filter((s) => s.locationId === locationId)
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
    const next = value === EVENT_FORM_NONE_VALUE ? null : value;
    onLocationChange(next);
  };

  const handleSpaceChange = (value: string) => {
    const next = value === EVENT_FORM_NONE_VALUE ? null : value;
    onSpaceChange(next);
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="event-locationId">会場</Label>
            <Select
              value={locationId ?? EVENT_FORM_NONE_VALUE}
              onValueChange={handleLocationChange}
              disabled={isPending}
            >
              <SelectTrigger
                id="event-locationId"
                aria-invalid={fields.locationId.errors ? true : undefined}
                aria-describedby={
                  fields.locationId.errors
                    ? fields.locationId.errorId
                    : undefined
                }
              >
                <SelectValue placeholder="会場を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EVENT_FORM_NONE_VALUE}>外部会場</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fields.locationId.errors && (
              <p
                id={fields.locationId.errorId}
                className="mt-1 text-sm text-destructive"
              >
                {fields.locationId.errors.join(", ")}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="event-spaceId">スペース（任意）</Label>
            <Select
              value={spaceId ?? EVENT_FORM_NONE_VALUE}
              onValueChange={handleSpaceChange}
              disabled={
                isPending ||
                !hasLocationSelected ||
                spacesInLocation.length === 0
              }
            >
              <SelectTrigger
                id="event-spaceId"
                aria-invalid={fields.spaceId.errors ? true : undefined}
                aria-describedby={
                  fields.spaceId.errors ? fields.spaceId.errorId : undefined
                }
              >
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
                <SelectItem value={EVENT_FORM_NONE_VALUE}>
                  会場全体で開催
                </SelectItem>
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
            {fields.spaceId.errors && (
              <p
                id={fields.spaceId.errorId}
                className="mt-1 text-sm text-destructive"
              >
                {fields.spaceId.errors.join(", ")}
              </p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor={fields.addressDetail.id}>
            {addressDetailFieldMeta.label}
          </Label>
          <Input
            {...getInputProps(fields.addressDetail, { type: "text" })}
            disabled={isPending}
            placeholder={addressDetailFieldMeta.placeholder}
            aria-describedby={
              fields.addressDetail.errors
                ? `addressDetail-description ${fields.addressDetail.errorId}`
                : "addressDetail-description"
            }
          />
          <p
            id="addressDetail-description"
            className="mt-1 text-xs text-muted-foreground"
          >
            {addressDetailFieldMeta.description}
          </p>
          {fields.addressDetail.errors && (
            <p
              id={fields.addressDetail.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.addressDetail.errors.join(", ")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
