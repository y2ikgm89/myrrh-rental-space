"use client";

import Image from "next/image";
import { useActionState, useId, useState } from "react";
import {
  getFormProps,
  getInputProps,
  useForm,
  type FieldMetadata,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import Link from "next/link";
import { IconPhotoPlus } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  toTranslate3d,
  SubmitButton,
  type DragEndEvent,
} from "@/admin/components/ui";
import { BUSINESS_ATTRIBUTE_OPTIONS } from "@/shared/lib/business-attributes";
import { locationFormSchema } from "@/shared/lib/validations/location";
import {
  parseBusinessAttributes,
  parseBusinessHours,
} from "@/shared/lib/json-validators";
import {
  createLocationAction,
  updateLocationAction,
} from "@/admin/actions/location";
import type { LocationWithStats } from "@/shared/domain/locations/types";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";
import { BlockedDatesField } from "@/admin/components/BlockedDatesField";
import { LocationSmartLockDevicesField } from "@/admin/components/LocationSmartLockDevicesField";
import {
  createLocationBlockedDate,
  deleteLocationBlockedDate,
} from "@/admin/actions/location-blocked-dates";
import {
  createLocationSmartLockDevice,
  updateLocationSmartLockDevice,
  deleteLocationSmartLockDevice,
  toggleLocationSmartLockDeviceActive,
} from "@/admin/actions/location-smart-lock-devices";
import { cn } from "@/shared/lib/cn";
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from "@/admin/hooks/use-media-picker";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";
import {
  LocationMeoScoreCard,
  type MeoScoreValues,
  type GlobalsMeoFlags,
} from "./LocationMeoScoreCard";
import { LocationGbpSyncCard } from "./LocationGbpSyncCard";

type LocationFormProps = {
  location?: LocationWithStats;
  mode: "create" | "edit";
  globals?: GlobalsMeoFlags;
  gbpEnabledGlobally?: boolean;
  initialBlockedDates?: readonly BlockedDateData[];
  initialSmartLockDevices?: readonly SmartLockDeviceData[];
};

const DEFAULT_GLOBALS: GlobalsMeoFlags = {
  businessName: false,
  establishedDate: false,
  socialLinks: false,
};

function DragHandle({
  className,
  disabled,
}: {
  className?: string;
  disabled?: boolean | undefined;
}) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "active:cursor-grabbing",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      aria-label="ドラッグして並び替え"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          d="M4 8h16M4 16h16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

type SortableImageItemProps = {
  id: string;
  url: string;
  index: number;
  onRemove: () => void;
  disabled?: boolean;
};

function SortableImageItem({
  id,
  url,
  index,
  onRemove,
  disabled,
}: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, ...(disabled !== undefined && { disabled }) });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <div {...attributes} {...listeners}>
        <DragHandle disabled={disabled} />
      </div>
      <Image
        src={url}
        alt={`画像${index + 1}`}
        width={40}
        height={40}
        className="size-10 rounded object-cover"
      />
      <span className="flex-1 truncate text-sm">{url}</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
      >
        削除
      </Button>
    </div>
  );
}

type SortableAccessLineItemProps = {
  id: string;
  index: number;
  itemField: FieldMetadata<{ value: string } | undefined>;
  disabled?: boolean;
  onRemove: () => void;
};

function SortableAccessLineItem({
  id,
  index,
  itemField,
  disabled,
  onRemove,
}: SortableAccessLineItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, ...(disabled !== undefined && { disabled }) });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  const itemFields = itemField.getFieldset();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <div {...attributes} {...listeners}>
        <DragHandle disabled={disabled} />
      </div>
      <div className="flex-1">
        <Input
          {...getInputProps(itemFields.value, { type: "text" })}
          placeholder="例: 東京メトロ「表参道駅」A1出口より徒歩5分"
          disabled={disabled}
        />
        {itemFields.value.errors && (
          <p className="mt-1 text-sm text-destructive">
            {itemFields.value.errors.join(", ")}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`経路 ${index + 1} を削除`}
      >
        削除
      </Button>
    </div>
  );
}

export function LocationForm({
  location,
  mode,
  globals = DEFAULT_GLOBALS,
  gbpEnabledGlobally = false,
  initialBlockedDates = [],
  initialSmartLockDevices = [],
}: LocationFormProps) {
  const dndContextId = useId();
  const accessLinesDndContextId = useId();
  const isEdit = mode === "edit";

  const [name, setName] = useState<string>(location?.name ?? "");
  const [description, setDescription] = useState<string>(
    location?.description ?? "",
  );
  const [postalCode, setPostalCode] = useState<string>(
    location?.postalCode ?? "",
  );
  const [prefecture, setPrefecture] = useState<string>(
    location?.prefecture ?? "",
  );
  const [city, setCity] = useState<string>(location?.city ?? "");
  const [phoneNumber, setPhoneNumber] = useState<string>(
    location?.phoneNumber ?? "",
  );
  const [email, setEmail] = useState<string>(location?.email ?? "");
  const [latitude, setLatitude] = useState<string>(
    location?.latitude != null ? String(location.latitude) : "",
  );
  const [longitude, setLongitude] = useState<string>(
    location?.longitude != null ? String(location.longitude) : "",
  );
  const [priceRange, setPriceRange] = useState<string>(
    location?.priceRange ?? "",
  );
  const [paymentAccepted, setPaymentAccepted] = useState<string>(
    location?.paymentAccepted ?? "",
  );
  const [googleBusinessPlaceId, setGoogleBusinessPlaceId] = useState<string>(
    location?.googleBusinessPlaceId ?? "",
  );

  const [imageUrl, setImageUrl] = useState<string>(location?.imageUrl ?? "");
  const [amenities, setAmenities] = useState<Record<string, boolean>>(
    () => parseBusinessAttributes(location?.amenities) ?? {},
  );
  const [isPublished, setIsPublished] = useState<boolean>(
    location?.isPublished ?? false,
  );

  const [businessHoursPayload] = useState<string>(() => {
    const parsed = parseBusinessHours(location?.businessHours);
    return parsed ? JSON.stringify(parsed) : "";
  });
  const [specialHolidaysPayload] = useState<string>(() => {
    if (
      location?.specialHolidays &&
      Array.isArray(location.specialHolidays) &&
      location.specialHolidays.length > 0
    ) {
      return JSON.stringify(location.specialHolidays);
    }
    return "";
  });

  const boundAction =
    isEdit && location?.id
      ? updateLocationAction.bind(null, location.id)
      : createLocationAction;
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `location-edit-${location?.id ?? ""}` : "location-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: locationFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: location
      ? {
          slug: location.slug,
          address: location.address,
          streetAddress: location.streetAddress ?? "",
          buildingName: location.buildingName ?? "",
          accessLines: location.accessLines.map((value) => ({ value })),
          parkingInfo: location.parkingInfo ?? "",
          imageUrls: location.imageUrls.map((url) => ({ url })),
          googleReviewUrl: location.googleReviewUrl ?? "",
        }
      : {
          slug: "",
          address: "",
          streetAddress: "",
          buildingName: "",
          accessLines: [],
          parkingInfo: "",
          imageUrls: [],
          googleReviewUrl: "",
        },
  });

  const accessLinesList = fields.accessLines.getFieldList();
  const imageUrlsList = fields.imageUrls.getFieldList();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleAccessLineDragEnd = (event: DragEndEvent) => {
    if (isPending) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = accessLinesList.findIndex(
      (item) => item.key === String(active.id),
    );
    const newIndex = accessLinesList.findIndex(
      (item) => item.key === String(over.id),
    );
    if (oldIndex !== -1 && newIndex !== -1) {
      form.reorder({
        name: fields.accessLines.name,
        from: oldIndex,
        to: newIndex,
      });
    }
  };

  const handleImageDragEnd = (event: DragEndEvent) => {
    if (isPending) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = imageUrlsList.findIndex(
      (item) => item.key === String(active.id),
    );
    const newIndex = imageUrlsList.findIndex(
      (item) => item.key === String(over.id),
    );
    if (oldIndex !== -1 && newIndex !== -1) {
      form.reorder({
        name: fields.imageUrls.name,
        from: oldIndex,
        to: newIndex,
      });
    }
  };

  const mainImagePicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "SPACE",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setImageUrl(selected.url);
      }
    },
  });

  const additionalImagesPicker = useMultipleMediaPicker({
    accept: "image",
    defaultUsage: "SPACE",
    maxSelections: 10 - imageUrlsList.length,
    onSelect: (media) => {
      if (media.length === 0) return;
      const remaining = 10 - imageUrlsList.length;
      media.slice(0, remaining).forEach((m) => {
        form.insert({
          name: fields.imageUrls.name,
          defaultValue: { url: m.url },
        });
      });
    },
  });

  const meoValues: MeoScoreValues = {
    name,
    postalCode,
    prefecture,
    city,
    phoneNumber,
    email,
    latitude: latitude === "" ? null : Number(latitude),
    longitude: longitude === "" ? null : Number(longitude),
    businessHours: businessHoursPayload !== "" ? businessHoursPayload : null,
    priceRange,
    description,
    imageUrl,
    googleBusinessPlaceId,
    paymentAccepted,
  };

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      {/* hidden inputs (controlled state → FormData) */}
      <input type="hidden" name={fields.name.name} value={name} />
      <input type="hidden" name={fields.description.name} value={description} />
      <input type="hidden" name={fields.postalCode.name} value={postalCode} />
      <input type="hidden" name={fields.prefecture.name} value={prefecture} />
      <input type="hidden" name={fields.city.name} value={city} />
      <input type="hidden" name={fields.phoneNumber.name} value={phoneNumber} />
      <input type="hidden" name={fields.email.name} value={email} />
      <input type="hidden" name={fields.latitude.name} value={latitude} />
      <input type="hidden" name={fields.longitude.name} value={longitude} />
      <input type="hidden" name={fields.priceRange.name} value={priceRange} />
      <input
        type="hidden"
        name={fields.paymentAccepted.name}
        value={paymentAccepted}
      />
      <input
        type="hidden"
        name={fields.googleBusinessPlaceId.name}
        value={googleBusinessPlaceId}
      />
      <input type="hidden" name={fields.imageUrl.name} value={imageUrl} />
      <input
        type="hidden"
        name={fields.isPublished.name}
        value={isPublished ? "on" : ""}
      />
      <input type="hidden" name={fields.isActive.name} value="on" />
      <input
        type="hidden"
        name={fields.businessHours.name}
        value={businessHoursPayload}
      />
      <input
        type="hidden"
        name={fields.specialHolidays.name}
        value={specialHolidaysPayload}
      />
      {BUSINESS_ATTRIBUTE_OPTIONS.map((attr) => (
        <input
          key={attr.key}
          type="hidden"
          name={`${fields.amenities.name}.${attr.key}`}
          value={amenities[attr.key] ? "on" : ""}
        />
      ))}

      {form.errors && form.errors.length > 0 && (
        <div
          className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {form.errors.join(", ")}
        </div>
      )}

      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">基本情報</TabsTrigger>
          <TabsTrigger value="meo">MEO</TabsTrigger>
          {isEdit && <TabsTrigger value="blocked-dates">臨時休業</TabsTrigger>}
          {isEdit && (
            <TabsTrigger value="smart-lock-devices">
              スマートロックデバイス
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent
          value="basic"
          forceMount
          className="mt-6 space-y-6 data-[state=inactive]:hidden"
        >
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="location-name">
                  場所名 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="location-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: Myrrhビル"
                  disabled={isPending}
                  aria-invalid={fields.name.errors ? true : undefined}
                  aria-describedby={
                    fields.name.errors ? fields.name.errorId : undefined
                  }
                />
                {fields.name.errors && (
                  <p
                    id={fields.name.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.name.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.slug.id}>
                  スラッグ（URL 識別子）{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  {...getInputProps(fields.slug, { type: "text" })}
                  placeholder="honkan"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  公開アンカー:{" "}
                  <code>/access#{fields.slug.value || "slug"}</code>。
                  小文字英数字とハイフンのみ。/access ページ内の章 anchor
                  として使われ、JSON-LD `@id` にも影響します。
                </p>
                {fields.slug.errors && (
                  <p
                    id={fields.slug.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.slug.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location-description">説明</Label>
                <Textarea
                  id="location-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="建物・施設の説明を入力..."
                  rows={4}
                  disabled={isPending}
                  aria-invalid={fields.description.errors ? true : undefined}
                  aria-describedby={
                    fields.description.errors
                      ? fields.description.errorId
                      : undefined
                  }
                />
                {fields.description.errors && (
                  <p
                    id={fields.description.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.description.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.address.id}>
                  住所 <span className="text-destructive">*</span>
                </Label>
                <Input
                  {...getInputProps(fields.address, { type: "text" })}
                  placeholder="例: 東京都渋谷区..."
                  disabled={isPending}
                />
                {fields.address.errors && (
                  <p
                    id={fields.address.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.address.errors.join(", ")}
                  </p>
                )}
              </div>

              <fieldset className="space-y-4 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">
                  住所詳細（構造化データ用）
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="location-postalCode">郵便番号</Label>
                    <Input
                      id="location-postalCode"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="150-0001"
                      disabled={isPending}
                      aria-invalid={fields.postalCode.errors ? true : undefined}
                      aria-describedby={
                        fields.postalCode.errors
                          ? fields.postalCode.errorId
                          : undefined
                      }
                    />
                    {fields.postalCode.errors && (
                      <p
                        id={fields.postalCode.errorId}
                        className="text-sm text-destructive"
                      >
                        {fields.postalCode.errors.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location-prefecture">都道府県</Label>
                    <Input
                      id="location-prefecture"
                      value={prefecture}
                      onChange={(e) => setPrefecture(e.target.value)}
                      placeholder="東京都"
                      disabled={isPending}
                      aria-invalid={fields.prefecture.errors ? true : undefined}
                      aria-describedby={
                        fields.prefecture.errors
                          ? fields.prefecture.errorId
                          : undefined
                      }
                    />
                    {fields.prefecture.errors && (
                      <p
                        id={fields.prefecture.errorId}
                        className="text-sm text-destructive"
                      >
                        {fields.prefecture.errors.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="location-city">市区町村</Label>
                    <Input
                      id="location-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="渋谷区"
                      disabled={isPending}
                      aria-invalid={fields.city.errors ? true : undefined}
                      aria-describedby={
                        fields.city.errors ? fields.city.errorId : undefined
                      }
                    />
                    {fields.city.errors && (
                      <p
                        id={fields.city.errorId}
                        className="text-sm text-destructive"
                      >
                        {fields.city.errors.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={fields.streetAddress.id}>番地</Label>
                    <Input
                      {...getInputProps(fields.streetAddress, {
                        type: "text",
                      })}
                      placeholder="神宮前1-1-1"
                      disabled={isPending}
                    />
                    {fields.streetAddress.errors && (
                      <p
                        id={fields.streetAddress.errorId}
                        className="text-sm text-destructive"
                      >
                        {fields.streetAddress.errors.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={fields.buildingName.id}>建物名・階</Label>
                  <Input
                    {...getInputProps(fields.buildingName, { type: "text" })}
                    placeholder="Myrrhビル 3F"
                    disabled={isPending}
                  />
                  {fields.buildingName.errors && (
                    <p
                      id={fields.buildingName.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.buildingName.errors.join(", ")}
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  構造化住所は LocalBusiness JSON-LD
                  で使用されます。上の「住所」は表示用、ここは検索エンジン用です。
                </p>
              </fieldset>

              {/* アクセス */}
              <div className="space-y-2">
                <Label>アクセス</Label>
                <p className="text-sm text-muted-foreground">
                  最寄り駅・路線・徒歩分数等を 1
                  経路ずつ入力します。並べ替え可。
                </p>
                <div className="space-y-2">
                  <DndContext
                    id={accessLinesDndContextId}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleAccessLineDragEnd}
                  >
                    <SortableContext
                      items={accessLinesList.map((item) => item.key ?? "")}
                      strategy={verticalListSortingStrategy}
                    >
                      {accessLinesList.map((item, index) => (
                        <SortableAccessLineItem
                          key={item.key}
                          id={item.key ?? ""}
                          index={index}
                          itemField={item}
                          disabled={isPending}
                          onRemove={() => {
                            form.remove({
                              name: fields.accessLines.name,
                              index,
                            });
                          }}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      form.insert({
                        name: fields.accessLines.name,
                        defaultValue: { value: "" },
                      });
                    }}
                    disabled={isPending || accessLinesList.length >= 20}
                    aria-invalid={fields.accessLines.errors ? true : undefined}
                    aria-describedby={
                      fields.accessLines.errors
                        ? fields.accessLines.errorId
                        : undefined
                    }
                  >
                    + 経路を追加
                  </Button>
                  {accessLinesList.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      まだ経路がありません。「+ 経路を追加」で 1
                      行目を追加してください。
                    </p>
                  )}
                  {fields.accessLines.errors && (
                    <p
                      id={fields.accessLines.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.accessLines.errors.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.parkingInfo.id}>駐車場案内</Label>
                <Textarea
                  {...getInputProps(fields.parkingInfo, { type: "text" })}
                  placeholder={`例: 専用駐車場 3台\n近隣コインパーキング: タイムズ神宮前（徒歩1分・24時間）`}
                  rows={3}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  この拠点の駐車場情報。拠点ごとに設定できます。
                </p>
                {fields.parkingInfo.errors && (
                  <p
                    id={fields.parkingInfo.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.parkingInfo.errors.join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>画像設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>
                  建物画像 <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-start gap-4">
                  {imageUrl ? (
                    <div className="relative h-24 w-24 overflow-hidden rounded-lg border">
                      <Image
                        src={imageUrl}
                        alt="建物画像"
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed bg-muted">
                      <IconPhotoPlus
                        aria-hidden="true"
                        className="h-8 w-8 text-muted-foreground"
                      />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => mainImagePicker.openPicker()}
                      disabled={isPending}
                      aria-invalid={fields.imageUrl.errors ? true : undefined}
                      aria-describedby={
                        fields.imageUrl.errors
                          ? fields.imageUrl.errorId
                          : undefined
                      }
                    >
                      <IconPhotoPlus
                        aria-hidden="true"
                        className="mr-2 h-4 w-4"
                      />
                      画像を選択
                    </Button>
                    {imageUrl && (
                      <p className="truncate text-sm text-muted-foreground">
                        {imageUrl}
                      </p>
                    )}
                  </div>
                </div>
                {fields.imageUrl.errors && (
                  <p
                    id={fields.imageUrl.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.imageUrl.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium leading-none">
                  追加画像（最大10枚）
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => additionalImagesPicker.openPicker()}
                  disabled={isPending || imageUrlsList.length >= 10}
                  aria-invalid={fields.imageUrls.errors ? true : undefined}
                  aria-describedby={
                    fields.imageUrls.errors
                      ? fields.imageUrls.errorId
                      : undefined
                  }
                >
                  <IconPhotoPlus aria-hidden="true" className="mr-2 h-4 w-4" />
                  画像を追加
                </Button>
                {imageUrlsList.length > 0 && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {imageUrlsList.length} / 10 枚選択中 ・
                      ドラッグ&ドロップで順序を変更できます
                    </p>
                    <DndContext
                      id={dndContextId}
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleImageDragEnd}
                    >
                      <SortableContext
                        items={imageUrlsList.map((item) => item.key ?? "")}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="mt-2 space-y-2">
                          {imageUrlsList.map((item, index) => {
                            const itemFields = item.getFieldset();
                            const url =
                              typeof itemFields.url.value === "string"
                                ? itemFields.url.value
                                : "";
                            return (
                              <SortableImageItem
                                key={item.key}
                                id={item.key ?? ""}
                                url={url}
                                index={index}
                                disabled={isPending}
                                onRemove={() => {
                                  form.remove({
                                    name: fields.imageUrls.name,
                                    index,
                                  });
                                }}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </>
                )}
                {fields.imageUrls.errors && (
                  <p
                    id={fields.imageUrls.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.imageUrls.errors.join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>設備・サービス</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Label>この拠点の設備</Label>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  {BUSINESS_ATTRIBUTE_OPTIONS.map((attr) => (
                    <div key={attr.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`amenity-${attr.key}`}
                        checked={amenities[attr.key] ?? false}
                        onCheckedChange={(checked) => {
                          setAmenities((prev) => ({
                            ...prev,
                            [attr.key]: checked === true,
                          }));
                        }}
                        disabled={isPending}
                      />
                      <Label
                        htmlFor={`amenity-${attr.key}`}
                        className="cursor-pointer text-sm font-normal"
                      >
                        {attr.label}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  拠点ごとに利用可能な設備を選択してください。
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>公開設定</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-row items-center gap-4">
                <Switch
                  id="location-isPublished"
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                  disabled={isPending}
                />
                <div>
                  <Label
                    htmlFor="location-isPublished"
                    className="text-base font-medium"
                  >
                    {getPublishLabel(isPublished)}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {isPublished
                      ? "この場所は公開ページに表示されます"
                      : "この場所は公開ページに表示されません"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="meo"
          forceMount
          className="mt-6 space-y-6 data-[state=inactive]:hidden"
        >
          <LocationMeoScoreCard values={meoValues} globals={globals} />

          {location ? (
            <LocationGbpSyncCard
              locationId={location.id}
              googleBusinessPlaceId={location.googleBusinessPlaceId}
              gbpSyncEnabled={location.gbpSyncEnabled}
              gbpSyncedAt={location.gbpSyncedAt}
              gbpSyncError={location.gbpSyncError}
              gbpEnabledGlobally={gbpEnabledGlobally}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>MEO（ローカル検索最適化）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="location-latitude">緯度</Label>
                  <Input
                    id="location-latitude"
                    type="number"
                    step="any"
                    placeholder="35.6812"
                    disabled={isPending}
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    aria-invalid={fields.latitude.errors ? true : undefined}
                    aria-describedby={
                      fields.latitude.errors
                        ? fields.latitude.errorId
                        : undefined
                    }
                  />
                  {fields.latitude.errors && (
                    <p
                      id={fields.latitude.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.latitude.errors.join(", ")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location-longitude">経度</Label>
                  <Input
                    id="location-longitude"
                    type="number"
                    step="any"
                    placeholder="139.7671"
                    disabled={isPending}
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    aria-invalid={fields.longitude.errors ? true : undefined}
                    aria-describedby={
                      fields.longitude.errors
                        ? fields.longitude.errorId
                        : undefined
                    }
                  />
                  {fields.longitude.errors && (
                    <p
                      id={fields.longitude.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.longitude.errors.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location-phoneNumber">電話番号</Label>
                <Input
                  id="location-phoneNumber"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="03-1234-5678"
                  disabled={isPending}
                  aria-invalid={fields.phoneNumber.errors ? true : undefined}
                  aria-describedby={
                    fields.phoneNumber.errors
                      ? fields.phoneNumber.errorId
                      : undefined
                  }
                />
                {fields.phoneNumber.errors && (
                  <p
                    id={fields.phoneNumber.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.phoneNumber.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location-email">メールアドレス</Label>
                <Input
                  id="location-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="info@example.com"
                  disabled={isPending}
                  aria-invalid={fields.email.errors ? true : undefined}
                  aria-describedby={
                    fields.email.errors ? fields.email.errorId : undefined
                  }
                />
                {fields.email.errors && (
                  <p
                    id={fields.email.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.email.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location-priceRange">価格帯</Label>
                <Input
                  id="location-priceRange"
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  placeholder="¥1,000〜¥5,000/時間"
                  disabled={isPending}
                  aria-invalid={fields.priceRange.errors ? true : undefined}
                  aria-describedby={
                    fields.priceRange.errors
                      ? fields.priceRange.errorId
                      : undefined
                  }
                />
                <p className="text-xs text-muted-foreground">
                  例: ¥1,000〜¥5,000/時間（最大 100 文字）
                </p>
                {fields.priceRange.errors && (
                  <p
                    id={fields.priceRange.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.priceRange.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location-paymentAccepted">
                  利用可能な決済方法
                </Label>
                <Input
                  id="location-paymentAccepted"
                  value={paymentAccepted}
                  onChange={(e) => setPaymentAccepted(e.target.value)}
                  placeholder="現金, クレジットカード, 電子マネー"
                  disabled={isPending}
                  aria-invalid={
                    fields.paymentAccepted.errors ? true : undefined
                  }
                  aria-describedby={
                    fields.paymentAccepted.errors
                      ? fields.paymentAccepted.errorId
                      : undefined
                  }
                />
                <p className="text-xs text-muted-foreground">
                  現金, クレジットカード, 電子マネー, QRコード決済
                </p>
                {fields.paymentAccepted.errors && (
                  <p
                    id={fields.paymentAccepted.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.paymentAccepted.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location-googleBusinessPlaceId">
                  Google Business Place ID
                </Label>
                <Input
                  id="location-googleBusinessPlaceId"
                  value={googleBusinessPlaceId}
                  onChange={(e) => setGoogleBusinessPlaceId(e.target.value)}
                  placeholder="ChIJ..."
                  disabled={isPending}
                  aria-invalid={
                    fields.googleBusinessPlaceId.errors ? true : undefined
                  }
                  aria-describedby={
                    fields.googleBusinessPlaceId.errors
                      ? fields.googleBusinessPlaceId.errorId
                      : undefined
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Google Maps Platform で確認できます（ChIJ...）
                </p>
                {fields.googleBusinessPlaceId.errors && (
                  <p
                    id={fields.googleBusinessPlaceId.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.googleBusinessPlaceId.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.googleReviewUrl.id}>
                  Google 口コミ URL
                </Label>
                <Input
                  {...getInputProps(fields.googleReviewUrl, { type: "url" })}
                  placeholder="https://g.page/r/..."
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  お客様に口コミ投稿を促すための URL
                </p>
                {fields.googleReviewUrl.errors && (
                  <p
                    id={fields.googleReviewUrl.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.googleReviewUrl.errors.join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isEdit && location && (
          <TabsContent
            value="blocked-dates"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            <Card>
              <CardHeader>
                <CardTitle>臨時休業 / 急な休み</CardTitle>
              </CardHeader>
              <CardContent>
                <BlockedDatesField
                  entityId={location.id}
                  initialBlockedDates={initialBlockedDates}
                  createAction={createLocationBlockedDate}
                  deleteAction={deleteLocationBlockedDate}
                  description="この拠点に登録された全スペースの予約を、指定した日付で受け付けません（拠点全体の臨時休業）。"
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isEdit && location && (
          <TabsContent
            value="smart-lock-devices"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            <Card>
              <CardHeader>
                <CardTitle>スマートロックデバイス</CardTitle>
              </CardHeader>
              <CardContent>
                <LocationSmartLockDevicesField
                  locationId={location.id}
                  initialSmartLockDevices={initialSmartLockDevices}
                  createAction={createLocationSmartLockDevice}
                  updateAction={updateLocationSmartLockDevice}
                  deleteAction={deleteLocationSmartLockDevice}
                  toggleActiveAction={toggleLocationSmartLockDeviceActive}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <div className="flex justify-end gap-4">
        <Button variant="outline" asChild>
          <Link href="/admin/spaces?tab=locations">キャンセル</Link>
        </Button>
        <SubmitButton
          isPending={isPending}
          label={isEdit ? "更新" : "作成"}
          pendingLabel={isEdit ? "更新中..." : "作成中..."}
        />
      </div>

      {mainImagePicker.mediaPickerDialog}
      {additionalImagesPicker.mediaPickerDialog}
    </form>
  );
}
