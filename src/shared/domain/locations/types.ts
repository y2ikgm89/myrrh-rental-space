import type { BusinessHours } from "@/shared/lib/json-validators";
import type { Serialized } from "@/shared/lib/serialize";

type LocationRecord = {
  id: string;
  name: string;
  description: string | null;
  address: string;
  access: string | null;
  parkingInfo: string | null;
  amenities: Record<string, boolean>;
  imageUrl: string;
  imageUrls: string[];
  businessHours: BusinessHours | null;
  sortOrder: number;
  isPublished: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
