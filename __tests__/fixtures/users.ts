/**
 * ユーザーテストデータ
 */

import { Role } from "@generated/prisma/enums";
import type { AdminUser } from "@/shared/lib/admin-auth";

type FixtureUser = AdminUser & {
  createdAt: Date;
  updatedAt: Date;
};

export const SUPER_ADMIN_USER: FixtureUser = {
  id: "super-admin-id",
  email: "superadmin@example.com",
  name: "Super Admin",
  role: Role.SUPER_ADMIN,
  emailVerified: true,
  image: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

export const ADMIN_USER: FixtureUser = {
  id: "admin-id",
  email: "admin@example.com",
  name: "Admin User",
  role: Role.ADMIN,
  emailVerified: true,
  image: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

export const EDITOR_USER: FixtureUser = {
  id: "editor-id",
  email: "editor@example.com",
  name: "Editor User",
  role: Role.EDITOR,
  emailVerified: true,
  image: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

export const VIEWER_USER: FixtureUser = {
  id: "viewer-id",
  email: "viewer@example.com",
  name: "Viewer User",
  role: Role.VIEWER,
  emailVerified: true,
  image: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

export const REGULAR_USER: FixtureUser = {
  id: "user-id",
  email: "user@example.com",
  name: "Regular User",
  role: Role.USER,
  emailVerified: true,
  image: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};
