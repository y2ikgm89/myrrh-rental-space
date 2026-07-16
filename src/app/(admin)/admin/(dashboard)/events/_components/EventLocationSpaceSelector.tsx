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
  ToggleGroup,
  ToggleGroupItem,
  RadioGroup,
  RadioGroupItem,
  Alert,
  AlertDescription,
} from "@/admin/components/ui";
import type {
  getLocationsForEvent,
  getSpacesForEvent,
} from "@/shared/domain/events/admin-queries";
import {
  EVENT_FORMAT,
  EVENT_FORMAT_VALUES,
  MEETING_PROVIDER,
  MEETING_PROVIDER_VALUES,
  type EventFormatValue,
  type MeetingProviderValue,
} from "@/shared/lib/validations/enums/prisma-types";
import type { EventFormFields } from "./event-form-fields-types";
import { EVENT_FORM_NONE_VALUE } from "./event-form-schema";

type SpaceOption = Awaited<ReturnType<typeof getSpacesForEvent>>[number];
type LocationOption = Awaited<ReturnType<typeof getLocationsForEvent>>[number];

// ToggleGroup / RadioGroup の onValueChange は string を返すため、conform の
// z.enum 側と同じ「許可された値の集合」で narrow する。EventForm.tsx の
// isEventEditTabValue と同型のローカル type guard パターン（このファイル外へは
// 出さない = このコンポーネントの表示ロジックにのみ閉じたガード）。
const EVENT_FORMAT_VALUE_SET: ReadonlySet<string> = new Set(
  EVENT_FORMAT_VALUES,
);
function isEventFormatValue(value: string): value is EventFormatValue {
  return EVENT_FORMAT_VALUE_SET.has(value);
}

const MEETING_PROVIDER_VALUE_SET: ReadonlySet<string> = new Set(
  MEETING_PROVIDER_VALUES,
);
function isMeetingProviderValue(value: string): value is MeetingProviderValue {
  return MEETING_PROVIDER_VALUE_SET.has(value);
}

type EventLocationSpaceSelectorProps = {
  fields: EventFormFields;
  isPending: boolean;
  locations: LocationOption[];
  spaces: SpaceOption[];
  locationId: string | null;
  spaceId: string | null;
  onLocationChange: (locationId: string | null) => void;
  onSpaceChange: (spaceId: string | null) => void;
  /**
   * 開催形態 / オンライン会議設定 (Phase B.1)。`format`/`meetingUrl`/`meetingProvider`
   * は `event-form-schema.ts` の Zod schema に定義済みのため、`fields.format` /
   * `fields.meetingUrl` / `fields.meetingProvider` から conform の metadata
   * （`.errors` / `.errorId` 等）を取得できる。値自体は EventForm.tsx にリフトされた
   * controlled state を受け取る（locationId/spaceId と同じパターン）。
   * ToggleGroup/RadioGroup が条件付きレンダリングで unmount されても入力値が
   * 消えないよう、親コンポーネントで state を保持する設計。
   */
  format: EventFormatValue;
  onFormatChange: (format: EventFormatValue) => void;
  meetingProvider: MeetingProviderValue;
  onMeetingProviderChange: (meetingProvider: MeetingProviderValue) => void;
  meetingUrl: string | null;
  onMeetingUrlChange: (meetingUrl: string) => void;
};

type PhysicalVenueFieldsProps = {
  fields: EventFormFields;
  isPending: boolean;
  locations: LocationOption[];
  spaces: SpaceOption[];
  locationId: string | null;
  spaceId: string | null;
  onLocationChange: (locationId: string | null) => void;
  onSpaceChange: (spaceId: string | null) => void;
};

/** 物理会場（登録済み会場/スペース選択 + 補足住所）。OFFLINE / HYBRID で表示。 */
function PhysicalVenueFields({
  fields,
  isPending,
  locations,
  spaces,
  locationId,
  spaceId,
  onLocationChange,
  onSpaceChange,
}: PhysicalVenueFieldsProps): ReactElement {
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
    <div className="space-y-4">
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
                fields.locationId.errors ? fields.locationId.errorId : undefined
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
              isPending || !hasLocationSelected || spacesInLocation.length === 0
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
    </div>
  );
}

type OnlineMeetingFieldsProps = {
  fields: EventFormFields;
  isPending: boolean;
  meetingProvider: MeetingProviderValue;
  onMeetingProviderChange: (meetingProvider: MeetingProviderValue) => void;
  meetingUrl: string | null;
  onMeetingUrlChange: (meetingUrl: string) => void;
};

/** オンライン会議設定（発行元 RadioGroup + 手入力 URL / Google Meet 案内）。ONLINE / HYBRID で表示。 */
function OnlineMeetingFields({
  fields,
  isPending,
  meetingProvider,
  onMeetingProviderChange,
  meetingUrl,
  onMeetingUrlChange,
}: OnlineMeetingFieldsProps): ReactElement {
  const handleProviderChange = (value: string) => {
    if (isMeetingProviderValue(value)) onMeetingProviderChange(value);
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div>
        <Label id="event-meetingProvider-label">オンライン会議の発行方法</Label>
        <RadioGroup
          value={meetingProvider}
          onValueChange={handleProviderChange}
          disabled={isPending}
          aria-labelledby="event-meetingProvider-label"
          className="mt-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem
              id="meeting-provider-manual"
              value={MEETING_PROVIDER.MANUAL}
            />
            <Label htmlFor="meeting-provider-manual" className="font-normal">
              手入力 (Zoom / Teams / 独自 URL)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem
              id="meeting-provider-google-meet"
              value={MEETING_PROVIDER.GOOGLE_MEET}
            />
            <Label
              htmlFor="meeting-provider-google-meet"
              className="font-normal"
            >
              Google Meet で自動作成
            </Label>
          </div>
        </RadioGroup>
      </div>

      {meetingProvider === MEETING_PROVIDER.MANUAL && (
        <div>
          <Label htmlFor="event-meetingUrl">会議 URL</Label>
          <Input
            id="event-meetingUrl"
            type="url"
            name={fields.meetingUrl.name}
            value={meetingUrl ?? ""}
            onChange={(event) => onMeetingUrlChange(event.target.value)}
            placeholder="https://..."
            required
            pattern="https://.*"
            disabled={isPending}
            aria-invalid={fields.meetingUrl.errors ? true : undefined}
            aria-describedby={
              fields.meetingUrl.errors ? fields.meetingUrl.errorId : undefined
            }
          />
          {fields.meetingUrl.errors && (
            <p
              id={fields.meetingUrl.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.meetingUrl.errors.join(", ")}
            </p>
          )}
        </div>
      )}

      {meetingProvider === MEETING_PROVIDER.GOOGLE_MEET && (
        <Alert variant="info">
          <AlertDescription>
            公開時に Google Meet URL が自動発行されます
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function EventLocationSpaceSelector({
  fields,
  isPending,
  locations,
  spaces,
  locationId,
  spaceId,
  onLocationChange,
  onSpaceChange,
  format,
  onFormatChange,
  meetingProvider,
  onMeetingProviderChange,
  meetingUrl,
  onMeetingUrlChange,
}: EventLocationSpaceSelectorProps): ReactElement {
  const handleFormatChange = (value: string) => {
    // ToggleGroup type="single" はアクティブ item の再クリックで "" (未選択) を
    // emit できるが、開催形態は必須項目のため無視する（既存選択を維持）。
    if (isEventFormatValue(value)) onFormatChange(value);
  };

  const showPhysicalVenue =
    format === EVENT_FORMAT.OFFLINE || format === EVENT_FORMAT.HYBRID;
  const showOnlineMeeting =
    format === EVENT_FORMAT.ONLINE || format === EVENT_FORMAT.HYBRID;

  return (
    <Card>
      <CardHeader>
        <CardTitle>会場</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label id="event-format-label">開催形態</Label>
          <ToggleGroup
            type="single"
            value={format}
            onValueChange={handleFormatChange}
            disabled={isPending}
            aria-labelledby="event-format-label"
            className="mt-2"
          >
            <ToggleGroupItem
              id="event-format-offline"
              value={EVENT_FORMAT.OFFLINE}
            >
              会場のみ
            </ToggleGroupItem>
            <ToggleGroupItem
              id="event-format-online"
              value={EVENT_FORMAT.ONLINE}
            >
              オンラインのみ
            </ToggleGroupItem>
            <ToggleGroupItem
              id="event-format-hybrid"
              value={EVENT_FORMAT.HYBRID}
            >
              ハイブリッド
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {showPhysicalVenue && (
          <PhysicalVenueFields
            fields={fields}
            isPending={isPending}
            locations={locations}
            spaces={spaces}
            locationId={locationId}
            spaceId={spaceId}
            onLocationChange={onLocationChange}
            onSpaceChange={onSpaceChange}
          />
        )}

        {showOnlineMeeting && (
          <OnlineMeetingFields
            fields={fields}
            isPending={isPending}
            meetingProvider={meetingProvider}
            onMeetingProviderChange={onMeetingProviderChange}
            meetingUrl={meetingUrl}
            onMeetingUrlChange={onMeetingUrlChange}
          />
        )}
      </CardContent>
    </Card>
  );
}
