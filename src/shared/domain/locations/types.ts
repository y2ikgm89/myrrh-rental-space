import type { BusinessHours } from "@/shared/lib/json-validators";
import type { Serialized } from "@/shared/lib/serialize";

type LocationRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  address: string;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
  accessLines: string[];
  parkingInfo: string | null;
  amenities: Record<string, boolean>;
  imageUrl: string;
  imageUrls: string[];
  businessHours: BusinessHours | null;
  specialHolidays: string[] | null;
  latitude: number | null;
  longitude: number | null;
  googleBusinessPlaceId: string | null;
  googleReviewUrl: string | null;
  priceRange: string | null;
  paymentAccepted: string | null;
  phoneNumber: string | null;
  email: string | null;
  gbpSyncEnabled: boolean;
  gbpSyncedAt: Date | null;
  gbpSyncError: string | null;
  sortOrder: number;
  isPublished: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  defaultSmartLockDeviceId: string | null;
  _count: {
    spaces: number;
  };
};

export type LocationWithStats = Serialized<LocationRecord>;

export type GetLocationsResult = {
  locations: LocationWithStats[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PublishedLocationOption = {
  id: string;
  name: string;
  address: string;
};

/**
 * 管理 queries・public queries で共有する LocationData 型。
 * toPlainObject 経由で ISO string 化した createdAt/updatedAt を含む。
 */
export type LocationData = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly postalCode: string | null;
  readonly prefecture: string | null;
  readonly city: string | null;
  readonly streetAddress: string | null;
  readonly buildingName: string | null;
  readonly accessLines: string[];
  readonly parkingInfo: string | null;
  readonly amenities: unknown;
  readonly imageUrl: string;
  readonly imageUrls: unknown;
  readonly businessHours: unknown;
  readonly specialHolidays: unknown;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly googleBusinessPlaceId: string | null;
  readonly googleReviewUrl: string | null;
  readonly priceRange: string | null;
  readonly paymentAccepted: string | null;
  readonly phoneNumber: string | null;
  readonly email: string | null;
  readonly gbpSyncEnabled: boolean;
  readonly gbpSyncedAt: string | null;
  readonly gbpSyncError: string | null;
  readonly sortOrder: number;
  readonly isPublished: boolean;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};
