import type { CustomerStatus, ReservationStatus } from "@/shared/db/enums";
import type { Serialized } from "@/shared/lib/serialize";

type CustomerRecord = {
  id: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  companyName: string | null;
  email: string;
  phoneNumber: string | null;
  address: string | null;
  status: CustomerStatus;
  notes: string | null;
  totalReservations: number;
  totalSpent: number | null;
  lastReservationAt: Date | null;
  firstReservationAt: Date | null;
  isActive: boolean;
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

export type CustomerData = Serialized<CustomerRecord>;

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
  search?: string;
  isActive?: boolean;
};

export type CustomerPagination = {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "lastName" | "totalReservations" | "lastReservationAt";
  sortOrder?: "asc" | "desc";
};

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
