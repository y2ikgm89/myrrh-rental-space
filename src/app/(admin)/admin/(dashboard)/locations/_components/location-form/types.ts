import type { Dispatch, SetStateAction } from "react";
import type { FieldMetadata, FormMetadata } from "@conform-to/react";
import type { SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import type { DragEndEvent } from "@/admin/components/ui";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";
import type { LocationWithStats } from "@/shared/domain/locations/types";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { LocationFormInput } from "@/shared/lib/validations/location";
import type { MeoScoreValues, GlobalsMeoFlags } from "../LocationMeoScoreCard";

export type LocationFormMode = "create" | "edit";

export type LocationFormFieldList = Required<{
  [K in keyof LocationFormInput]: FieldMetadata<
    LocationFormInput[K],
    LocationFormInput,
    string[]
  >;
}>;

export type LocationFormListMutator = Pick<
  FormMetadata<LocationFormInput, string[]>,
  "insert" | "remove" | "reorder"
>;

export type LocationBasicTabProps = {
  isPending: boolean;
  form: LocationFormListMutator;
  fields: LocationFormFieldList;
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  postalCode: string;
  setPostalCode: (value: string) => void;
  prefecture: string;
  setPrefecture: (value: string) => void;
  city: string;
  setCity: (value: string) => void;
  imageUrl: string;
  amenities: Record<string, boolean>;
  setAmenities: Dispatch<SetStateAction<Record<string, boolean>>>;
  isPublished: boolean;
  setIsPublished: (value: boolean) => void;
  businessHours: BusinessHours | null;
  setBusinessHours: (value: BusinessHours | null) => void;
  specialHolidays: readonly string[];
  setSpecialHolidays: Dispatch<SetStateAction<readonly string[]>>;
  accessLinesList: FieldMetadata<
    NonNullable<LocationFormInput["accessLines"]>[number],
    LocationFormInput,
    string[]
  >[];
  imageUrlsList: FieldMetadata<
    NonNullable<LocationFormInput["imageUrls"]>[number],
    LocationFormInput,
    string[]
  >[];
  accessLinesDndContextId: string;
  dndContextId: string;
  sensors: SensorDescriptor<SensorOptions>[];
  onAccessLineDragEnd: (event: DragEndEvent) => void;
  onImageDragEnd: (event: DragEndEvent) => void;
  onOpenMainImagePicker: () => void;
  onOpenAdditionalImagesPicker: () => void;
};

export type LocationMeoTabProps = {
  isPending: boolean;
  fields: LocationFormFieldList;
  meoValues: MeoScoreValues;
  globals: GlobalsMeoFlags;
  location?: LocationWithStats | undefined;
  gbpEnabledGlobally: boolean;
  latitude: string;
  setLatitude: (value: string) => void;
  longitude: string;
  setLongitude: (value: string) => void;
  phoneNumber: string;
  setPhoneNumber: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  priceRange: string;
  setPriceRange: (value: string) => void;
  paymentAccepted: string;
  setPaymentAccepted: (value: string) => void;
  googleBusinessPlaceId: string;
  setGoogleBusinessPlaceId: (value: string) => void;
};

export type LocationBlockedDatesTabProps = {
  locationId: string;
  initialBlockedDates: readonly BlockedDateData[];
};

export type LocationSmartLockDevicesTabProps = {
  locationId: string;
  defaultSmartLockDeviceId: string | null;
  initialSmartLockDevices: readonly SmartLockDeviceData[];
};
