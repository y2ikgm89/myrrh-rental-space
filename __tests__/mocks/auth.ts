/**
 * Better Auth モック
 *
 * - セッション管理
 * - ユーザー認証状態の制御
 */

import { mock } from "bun:test";
import { Role } from "@generated/prisma/enums";

// User型定義（Better Authのインターフェースに準拠）
export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  // Better Auth の User.image は省略可能
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  // EDITOR ロール用: 割り当てられたページIDの配列
  assignedPages?: string[];
}

export interface MockSession {
  user: MockUser;
  session: {
    token: string;
    userId: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  };
}

// モック関数
export const mockGetSession = mock<() => Promise<MockSession | null>>(() =>
  Promise.resolve(null),
);

export function createMockUser(overrides?: Partial<MockUser>): MockUser {
  return {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    role: Role.ADMIN,
    emailVerified: true,
    image: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function createMockSession(
  userOverrides?: Partial<MockUser>,
): MockSession {
  const user = createMockUser(userOverrides);

  return {
    user,
    session: {
      token: "test-session-token",
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24時間後
      ipAddress: "127.0.0.1",
      userAgent: "Test Agent",
    },
  };
}

export function setMockSession(session: MockSession | null): void {
  mockGetSession.mockResolvedValue(session);
}

export function clearMockSession(): void {
  mockGetSession.mockResolvedValue(null);
}

export function resetAuthMock(): void {
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(null);
}
