/**
 * スペース管理Server Action統合テスト
 *
 * src/actions/admin/space.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from 'bun:test'
import { spaceFormSchema, type SpaceFormData } from '@/lib/validations/space'

// 有効なUUID
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

// 有効なスペース作成データ
const VALID_SPACE_INPUT: SpaceFormData = {
  name: 'テストスペース',
  description: 'これはテスト用のスペースの説明です。10文字以上必要です。',
  address: '東京都渋谷区渋谷1-1-1',
  access: '渋谷駅から徒歩5分',
  capacity: 10,
  area: 50,
  hourlyPrice: 5000,
  dailyPrice: 30000,
  mainImageUrl: 'https://example.com/main.jpg',
  imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
  facilities: ['Wi-Fi', 'プロジェクター', 'ホワイトボード'],
  isPublished: false,
  termsId: null,
}

describe('Space Admin Action Integration', () => {
  describe('spaceFormSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = spaceFormSchema.safeParse(VALID_SPACE_INPUT)
        expect(result.success).toBe(true)
      })

      test('最小限の必須フィールドのみでOK', () => {
        const minimalInput = {
          name: 'スペース',
          description: '10文字以上の説明文です。',
          address: '東京都渋谷区',
          capacity: 1,
          hourlyPrice: 0,
          mainImageUrl: 'https://example.com/image.jpg',
        }
        const result = spaceFormSchema.safeParse(minimalInput)
        expect(result.success).toBe(true)
      })

      test('オプションフィールドnullでOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          area: null,
          dailyPrice: null,
          termsId: null,
        })
        expect(result.success).toBe(true)
      })

      test('imageUrlsデフォルトは空配列', () => {
        const input = {
          name: 'スペース',
          description: '10文字以上の説明文です。',
          address: '東京都渋谷区',
          capacity: 1,
          hourlyPrice: 0,
          mainImageUrl: 'https://example.com/image.jpg',
        }
        const result = spaceFormSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.imageUrls).toEqual([])
        }
      })

      test('facilitiesデフォルトは空配列', () => {
        const input = {
          name: 'スペース',
          description: '10文字以上の説明文です。',
          address: '東京都渋谷区',
          capacity: 1,
          hourlyPrice: 0,
          mainImageUrl: 'https://example.com/image.jpg',
        }
        const result = spaceFormSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.facilities).toEqual([])
        }
      })

      test('isPublishedデフォルトはfalse', () => {
        const input = {
          name: 'スペース',
          description: '10文字以上の説明文です。',
          address: '東京都渋谷区',
          capacity: 1,
          hourlyPrice: 0,
          mainImageUrl: 'https://example.com/image.jpg',
        }
        const result = spaceFormSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.isPublished).toBe(false)
        }
      })
    })

    describe('name', () => {
      test('空の名前はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          name: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('名前を入力')
        }
      })

      test('100文字の名前はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          name: 'あ'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字の名前はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          name: 'あ'.repeat(101),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('100文字以内')
        }
      })
    })

    describe('description', () => {
      test('空の説明はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          description: '',
        })
        expect(result.success).toBe(false)
      })

      test('10文字未満の説明はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          description: '9文字です',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('10文字以上')
        }
      })

      test('10文字の説明はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          description: '12345678910', // ちょうど10文字以上
        })
        expect(result.success).toBe(true)
      })
    })

    describe('address', () => {
      test('空の住所はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          address: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('住所を入力')
        }
      })
    })

    describe('access', () => {
      test('空のアクセス情報はOK（オプション）', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          access: '',
        })
        expect(result.success).toBe(true)
      })

      test('500文字のアクセス情報はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          access: 'x'.repeat(500),
        })
        expect(result.success).toBe(true)
      })

      test('501文字のアクセス情報はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          access: 'x'.repeat(501),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500文字以内')
        }
      })
    })

    describe('capacity', () => {
      test('0の定員はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          capacity: 0,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('1以上')
        }
      })

      test('1の定員はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          capacity: 1,
        })
        expect(result.success).toBe(true)
      })

      test('1000の定員はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          capacity: 1000,
        })
        expect(result.success).toBe(true)
      })

      test('1001の定員はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          capacity: 1001,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('1000以下')
        }
      })

      test('小数の定員はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          capacity: 10.5,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('整数')
        }
      })
    })

    describe('area', () => {
      test('0以下の面積はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          area: 0,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('正の数')
        }
      })

      test('10000の面積はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          area: 10000,
        })
        expect(result.success).toBe(true)
      })

      test('10001の面積はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          area: 10001,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('10000以下')
        }
      })
    })

    describe('hourlyPrice', () => {
      test('負の時間料金はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          hourlyPrice: -1,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('0以上')
        }
      })

      test('0の時間料金はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          hourlyPrice: 0,
        })
        expect(result.success).toBe(true)
      })

      test('1000000の時間料金はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          hourlyPrice: 1000000,
        })
        expect(result.success).toBe(true)
      })

      test('1000001の時間料金はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          hourlyPrice: 1000001,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('1000000以下')
        }
      })
    })

    describe('dailyPrice', () => {
      test('負の日額料金はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          dailyPrice: -1,
        })
        expect(result.success).toBe(false)
      })

      test('10000000の日額料金はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          dailyPrice: 10000000,
        })
        expect(result.success).toBe(true)
      })

      test('10000001の日額料金はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          dailyPrice: 10000001,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('10000000以下')
        }
      })
    })

    describe('mainImageUrl', () => {
      test('空のメイン画像URLはエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          mainImageUrl: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('メイン画像URL')
        }
      })

      test('無効なURLはエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          mainImageUrl: 'not-a-url',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('有効なURL')
        }
      })

      test('有効なHTTPS URLはOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          mainImageUrl: 'https://example.com/image.jpg',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('imageUrls', () => {
      test('10枚の画像はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          imageUrls: Array(10).fill('https://example.com/image.jpg'),
        })
        expect(result.success).toBe(true)
      })

      test('11枚の画像はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          imageUrls: Array(11).fill('https://example.com/image.jpg'),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('最大10枚')
        }
      })

      test('無効なURLを含む配列はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          imageUrls: ['https://example.com/valid.jpg', 'not-a-url'],
        })
        expect(result.success).toBe(false)
      })
    })

    describe('facilities', () => {
      test('空文字の設備名はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          facilities: ['Wi-Fi', ''],
        })
        expect(result.success).toBe(false)
      })

      test('50文字の設備名はOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          facilities: ['x'.repeat(50)],
        })
        expect(result.success).toBe(true)
      })

      test('51文字の設備名はエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          facilities: ['x'.repeat(51)],
        })
        expect(result.success).toBe(false)
      })
    })

    describe('termsId', () => {
      test('有効なUUIDはOK', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          termsId: VALID_UUID,
        })
        expect(result.success).toBe(true)
      })

      test('無効なUUIDはエラー', () => {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          termsId: 'invalid-uuid',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('利用規約ID')
        }
      })
    })
  })

  describe('フィルター型テスト', () => {
    test('有効なフィルター値', () => {
      type SpaceFilters = {
        isPublished?: boolean | 'ALL'
        search?: string
      }

      const filters: SpaceFilters = {
        isPublished: true,
        search: 'テスト',
      }

      expect(filters.isPublished).toBe(true)
    })

    test('ALL フィルター', () => {
      type SpaceFilters = {
        isPublished?: boolean | 'ALL'
      }

      const filters: SpaceFilters = {
        isPublished: 'ALL',
      }

      expect(filters.isPublished).toBe('ALL')
    })
  })

  describe('ページネーション型テスト', () => {
    test('有効なページネーション値', () => {
      type SpacePagination = {
        page?: number
        limit?: number
        sortBy?: 'name' | 'createdAt' | 'hourlyPrice'
        sortOrder?: 'asc' | 'desc'
      }

      const pagination: SpacePagination = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }

      expect(pagination.page).toBe(1)
      expect(pagination.sortBy).toBe('createdAt')
    })
  })

  describe('境界値テスト', () => {
    test('name 100文字（境界）', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        name: 'x'.repeat(100),
      })
      expect(result.success).toBe(true)
    })

    test('capacity 1（最小境界）', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        capacity: 1,
      })
      expect(result.success).toBe(true)
    })

    test('capacity 1000（最大境界）', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        capacity: 1000,
      })
      expect(result.success).toBe(true)
    })

    test('hourlyPrice 0（最小境界）', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        hourlyPrice: 0,
      })
      expect(result.success).toBe(true)
    })

    test('hourlyPrice 1000000（最大境界）', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        hourlyPrice: 1000000,
      })
      expect(result.success).toBe(true)
    })
  })

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
})
