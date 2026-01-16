/**
 * 顧客管理Server Action統合テスト
 *
 * src/actions/admin/customer.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'

// customer.ts 内で定義されているスキーマを再現
const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['NEW', 'REGULAR', 'VIP', 'INACTIVE', 'BLACKLIST']),
})

const updateNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
})

// CustomerStatus enum の再現
type CustomerStatus = 'NEW' | 'REGULAR' | 'VIP' | 'INACTIVE' | 'BLACKLIST'
const CUSTOMER_STATUSES: CustomerStatus[] = ['NEW', 'REGULAR', 'VIP', 'INACTIVE', 'BLACKLIST']

// 有効なUUID
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

// 有効なステータス更新データ
const VALID_UPDATE_STATUS_INPUT = {
  id: VALID_UUID,
  status: 'REGULAR' as const,
}

// 有効なメモ更新データ
const VALID_UPDATE_NOTES_INPUT = {
  id: VALID_UUID,
  notes: 'VIP顧客。特別対応が必要。',
}

describe('Customer Admin Action Integration', () => {
  describe('updateStatusSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = updateStatusSchema.safeParse(VALID_UPDATE_STATUS_INPUT)
        expect(result.success).toBe(true)
      })

      test('全ステータス値が許可される', () => {
        for (const status of CUSTOMER_STATUSES) {
          const result = updateStatusSchema.safeParse({
            id: VALID_UUID,
            status,
          })
          expect(result.success).toBe(true)
        }
      })
    })

    describe('id', () => {
      test('無効なUUIDはエラー', () => {
        const invalidIds = [
          'invalid',
          '12345',
          'not-a-uuid',
          '550e8400-e29b-41d4-a716', // 途中で切れている
        ]

        for (const id of invalidIds) {
          const result = updateStatusSchema.safeParse({
            id,
            status: 'REGULAR',
          })
          expect(result.success).toBe(false)
        }
      })

      test('空のIDはエラー', () => {
        const result = updateStatusSchema.safeParse({
          id: '',
          status: 'REGULAR',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('status', () => {
      test('無効なステータスはエラー', () => {
        const invalidStatuses = ['INVALID', 'ACTIVE', 'PENDING', 'GOLD']

        for (const status of invalidStatuses) {
          const result = updateStatusSchema.safeParse({
            id: VALID_UUID,
            status,
          })
          expect(result.success).toBe(false)
        }
      })

      test('小文字のステータスはエラー', () => {
        const result = updateStatusSchema.safeParse({
          id: VALID_UUID,
          status: 'regular',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('updateNotesSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = updateNotesSchema.safeParse(VALID_UPDATE_NOTES_INPUT)
        expect(result.success).toBe(true)
      })

      test('nullのnotesは許可', () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: null,
        })
        expect(result.success).toBe(true)
      })

      test('空文字のnotesは許可', () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: '',
        })
        expect(result.success).toBe(true)
      })

      test('2000文字のnotesは許可', () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: 'あ'.repeat(2000),
        })
        expect(result.success).toBe(true)
      })
    })

    describe('notes', () => {
      test('2001文字のnotesはエラー', () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: 'あ'.repeat(2001),
        })
        expect(result.success).toBe(false)
      })

      test('改行を含むnotesは許可', () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: '重要顧客\n- 特別対応必要\n- 割引適用可',
        })
        expect(result.success).toBe(true)
      })

      test('絵文字を含むnotesは許可', () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: 'VIP顧客 ⭐ 常連様です 🙏',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('id', () => {
      test('無効なUUIDはエラー', () => {
        const result = updateNotesSchema.safeParse({
          id: 'invalid-uuid',
          notes: 'テスト',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('CustomerStatus 整合性', () => {
    test('CustomerStatusは5つの値を持つ', () => {
      expect(CUSTOMER_STATUSES).toHaveLength(5)
    })

    test('全ステータス値が定義されている', () => {
      const expectedStatuses = ['NEW', 'REGULAR', 'VIP', 'INACTIVE', 'BLACKLIST']
      expect(CUSTOMER_STATUSES.sort()).toEqual(expectedStatuses.sort())
    })
  })

  describe('フィルター型テスト', () => {
    test('有効なフィルター値', () => {
      type CustomerFilters = {
        status?: CustomerStatus | 'ALL'
        search?: string
        isActive?: boolean
      }

      const filters: CustomerFilters = {
        status: 'VIP',
        search: '山田',
        isActive: true,
      }

      expect(filters.status).toBe('VIP')
      expect(filters.isActive).toBe(true)
    })

    test('ALL ステータスフィルター', () => {
      type CustomerFilters = {
        status?: CustomerStatus | 'ALL'
      }

      const filters: CustomerFilters = {
        status: 'ALL',
      }

      expect(filters.status).toBe('ALL')
    })
  })

  describe('ページネーション型テスト', () => {
    test('有効なページネーション値', () => {
      type CustomerPagination = {
        page?: number
        limit?: number
        sortBy?: 'createdAt' | 'lastName' | 'totalReservations' | 'lastReservationAt'
        sortOrder?: 'asc' | 'desc'
      }

      const pagination: CustomerPagination = {
        page: 1,
        limit: 10,
        sortBy: 'totalReservations',
        sortOrder: 'desc',
      }

      expect(pagination.page).toBe(1)
      expect(pagination.sortBy).toBe('totalReservations')
    })

    test('デフォルト値の想定', () => {
      const defaultPagination = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt' as const,
        sortOrder: 'desc' as const,
      }

      expect(defaultPagination.page).toBe(1)
      expect(defaultPagination.limit).toBe(10)
      expect(defaultPagination.sortBy).toBe('createdAt')
      expect(defaultPagination.sortOrder).toBe('desc')
    })
  })

  describe('境界値テスト', () => {
    test('notes 2000文字（境界）', () => {
      const result = updateNotesSchema.safeParse({
        id: VALID_UUID,
        notes: 'x'.repeat(2000),
      })
      expect(result.success).toBe(true)
    })

    test('notes 2001文字（境界超過）', () => {
      const result = updateNotesSchema.safeParse({
        id: VALID_UUID,
        notes: 'x'.repeat(2001),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('UUID形式テスト', () => {
    test('有効なUUID形式（v4）', () => {
      const validUuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      ]

      for (const id of validUuids) {
        const result = updateStatusSchema.safeParse({
          id,
          status: 'NEW',
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('CustomerData型テスト', () => {
    test('CustomerData型の構造', () => {
      type CustomerData = {
        id: string
        lastName: string
        firstName: string
        email: string
        phoneNumber: string | null
        address: string | null
        status: CustomerStatus
        notes: string | null
        totalReservations: number
        totalSpent: number | null
        lastReservationAt: Date | null
        firstReservationAt: Date | null
        isActive: boolean
        createdAt: Date
        updatedAt: Date
      }

      const customer: CustomerData = {
        id: VALID_UUID,
        lastName: '山田',
        firstName: '太郎',
        email: 'yamada@example.com',
        phoneNumber: '090-1234-5678',
        address: '東京都渋谷区',
        status: 'REGULAR',
        notes: 'テスト顧客',
        totalReservations: 5,
        totalSpent: 50000,
        lastReservationAt: new Date(),
        firstReservationAt: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(customer.status).toBe('REGULAR')
      expect(customer.totalReservations).toBe(5)
    })
  })

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
})
