/**
 * Prisma Client モック
 *
 * - 型安全なモック実装
 * - テストごとにリセット可能
 * - デフォルト動作を定義
 */

import { mock } from 'bun:test'
import type { Prisma } from '@/shared/generated/prisma/client'

// 型定義
type MockFunction<T = unknown> = ReturnType<typeof mock<() => Promise<T>>>

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
  return {
    reservation: {
      findFirst: mock(() => Promise.resolve(null)),
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      count: mock(() => Promise.resolve(0)),
      create: mock((args: Prisma.ReservationCreateArgs) =>
        Promise.resolve({ id: 'test-reservation-id', ...args.data })
      ),
      update: mock((args: Prisma.ReservationUpdateArgs) =>
        Promise.resolve({ id: args.where.id, ...args.data })
      ),
      delete: mock(() => Promise.resolve({ id: 'test-reservation-id' })),
    },
    customer: {
      findUnique: mock(() => Promise.resolve(null)),
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock((args: Prisma.CustomerCreateArgs) =>
        Promise.resolve({ id: 'test-customer-id', ...args.data })
      ),
      update: mock((args: Prisma.CustomerUpdateArgs) =>
        Promise.resolve({ id: args.where.id, ...args.data })
      ),
      upsert: mock((args: Prisma.CustomerUpsertArgs) =>
        Promise.resolve({ id: 'test-customer-id', ...args.create })
      ),
    },
    space: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      findFirst: mock(() => Promise.resolve(null)),
      create: mock((args: Prisma.SpaceCreateArgs) =>
        Promise.resolve({ id: 'test-space-id', ...args.data })
      ),
      update: mock((args: Prisma.SpaceUpdateArgs) =>
        Promise.resolve({ id: args.where.id, ...args.data })
      ),
      delete: mock(() => Promise.resolve({ id: 'test-space-id' })),
      count: mock(() => Promise.resolve(0)),
    },
    user: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      findFirst: mock(() => Promise.resolve(null)),
      create: mock((args: Prisma.UserCreateArgs) =>
        Promise.resolve({ id: 'test-user-id', ...args.data })
      ),
      update: mock((args: Prisma.UserUpdateArgs) =>
        Promise.resolve({ id: args.where.id, ...args.data })
      ),
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
    },
    inquiry: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock((args: Prisma.InquiryCreateArgs) =>
        Promise.resolve({ id: 'test-inquiry-id', ...args.data })
      ),
      update: mock((args: Prisma.InquiryUpdateArgs) =>
        Promise.resolve({ id: args.where.id, ...args.data })
      ),
      delete: mock(() => Promise.resolve({ id: 'test-inquiry-id' })),
      count: mock(() => Promise.resolve(0)),
    },
    $transaction: mock((fn: unknown) => {
      if (typeof fn === 'function') {
        return fn(mockPrisma)
      }
      return Promise.resolve(fn)
    }),
    $queryRaw: mock(() => Promise.resolve([{ '1': 1 }])),
  }
}

// グローバルモックインスタンス
export let mockPrisma: MockPrismaClient = createMockPrismaClient()

export function resetPrismaMock(): void {
  mockPrisma = createMockPrismaClient()
}
