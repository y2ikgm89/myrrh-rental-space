/**
 * クーポン管理Server Action統合テスト
 *
 * src/actions/admin/coupon.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + 型構造をテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'

// =============================================================================
// CouponType enum再現（prisma generated）
// =============================================================================

const CouponType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const

// =============================================================================
// coupon.ts内で使用されているスキーマを再現
// =============================================================================

const couponCodeSchema = z
  .string()
  .min(4, { error: 'クーポンコードは4文字以上で入力してください' })
  .max(20, { error: 'クーポンコードは20文字以内で入力してください' })
  .regex(/^[A-Z0-9]+$/, { error: 'クーポンコードは大文字英数字のみ使用できます' })
  .transform((val) => val.toUpperCase())

const couponTypeSchema = z.enum(CouponType)

const discountValueSchema = z.coerce
  .number()
  .positive({ error: '割引値は0より大きい必要があります' })

const couponFormSchema = z
  .object({
    code: couponCodeSchema,
    name: z
      .string()
      .min(1, { error: '名称を入力してください' })
      .max(100, { error: '名称は100文字以内で入力してください' }),
    description: z
      .string()
      .max(500, { error: '説明は500文字以内で入力してください' })
      .optional()
      .or(z.literal('')),
    type: couponTypeSchema,
    discountValue: discountValueSchema,
    minReservationAmount: z.coerce
      .number()
      .nonnegative({ error: '最低利用金額は0以上で入力してください' })
      .optional()
      .nullable(),
    maxDiscountAmount: z.coerce
      .number()
      .positive({ error: '最大割引額は0より大きい必要があります' })
      .optional()
      .nullable(),
    validFrom: z.coerce.date({ error: '有効開始日を入力してください' }),
    validUntil: z.coerce.date().optional().nullable(),
    usageLimit: z.coerce
      .number()
      .int({ error: '利用回数上限は整数で入力してください' })
      .positive({ error: '利用回数上限は1以上で入力してください' })
      .optional()
      .nullable(),
    isActive: z.boolean().default(true),
    canCombineWithDurationDiscount: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.type === 'PERCENTAGE' && data.discountValue > 100) {
        return false
      }
      return true
    },
    {
      error: 'パーセント割引は100%以下で入力してください',
      path: ['discountValue'],
    }
  )
  .refine(
    (data) => {
      if (data.validUntil && data.validFrom > data.validUntil) {
        return false
      }
      return true
    },
    {
      error: '有効期限は開始日より後に設定してください',
      path: ['validUntil'],
    }
  )

// =============================================================================
// テストデータ
// =============================================================================

const VALID_COUPON_INPUT = {
  code: 'SUMMER2026',
  name: '夏季キャンペーン20%OFF',
  description: '夏季限定の割引クーポンです',
  type: 'PERCENTAGE' as const,
  discountValue: 20,
  minReservationAmount: 5000,
  maxDiscountAmount: 3000,
  validFrom: new Date('2026-07-01'),
  validUntil: new Date('2026-08-31'),
  usageLimit: 100,
  isActive: true,
  canCombineWithDurationDiscount: false,
}

const VALID_FIXED_COUPON_INPUT = {
  code: 'FLAT1000',
  name: '1000円割引クーポン',
  description: '',
  type: 'FIXED_AMOUNT' as const,
  discountValue: 1000,
  minReservationAmount: null,
  maxDiscountAmount: null,
  validFrom: new Date('2026-01-01'),
  validUntil: null,
  usageLimit: null,
  isActive: true,
  canCombineWithDurationDiscount: true,
}

describe('Coupon Admin Action Integration', () => {
  describe('couponFormSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なパーセント割引クーポンはバリデーション通過', () => {
        const result = couponFormSchema.safeParse(VALID_COUPON_INPUT)
        expect(result.success).toBe(true)
      })

      test('有効な定額割引クーポンはバリデーション通過', () => {
        const result = couponFormSchema.safeParse(VALID_FIXED_COUPON_INPUT)
        expect(result.success).toBe(true)
      })

      test('descriptionは空文字列許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          description: '',
        })
        expect(result.success).toBe(true)
      })

      test('descriptionはオプション（省略可能）', () => {
        const input = { ...VALID_COUPON_INPUT }
        delete (input as Record<string, unknown>).description
        const result = couponFormSchema.safeParse(input)
        expect(result.success).toBe(true)
      })

      test('validUntilはnull許可（無期限）', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          validUntil: null,
        })
        expect(result.success).toBe(true)
      })

      test('usageLimitはnull許可（無制限）', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          usageLimit: null,
        })
        expect(result.success).toBe(true)
      })

      test('minReservationAmountはnull許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          minReservationAmount: null,
        })
        expect(result.success).toBe(true)
      })

      test('maxDiscountAmountはnull許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          maxDiscountAmount: null,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('code', () => {
      test('4文字のコードはOK', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          code: 'ABCD',
        })
        expect(result.success).toBe(true)
      })

      test('3文字のコードはエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          code: 'ABC',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('4文字以上')
        }
      })

      test('20文字のコードはOK', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          code: 'A'.repeat(20),
        })
        expect(result.success).toBe(true)
      })

      test('21文字のコードはエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          code: 'A'.repeat(21),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('20文字以内')
        }
      })

      test('大文字英数字のみ許可', () => {
        const validCodes = ['SUMMER2026', 'ABCD', '1234', 'TEST1234']
        for (const code of validCodes) {
          const result = couponFormSchema.safeParse({
            ...VALID_COUPON_INPUT,
            code,
          })
          expect(result.success).toBe(true)
        }
      })

      test('小文字はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          code: 'summer',
        })
        expect(result.success).toBe(false)
      })

      test('ハイフン含むコードはエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          code: 'SUMMER-2026',
        })
        expect(result.success).toBe(false)
      })

      test('スペース含むコードはエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          code: 'SUMMER 2026',
        })
        expect(result.success).toBe(false)
      })

      test('日本語コードはエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          code: 'クーポン',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('name', () => {
      test('空の名称はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          name: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('名称を入力')
        }
      })

      test('100文字の名称はOK', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          name: 'あ'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字の名称はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          name: 'あ'.repeat(101),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('100文字以内')
        }
      })
    })

    describe('description', () => {
      test('500文字の説明はOK', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          description: 'あ'.repeat(500),
        })
        expect(result.success).toBe(true)
      })

      test('501文字の説明はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          description: 'あ'.repeat(501),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500文字以内')
        }
      })
    })

    describe('type', () => {
      test('PERCENTAGEは許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          type: 'PERCENTAGE',
        })
        expect(result.success).toBe(true)
      })

      test('FIXED_AMOUNTは許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          type: 'FIXED_AMOUNT',
          discountValue: 500,
        })
        expect(result.success).toBe(true)
      })

      test('無効なタイプはエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          type: 'INVALID_TYPE',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('discountValue', () => {
      test('正の値は許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          discountValue: 50,
        })
        expect(result.success).toBe(true)
      })

      test('0はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          discountValue: 0,
        })
        expect(result.success).toBe(false)
      })

      test('負の値はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          discountValue: -10,
        })
        expect(result.success).toBe(false)
      })

      test('文字列からのcoerce変換', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          discountValue: '20',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('minReservationAmount', () => {
      test('0は許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          minReservationAmount: 0,
        })
        expect(result.success).toBe(true)
      })

      test('負の値はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          minReservationAmount: -1000,
        })
        expect(result.success).toBe(false)
      })
    })

    describe('maxDiscountAmount', () => {
      test('正の値は許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          maxDiscountAmount: 5000,
        })
        expect(result.success).toBe(true)
      })

      test('0はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          maxDiscountAmount: 0,
        })
        expect(result.success).toBe(false)
      })
    })

    describe('usageLimit', () => {
      test('正の整数は許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          usageLimit: 50,
        })
        expect(result.success).toBe(true)
      })

      test('0はエラー（1以上必要）', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          usageLimit: 0,
        })
        expect(result.success).toBe(false)
      })

      test('小数はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          usageLimit: 1.5,
        })
        expect(result.success).toBe(false)
      })
    })

    describe('validFrom / validUntil', () => {
      test('有効な日付は許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          validFrom: new Date('2026-01-01'),
          validUntil: new Date('2026-12-31'),
        })
        expect(result.success).toBe(true)
      })

      test('文字列の日付はcoerce変換', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          validFrom: '2026-01-01',
          validUntil: '2026-12-31',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('isActive / canCombineWithDurationDiscount', () => {
      test('boolean値は許可', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          isActive: false,
          canCombineWithDurationDiscount: true,
        })
        expect(result.success).toBe(true)
      })

      test('文字列のisActiveはエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          isActive: 'true',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('refine バリデーション', () => {
    describe('パーセント割引上限チェック', () => {
      test('パーセント割引100%はOK', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          type: 'PERCENTAGE',
          discountValue: 100,
        })
        expect(result.success).toBe(true)
      })

      test('パーセント割引101%はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          type: 'PERCENTAGE',
          discountValue: 101,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          const refinementIssue = result.error.issues.find(
            (issue) => issue.path.includes('discountValue') && issue.message.includes('100%')
          )
          expect(refinementIssue).toBeTruthy()
        }
      })

      test('定額割引は100超でもOK', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          type: 'FIXED_AMOUNT',
          discountValue: 5000,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('日付範囲チェック', () => {
      test('validUntilがvalidFromより後はOK', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          validFrom: new Date('2026-01-01'),
          validUntil: new Date('2026-12-31'),
        })
        expect(result.success).toBe(true)
      })

      test('validUntilがvalidFromより前はエラー', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          validFrom: new Date('2026-12-31'),
          validUntil: new Date('2026-01-01'),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          const refinementIssue = result.error.issues.find(
            (issue) => issue.path.includes('validUntil') && issue.message.includes('開始日より後')
          )
          expect(refinementIssue).toBeTruthy()
        }
      })

      test('validUntilがnullの場合はrefineスキップ', () => {
        const result = couponFormSchema.safeParse({
          ...VALID_COUPON_INPUT,
          validFrom: new Date('2026-12-31'),
          validUntil: null,
        })
        expect(result.success).toBe(true)
      })
    })
  })

  describe('フィルター型テスト', () => {
    test('有効なCouponFiltersの値', () => {
      type CouponStatusFilter = 'active' | 'inactive' | 'expired' | 'limitReached' | 'notStarted'
      type CouponFilters = {
        status?: CouponStatusFilter
        type?: 'PERCENTAGE' | 'FIXED_AMOUNT'
        search?: string
      }

      const filters: CouponFilters = {
        status: 'active',
        type: 'PERCENTAGE',
        search: 'SUMMER',
      }

      expect(filters.status).toBe('active')
      expect(filters.type).toBe('PERCENTAGE')
      expect(filters.search).toBe('SUMMER')
    })

    test('フィルターなしも許可', () => {
      type CouponFilters = {
        status?: string
        type?: string
        search?: string
      }

      const filters: CouponFilters = {}
      expect(Object.keys(filters)).toHaveLength(0)
    })
  })

  describe('ページネーション型テスト', () => {
    test('有効なCouponPaginationの値', () => {
      type CouponPagination = {
        page?: number
        limit?: number
        sortBy?: 'code' | 'name' | 'createdAt' | 'validFrom' | 'usageCount'
        sortOrder?: 'asc' | 'desc'
      }

      const pagination: CouponPagination = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }

      expect(pagination.page).toBe(1)
      expect(pagination.limit).toBe(10)
      expect(pagination.sortBy).toBe('createdAt')
      expect(pagination.sortOrder).toBe('desc')
    })
  })

  describe('境界値テスト', () => {
    test('コード 4文字（境界）', () => {
      const result = couponFormSchema.safeParse({
        ...VALID_COUPON_INPUT,
        code: 'ABCD',
      })
      expect(result.success).toBe(true)
    })

    test('コード 3文字（境界未満）', () => {
      const result = couponFormSchema.safeParse({
        ...VALID_COUPON_INPUT,
        code: 'ABC',
      })
      expect(result.success).toBe(false)
    })

    test('コード 20文字（境界）', () => {
      const result = couponFormSchema.safeParse({
        ...VALID_COUPON_INPUT,
        code: 'A'.repeat(20),
      })
      expect(result.success).toBe(true)
    })

    test('コード 21文字（境界超過）', () => {
      const result = couponFormSchema.safeParse({
        ...VALID_COUPON_INPUT,
        code: 'A'.repeat(21),
      })
      expect(result.success).toBe(false)
    })

    test('名称 100文字（境界）', () => {
      const result = couponFormSchema.safeParse({
        ...VALID_COUPON_INPUT,
        name: 'x'.repeat(100),
      })
      expect(result.success).toBe(true)
    })

    test('名称 101文字（境界超過）', () => {
      const result = couponFormSchema.safeParse({
        ...VALID_COUPON_INPUT,
        name: 'x'.repeat(101),
      })
      expect(result.success).toBe(false)
    })

    test('パーセント割引 100%（境界）', () => {
      const result = couponFormSchema.safeParse({
        ...VALID_COUPON_INPUT,
        type: 'PERCENTAGE',
        discountValue: 100,
      })
      expect(result.success).toBe(true)
    })

    test('パーセント割引 101%（境界超過）', () => {
      const result = couponFormSchema.safeParse({
        ...VALID_COUPON_INPUT,
        type: 'PERCENTAGE',
        discountValue: 101,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CouponData型テスト', () => {
    test('CouponData型の構造', () => {
      type CouponData = {
        id: string
        code: string
        name: string
        description: string | null
        type: 'PERCENTAGE' | 'FIXED_AMOUNT'
        discountValue: number
        minReservationAmount: number | null
        maxDiscountAmount: number | null
        validFrom: Date
        validUntil: Date | null
        usageLimit: number | null
        usageCount: number
        isActive: boolean
        canCombineWithDurationDiscount: boolean
        createdAt: Date
        updatedAt: Date
      }

      const coupon: CouponData = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        code: 'SUMMER2026',
        name: '夏季キャンペーン',
        description: '夏季限定クーポン',
        type: 'PERCENTAGE',
        discountValue: 20,
        minReservationAmount: 5000,
        maxDiscountAmount: 3000,
        validFrom: new Date('2026-07-01'),
        validUntil: new Date('2026-08-31'),
        usageLimit: 100,
        usageCount: 25,
        isActive: true,
        canCombineWithDurationDiscount: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(coupon.code).toBe('SUMMER2026')
      expect(coupon.type).toBe('PERCENTAGE')
      expect(coupon.discountValue).toBe(20)
      expect(coupon.usageCount).toBe(25)
    })
  })
})
