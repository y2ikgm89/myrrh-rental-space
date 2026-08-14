import type {
  CustomerStatus,
  CustomerType,
  EmailDeliveryStatus,
  RegistrationStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
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
  flaggedForReviewAt: Date | null;
  flagReasons: string[];
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

type CustomerEventRegistrationRecord = {
  id: string;
  status: RegistrationStatus;
  quantity: number;
  createdAt: Date;
  event: {
    id: string;
    title: string;
    slug: string;
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
    eventRegistrations: CustomerEventRegistrationRecord[];
    user: {
      accounts: CustomerAccountInfo[];
    } | null;
    /**
     * Resend Webhook が観測した配信状態。HARD_BOUNCED / COMPLAINED / SOFT_BOUNCED は
     * sendEmail() の suppression 判定に使われ、それらの状態では以降のメール送信が
     * silent に drop される。管理画面から `resetCustomerEmailDelivery` action で
     * OK にリセットできる (RESEND-AUDIT M8)。
     */
    emailDeliveryStatus: EmailDeliveryStatus;
    /**
     * suppressedEmailHash 経路で抑制されているか（hash 値そのものは出さない）。
     *
     * 統合・匿名化で持ち越された hash は `emailDeliveryStatus` に現れないため、
     * これが無いと管理者は「なぜメールが届かないのか」を画面から知りようがない
     * （監査 F-44）。
     */
    emailSuppressedByHash: boolean;
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
  /** customer-risk-scan cronが検知した要注意顧客のみに絞る(flaggedForReviewAt IS NOT NULL) */
  flaggedOnly?: boolean;
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
  userId: string | null;
};

export type CustomerAccountInfo = {
  provider: string;
};

export type CustomerWithAccount = CustomerRecord & {
  user: {
    accounts: CustomerAccountInfo[];
  } | null;
};
