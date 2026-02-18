/**
 * Prisma Client モック
 *
 * - 型安全なモック実装
 * - テストごとにリセット可能
 * - デフォルト動作を定義
 */

import { mock } from 'bun:test'

// 型定義 — 引数なし・戻り値 Promise<unknown> のモック関数
// テスト内では mockResolvedValueOnce / mockImplementationOnce で上書きする
type MockFunction = ReturnType<typeof mock<() => Promise<unknown>>>

interface MockReservation {
  findFirst: MockFunction
  findUnique: MockFunction
  findMany: MockFunction
  count: MockFunction
  create: MockFunction
  update: MockFunction
  delete: MockFunction
}



interface MockCustomer {
  findUnique: MockFunction
  findFirst: MockFunction
  findMany: MockFunction
  create: MockFunction
  update: MockFunction
  upsert: MockFunction
}

interface MockSpace {
  findUnique: MockFunction
  findMany: MockFunction
  findFirst: MockFunction
  create: MockFunction
  update: MockFunction
  delete: MockFunction
  count: MockFunction
}

interface MockUser {
  findUnique: MockFunction
  findMany: MockFunction
  findFirst: MockFunction
  create: MockFunction
  update: MockFunction
  delete: MockFunction
  count: MockFunction
}

interface MockPermission {
  findUnique: MockFunction
  findMany: MockFunction
  upsert: MockFunction
}

interface MockRolePermission {
  findUnique: MockFunction
  findMany: MockFunction
  upsert: MockFunction
}

interface MockAuditLog {
  create: MockFunction
  findMany: MockFunction
}

interface MockSettings {
  findUnique: MockFunction
  upsert: MockFunction
  update: MockFunction
}

interface MockInquiry {
  findUnique: MockFunction
  findMany: MockFunction
  create: MockFunction
  update: MockFunction
  delete: MockFunction
  count: MockFunction
}

export interface MockPrismaClient {
  reservation: MockReservation
  customer: MockCustomer
  space: MockSpace
  user: MockUser
  permission: MockPermission
  rolePermission: MockRolePermission
  auditLog: MockAuditLog
  settings: MockSettings
  inquiry: MockInquiry
  $transaction: MockFunction
  $queryRaw: MockFunction
}

export function createMockPrismaClient(): MockPrismaClient {
  // デフォルト実装はシンプルな固定値を返す。
  // 各テストで mockResolvedValueOnce / mockImplementationOnce を使って上書きする。
  return {
    reservation: {
      findFirst: mock(() => Promise.resolve(null)),
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      count: mock(() => Promise.resolve(0)),
      create: mock(() => Promise.resolve({ id: 'test-reservation-id' })),
      update: mock(() => Promise.resolve({ id: 'test-reservation-id' })),
      delete: mock(() => Promise.resolve({ id: 'test-reservation-id' })),
    },
    customer: {
      findUnique: mock(() => Promise.resolve(null)),
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock(() => Promise.resolve({ id: 'test-customer-id' })),
      update: mock(() => Promise.resolve({ id: 'test-customer-id' })),
      upsert: mock(() => Promise.resolve({ id: 'test-customer-id' })),
    },
    space: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      findFirst: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 'test-space-id' })),
      update: mock(() => Promise.resolve({ id: 'test-space-id' })),
      delete: mock(() => Promise.resolve({ id: 'test-space-id' })),
      count: mock(() => Promise.resolve(0)),
    },
    user: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      findFirst: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 'test-user-id' })),
      update: mock(() => Promise.resolve({ id: 'test-user-id' })),
      delete: mock(() => Promise.resolve({ id: 'test-user-id' })),
      count: mock(() => Promise.resolve(0)),
    },
    permission: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      upsert: mock(() => Promise.resolve({ id: 'test-permission-id' })),
    },
    rolePermission: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      upsert: mock(() => Promise.resolve({ id: 'test-role-permission-id' })),
    },
    auditLog: {
      create: mock(() => Promise.resolve({ id: 'test-audit-log-id' })),
      findMany: mock(() => Promise.resolve([])),
    },
    settings: {
      findUnique: mock(() => Promise.resolve(null)),
      upsert: mock(() => Promise.resolve({ id: 'test-settings-id' })),
      update: mock(() => Promise.resolve({ id: 'test-settings-id' })),
    },
    inquiry: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock(() => Promise.resolve({ id: 'test-inquiry-id' })),
      update: mock(() => Promise.resolve({ id: 'test-inquiry-id' })),
      delete: mock(() => Promise.resolve({ id: 'test-inquiry-id' })),
      count: mock(() => Promise.resolve(0)),
    },
    $transaction: mock(() => Promise.resolve([])),
    $queryRaw: mock(() => Promise.resolve([{ '1': 1 }])),
  }
}

// グローバルモックインスタンス
export let mockPrisma: MockPrismaClient = createMockPrismaClient()

export function resetPrismaMock(): void {
  mockPrisma = createMockPrismaClient()
}
