import type { Role } from "@generated/prisma/enums";
import type { Serialized } from "@/shared/lib/serialize";

type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    reservations: number;
    posts: number;
  };
};

export type UserData = Serialized<UserRecord>;

export type UserListParams = {
  page?: number | undefined;
  perPage?: number | undefined;
  search?: string | undefined;
  role?: Role | "ALL" | undefined;
  sortBy?: "name" | "email" | "role" | "createdAt" | undefined;
  sortOrder?: "asc" | "desc" | undefined;
};

export type UserListResult = {
  users: UserData[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

export type UserStats = {
  total: number;
  admins: number;
  users: number;
  recentUsers: number;
};
