"use client";

import { useActionState, useId, useState } from "react";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import Link from "next/link";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  sortableKeyboardCoordinates,
  SubmitButton,
  type DragEndEvent,
} from "@/admin/components/ui";
import { BUSINESS_ATTRIBUTE_OPTIONS } from "@/shared/lib/business-attributes";
import { locationFormSchema } from "@/shared/lib/validations/location";
import {
  parseBusinessAttributes,
  parseBusinessHours,
  type BusinessHours,
} from "@/shared/lib/json-validators";
import {
  createLocationAction,
  updateLocationAction,
} from "@/admin/actions/location";
import type { LocationWithStats } from "@/shared/domain/locations/types";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from "@/admin/hooks/use-media-picker";
import { type GlobalsMeoFlags } from "./LocationMeoScoreCard";
import { DEFAULT_BUSINESS_HOURS } from "./LocationBusinessHoursCard";
import { LocationBasicTab } from "./location-form/LocationBasicTab";
import { LocationMeoTab } from "./location-form/LocationMeoTab";
import { LocationBlockedDatesTab } from "./location-form/LocationBlockedDatesTab";
import { LocationSmartLockDevicesTab } from "./location-form/LocationSmartLockDevicesTab";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";

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

  // 既存ロケーションで businessHours が未設定(null)の場合、DEFAULT_BUSINESS_HOURS に
  // フォールバックしない。無関係なフィールドの保存だけで GBP 同期が発火し、
  // 未設定だった営業時間がデフォルト値のまま Google に公開されてしまうため
  // (作成モードのみ新規デフォルトを適用し、編集モードでは null を維持する)。
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(
    () =>
      parseBusinessHours(location?.businessHours) ??
      (isEdit ? null : DEFAULT_BUSINESS_HOURS),
  );
  const [specialHolidays, setSpecialHolidays] = useState<readonly string[]>(
    () => location?.specialHolidays ?? [],
  );
  const businessHoursPayload = businessHours
    ? JSON.stringify(businessHours)
    : "";
  // 「休業日を追加」で挿入される空エントリは送信前に除外する（未入力のまま保存すると
  // location-json-ld.ts の validFrom/validThrough に空文字列がそのまま出力される）。
  const nonEmptySpecialHolidays = specialHolidays.filter((date) => date !== "");
  const specialHolidaysPayload =
    nonEmptySpecialHolidays.length > 0
      ? JSON.stringify(nonEmptySpecialHolidays)
      : "";

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
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
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

  const meoValues = {
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
          className="data-[state=inactive]:hidden"
        >
          <LocationBasicTab
            isPending={isPending}
            form={form}
            fields={fields}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            postalCode={postalCode}
            setPostalCode={setPostalCode}
            prefecture={prefecture}
            setPrefecture={setPrefecture}
            city={city}
            setCity={setCity}
            imageUrl={imageUrl}
            amenities={amenities}
            setAmenities={setAmenities}
            isPublished={isPublished}
            setIsPublished={setIsPublished}
            businessHours={businessHours}
            setBusinessHours={setBusinessHours}
            specialHolidays={specialHolidays}
            setSpecialHolidays={setSpecialHolidays}
            accessLinesList={accessLinesList}
            imageUrlsList={imageUrlsList}
            accessLinesDndContextId={accessLinesDndContextId}
            dndContextId={dndContextId}
            sensors={sensors}
            onAccessLineDragEnd={handleAccessLineDragEnd}
            onImageDragEnd={handleImageDragEnd}
            onOpenMainImagePicker={() => mainImagePicker.openPicker()}
            onOpenAdditionalImagesPicker={() =>
              additionalImagesPicker.openPicker()
            }
          />
        </TabsContent>

        <TabsContent
          value="meo"
          forceMount
          className="mt-6 space-y-6 data-[state=inactive]:hidden"
        >
          <LocationMeoTab
            isPending={isPending}
            fields={fields}
            meoValues={meoValues}
            globals={globals}
            location={location}
            gbpEnabledGlobally={gbpEnabledGlobally}
            latitude={latitude}
            setLatitude={setLatitude}
            longitude={longitude}
            setLongitude={setLongitude}
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber}
            email={email}
            setEmail={setEmail}
            priceRange={priceRange}
            setPriceRange={setPriceRange}
            paymentAccepted={paymentAccepted}
            setPaymentAccepted={setPaymentAccepted}
            googleBusinessPlaceId={googleBusinessPlaceId}
            setGoogleBusinessPlaceId={setGoogleBusinessPlaceId}
          />
        </TabsContent>

        {isEdit && location && (
          <TabsContent
            value="blocked-dates"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            <LocationBlockedDatesTab
              locationId={location.id}
              initialBlockedDates={initialBlockedDates}
            />
          </TabsContent>
        )}

        {isEdit && location && (
          <TabsContent
            value="smart-lock-devices"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            <LocationSmartLockDevicesTab
              locationId={location.id}
              defaultSmartLockDeviceId={location.defaultSmartLockDeviceId}
              initialSmartLockDevices={initialSmartLockDevices}
            />
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
