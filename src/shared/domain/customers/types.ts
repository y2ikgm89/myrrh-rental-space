import type {
  CustomerStatus,
  CustomerType,
  ReservationStatus,
} from "@generated/prisma/enums";
import type { PaginationInput } from "@/shared/lib/pagination";
import type { Serialized } from "@/shared/lib/serialize";

type CustomerRecord = {
  id: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  companyName: string | null;
  customerType: CustomerType;
  email: string;
  phoneNumber: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  building: string | null;
  status: CustomerStatus;
  notes: string | null;
  totalReservations: number;
  totalSpent: number | null;
  lastReservationAt: Date | null;
  firstReservationAt: Date | null;
  isActive: boolean;
  marketingOptIn: boolean;
  phoneContactOptIn: boolean;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerReservationRecord = {
  id: string;
  startTime: Date;
  endTime: Date;
  status: ReservationStatus;
  totalPrice: number | null;
  space: {
    id: string;
    name: string;
  };
};

export type CustomerData = Serialized<CustomerRecord> & {
  latestGuestName: {
    lastName: string;
    firstName: string | null;
  } | null;
};

export type CustomerWithReservations = Serialized<
  CustomerRecord & {
    reservations: CustomerReservationRecord[];
  }
>;

export type CustomerWithReservationsAndAccount = Serialized<
  CustomerRecord & {
    reservations: CustomerReservationRecord[];
    user: {
      accounts: CustomerAccountInfo[];
    } | null;
  }
>;

export type GetCustomersResult = {
  customers: CustomerData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type CustomerFilters = {
  status?: CustomerStatus | "ALL";
  customerType?: CustomerType | "ALL";
  search?: string;
  isActive?: boolean;
};

export type CustomerSortBy =
  | "createdAt"
  | "lastName"
  | "totalReservations"
  | "lastReservationAt"
  | "totalSpent";

export type CustomerPagination = PaginationInput<CustomerSortBy>;

export type CustomerStats = {
  total: number;
  new: number;
  regular: number;
  vip: number;
  inactive: number;
  blacklist: number;
};

export type CustomerSearchResult = {
  id: string;
  lastName: string;
  firstName: string;
  companyName: string | null;
  customerType: CustomerType;
  email: string;
  phoneNumber: string | null;
  status: CustomerStatus;
};

export type CustomerAccountInfo = {
  provider: string;
};

export type CustomerWithAccount = CustomerRecord & {
  user: {
    accounts: CustomerAccountInfo[];
  } | null;
};
